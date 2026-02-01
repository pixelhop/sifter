#!/usr/bin/env tsx
/**
 * Full Pipeline Test - Curation + Script + Audio Generation
 *
 * This script runs the complete pipeline end-to-end:
 * 1. Curation (if needed)
 * 2. Script Generation
 * 3. TTS Audio Generation
 * 4. Audio Stitching
 */

import { PrismaClient } from "@prisma/client";
import { useLLMClient } from "../packages/workers/providers/llm";
import { createTTSProvider } from "../packages/workers/providers/tts";
import {
  CURATION_SYSTEM_PROMPT,
  buildCurationPrompt,
  type CurationInput,
  type CurationOutput,
  type CandidateClip,
} from "../packages/workers/prompts/curation";
import {
  FULL_SCRIPT_SYSTEM_PROMPT,
  buildFullScriptPrompt,
  type FullScriptInput,
  type NarratorScripts,
} from "../packages/workers/prompts/narrator-scripts";
import {
  downloadAudio,
  ensureTempDir,
  cleanupDownload,
} from "../packages/workers/utils/download";
import {
  sliceClip,
  concatenateClips,
  getTempChunkDir,
} from "../packages/workers/utils/ffmpeg";
import * as path from "node:path";
import * as fs from "node:fs";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:54328/postgres",
    },
  },
});

const DIGEST_ID = "015b49d2-0ad8-4e8b-81b8-e8c449f10f22";

async function runCuration(): Promise<{ candidates: CandidateClip[]; totalDuration: number }> {
  console.log("🎯 PHASE 1: CURATION\n");

  const digest = await prisma.digest.findUnique({ where: { id: DIGEST_ID } });
  if (!digest) throw new Error("Digest not found");

  // Check if already curated
  const existingClips = await prisma.digestClip.count({ where: { digestId: DIGEST_ID } });
  if (existingClips > 0 && digest.narratorScript) {
    console.log(`✅ Already curated with ${existingClips} clips`);
    const digestClips = await prisma.digestClip.findMany({
      where: { digestId: DIGEST_ID },
      include: { clip: { include: { episode: { include: { podcast: true } } } } },
      orderBy: { order: "asc" },
    });
    const candidates = digestClips.map((dc) => ({
      clipId: dc.clip.id,
      episodeId: dc.clip.episodeId,
      episodeTitle: dc.clip.episode.title,
      podcastId: dc.clip.episode.podcastId,
      podcastTitle: dc.clip.episode.podcast.title,
      summary: dc.clip.summary || "Interesting clip",
      relevanceScore: dc.clip.relevanceScore,
      duration: dc.clip.duration,
      startTime: dc.clip.startTime,
      endTime: dc.clip.endTime,
      transcript: dc.clip.transcript,
    }));
    const totalDuration = candidates.reduce((sum, c) => sum + c.duration, 0);
    return { candidates, totalDuration };
  }

  const episodeIds = digest.episodeIds;
  console.log(`Episodes: ${episodeIds.length}`);

  const clips = await prisma.clip.findMany({
    where: { episodeId: { in: episodeIds } },
    include: { episode: { include: { podcast: true } } },
    orderBy: { relevanceScore: "desc" },
  });
  console.log(`Candidate clips: ${clips.length}\n`);

  const candidates: CandidateClip[] = clips.map((clip) => ({
    clipId: clip.id,
    episodeId: clip.episodeId,
    episodeTitle: clip.episode.title,
    podcastId: clip.episode.podcastId,
    podcastTitle: clip.episode.podcast.title,
    summary: clip.summary || "Interesting clip",
    relevanceScore: clip.relevanceScore,
    duration: clip.duration,
    startTime: clip.startTime,
    endTime: clip.endTime,
    transcript: clip.transcript,
  }));

  const llm = useLLMClient();
  const curationModel = "gpt-4o";
  console.log(`🤖 Calling ${curationModel} for curation...`);

  const curationInput: CurationInput = {
    targetDuration: 420,
    targetClipCount: { min: 6, max: 8 },
    userInterests: ["startups", "growth", "business ideas"],
    candidates,
  };

  const result = await llm.complete({
    model: curationModel,
    messages: [
      { role: "system", content: CURATION_SYSTEM_PROMPT },
      { role: "user", content: buildCurationPrompt(curationInput) },
    ],
    temperature: 0.7,
    maxTokens: 2000,
  });

  console.log(`✅ Curation complete. Tokens: ${result.usage.totalTokens}\n`);

  let jsonContent = result.content;
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonContent = jsonMatch[1];
  const curationResult: CurationOutput = JSON.parse(jsonContent);

  console.log(`Selected: ${curationResult.selectedClipIds.length} clips`);
  console.log(`Topics: ${curationResult.topicCoverage.join(", ")}\n`);

  await prisma.digestClip.deleteMany({ where: { digestId: DIGEST_ID } });

  let totalDuration = 0;
  for (let i = 0; i < curationResult.selectedClipIds.length; i++) {
    const clipId = curationResult.selectedClipIds[i];
    const candidate = candidates.find((c) => c.clipId === clipId)!;

    await prisma.digestClip.create({
      data: { digestId: DIGEST_ID, clipId, order: i },
    });

    totalDuration += candidate.duration;
    console.log(`  ${i + 1}. [${candidate.relevanceScore}] ${candidate.podcastTitle} | ${candidate.episodeTitle.substring(0, 50)}... (${Math.round(candidate.duration)}s)`);
  }

  await prisma.digest.update({
    where: { id: DIGEST_ID },
    data: { status: "pending", narratorScript: null },
  });

  console.log(`\n📊 Total clip duration: ${Math.round(totalDuration)}s\n`);

  return {
    candidates: curationResult.selectedClipIds.map((id) => candidates.find((c) => c.clipId === id)!),
    totalDuration,
  };
}

async function generateScript(candidates: CandidateClip[]): Promise<NarratorScripts> {
  console.log("📝 PHASE 2: SCRIPT GENERATION\n");

  const digest = await prisma.digest.findUnique({
    where: { id: DIGEST_ID },
    include: { user: true },
  });

  // Check if script already exists
  if (digest?.narratorScript) {
    console.log("✅ Script already exists, using existing");
    return typeof digest.narratorScript === 'string'
      ? JSON.parse(digest.narratorScript)
      : digest.narratorScript;
  }

  const llm = useLLMClient();
  const scriptModel = "gpt-4o";
  console.log(`🤖 Calling ${scriptModel} for script...`);

  const input: FullScriptInput = {
    userName: digest?.user?.name || undefined,
    podcastTitle: "Multi-Podcast Digest",
    clips: candidates.map((c) => ({
      podcastTitle: c.podcastTitle,
      episodeTitle: c.episodeTitle,
      summary: c.summary,
      keyInsight: c.summary,
      duration: c.duration,
    })),
    totalDuration: candidates.reduce((sum, c) => sum + c.duration, 0) / 60,
  };

  const result = await llm.complete({
    model: scriptModel,
    messages: [
      { role: "system", content: FULL_SCRIPT_SYSTEM_PROMPT },
      { role: "user", content: buildFullScriptPrompt(input) },
    ],
    maxTokens: 2000,
  });

  console.log(`✅ Script generated. Tokens: ${result.usage.totalTokens}\n`);

  let jsonContent = result.content;
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonContent = jsonMatch[1];
  const script: NarratorScripts = JSON.parse(jsonContent);

  if (script.transitions.length !== candidates.length - 1) {
    console.error(`❌ MISMATCH: ${candidates.length} clips but ${script.transitions.length} transitions!`);
  } else {
    console.log(`✅ Script validation: ${candidates.length} clips, ${script.transitions.length} transitions\n`);
  }

  await prisma.digest.update({
    where: { id: DIGEST_ID },
    data: { narratorScript: JSON.stringify(script), status: "generating_audio" },
  });

  return script;
}

async function generateAudio(script: NarratorScripts): Promise<{ introPath: string; transitionPaths: string[]; outroPath: string }> {
  console.log("🎙️ PHASE 3: TTS AUDIO GENERATION\n");

  await ensureTempDir();
  const tempDir = getTempChunkDir(DIGEST_ID);
  await fs.promises.mkdir(tempDir, { recursive: true });

  // Create TTS provider from environment variables
  const ttsProvider = process.env.TTS_PROVIDER || "elevenlabs";
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoice = process.env.TTS_DEFAULT_VOICE || "Adam";

  const tts = createTTSProvider({
    provider: apiKey ? (ttsProvider as "elevenlabs" | "mock") : "mock",
    apiKey,
    defaultVoice,
  });
  console.log(`Using TTS provider: ${tts.name}\n`);

  // Generate intro
  const introPath = path.join(tempDir, "narrator_intro.mp3");
  console.log("🎵 Generating intro audio...");
  const introResult = await tts.generate(script.intro, introPath);
  console.log(`✅ Intro: ${introResult.duration}s\n`);

  // Generate transitions
  const transitionPaths: string[] = [];
  for (let i = 0; i < script.transitions.length; i++) {
    const transitionPath = path.join(tempDir, `narrator_transition_${i}.mp3`);
    console.log(`🎵 Generating transition ${i + 1}/${script.transitions.length}...`);
    await tts.generate(script.transitions[i], transitionPath);
    transitionPaths.push(transitionPath);
    console.log(`✅ Transition ${i + 1} done\n`);
  }

  // Generate outro
  const outroPath = path.join(tempDir, "narrator_outro.mp3");
  console.log("🎵 Generating outro audio...");
  const outroResult = await tts.generate(script.outro, outroPath);
  console.log(`✅ Outro: ${outroResult.duration}s\n`);

  return { introPath, transitionPaths, outroPath };
}

async function extractClipAudio(candidates: CandidateClip[], tempDir: string): Promise<string[]> {
  console.log("✂️ PHASE 4: EXTRACTING CLIP AUDIO\n");

  const clipPaths: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const clipPath = path.join(tempDir, `clip_${i}.mp3`);

    console.log(`📥 Downloading episode for clip ${i + 1}/${candidates.length}...`);
    const tempEpisodePath = clipPath.replace(".mp3", "_full.mp3");

    // Get episode audio URL from database
    const clip = await prisma.clip.findUnique({
      where: { id: candidate.clipId },
      include: { episode: true },
    });

    if (!clip?.episode.audioUrl) {
      console.error(`❌ No audio URL for clip ${candidate.clipId}`);
      continue;
    }

    await downloadAudio(clip.episode.audioUrl, tempEpisodePath);

    console.log(`✂️ Slicing clip ${i + 1} (${candidate.startTime}s - ${candidate.endTime}s)...`);
    await sliceClip(tempEpisodePath, clipPath, {
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      fadeIn: 0.3,
      fadeOut: 0.3,
    });

    await cleanupDownload(tempEpisodePath);
    clipPaths.push(clipPath);
    console.log(`✅ Clip ${i + 1} extracted\n`);
  }

  return clipPaths;
}

async function stitchFinalDigest(
  introPath: string,
  transitionPaths: string[],
  outroPath: string,
  clipPaths: string[],
  tempDir: string
): Promise<{ finalPath: string; duration: number }> {
  console.log("🧵 PHASE 5: STITCHING FINAL DIGEST\n");

  const outputPath = path.join(tempDir, "final_digest.mp3");

  // Build sequence: intro → clip1 → transition1 → clip2 → ... → outro
  const sequence: string[] = [introPath];
  for (let i = 0; i < clipPaths.length; i++) {
    sequence.push(clipPaths[i]);
    if (i < transitionPaths.length) {
      sequence.push(transitionPaths[i]);
    }
  }
  sequence.push(outroPath);

  console.log(`Stitching ${sequence.length} audio files...`);
  await concatenateClips(sequence, outputPath);

  // Estimate duration
  const stats = await fs.promises.stat(outputPath);
  const duration = Math.round(stats.size / (128 * 1024 / 8));

  console.log(`✅ Final digest stitched: ${duration}s\n`);

  // Copy to final location
  const finalDir = "/tmp/sifter/digests";
  await fs.promises.mkdir(finalDir, { recursive: true });
  const finalPath = path.join(finalDir, `${DIGEST_ID}.mp3`);
  await fs.promises.copyFile(outputPath, finalPath);

  console.log(`💾 Saved to: ${finalPath}\n`);

  return { finalPath, duration };
}

async function displayScript(script: NarratorScripts, candidates: CandidateClip[]) {
  console.log("═══════════════════════════════════════════════════\n");
  console.log("🎵 INTRO:");
  console.log(`   "${script.intro}"\n`);

  script.transitions.forEach((transition, i) => {
    const nextClip = candidates[i + 1];
    console.log(`🎵 TRANSITION ${i + 1} → Clip ${i + 2}:`);
    console.log(`   "${transition}"`);
    if (nextClip) {
      console.log(`   (Next: ${nextClip.podcastTitle} - ${nextClip.episodeTitle.substring(0, 40)}...)\n`);
    }
  });

  console.log(`🎵 OUTRO:`);
  console.log(`   "${script.outro}"\n`);
  console.log("═══════════════════════════════════════════════════\n");
}

async function main() {
  console.log("🚀 SIFTER FULL PIPELINE\n");
  console.log("Digest:", DIGEST_ID);
  console.log("Model:", process.env.DEFAULT_LLM_MODEL || "gpt-4o");
  console.log("\n" + "=".repeat(50) + "\n");

  try {
    // Phase 1: Curation
    const { candidates, totalDuration: clipDuration } = await runCuration();

    // Phase 2: Script Generation
    const script = await generateScript(candidates);
    displayScript(script, candidates);

    // Phase 3: TTS Audio Generation
    const { introPath, transitionPaths, outroPath } = await generateAudio(script);

    // Phase 4: Extract Clip Audio
    const tempDir = getTempChunkDir(DIGEST_ID);
    const clipPaths = await extractClipAudio(candidates, tempDir);

    // Phase 5: Stitch Final Digest
    const { finalPath, duration } = await stitchFinalDigest(
      introPath,
      transitionPaths,
      outroPath,
      clipPaths,
      tempDir
    );

    // Update digest as ready
    await prisma.digest.update({
      where: { id: DIGEST_ID },
      data: {
        status: "ready",
        audioUrl: `/audio/digests/${DIGEST_ID}.mp3`,
        duration,
      },
    });

    console.log("✅ FULL PIPELINE COMPLETE!");
    console.log(`\n📊 Final digest:`);
    console.log(`   Duration: ${Math.round(duration / 60)} min ${duration % 60}s`);
    console.log(`   File: ${finalPath}`);
    console.log(`\n🎧 Listen at: http://localhost:3010/api/digests/${DIGEST_ID}/audio`);

  } catch (error) {
    console.error("\n❌ Pipeline failed:", error);
    await prisma.digest.update({
      where: { id: DIGEST_ID },
      data: { status: "failed" },
    }).catch(() => {});
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
