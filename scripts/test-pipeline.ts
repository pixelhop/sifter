#!/usr/bin/env tsx
/**
 * Test curation and script generation pipeline
 */

import { PrismaClient } from "@prisma/client";
import { useLLMClient } from "../packages/workers/providers/llm";
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

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:54328/postgres",
    },
  },
});

const DIGEST_ID = "015b49d2-0ad8-4e8b-81b8-e8c449f10f22";

async function runCuration() {
  console.log("🎯 PHASE 1: CURATION\n");

  const digest = await prisma.digest.findUnique({
    where: { id: DIGEST_ID },
  });

  if (!digest) throw new Error("Digest not found");

  const episodeIds = digest.episodeIds;
  console.log(`Episodes: ${episodeIds.length}`);

  // Fetch all candidate clips
  const clips = await prisma.clip.findMany({
    where: { episodeId: { in: episodeIds } },
    include: {
      episode: { include: { podcast: true } },
    },
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

  // Call LLM for curation
  // Use GPT-4o for curation (high quality, supports temperature)
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

  // Parse result
  let jsonContent = result.content;
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonContent = jsonMatch[1];
  const curationResult: CurationOutput = JSON.parse(jsonContent);

  console.log(`Selected: ${curationResult.selectedClipIds.length} clips`);
  console.log(`Topics: ${curationResult.topicCoverage.join(", ")}`);
  console.log(`Reasoning: ${curationResult.reasoning}\n`);

  // Save to database
  await prisma.digestClip.deleteMany({ where: { digestId: DIGEST_ID } });

  let totalDuration = 0;
  for (let i = 0; i < curationResult.selectedClipIds.length; i++) {
    const clipId = curationResult.selectedClipIds[i];
    const candidate = candidates.find((c) => c.clipId === clipId)!;

    await prisma.digestClip.create({
      data: {
        digestId: DIGEST_ID,
        clipId,
        order: i,
      },
    });

    totalDuration += candidate.duration;
    console.log(`  ${i + 1}. [${candidate.relevanceScore}] ${candidate.podcastTitle} | ${candidate.episodeTitle.substring(0, 50)}... (${Math.round(candidate.duration)}s)`);
  }

  await prisma.digest.update({
    where: { id: DIGEST_ID },
    data: {
      status: "pending",
      narratorScript: null, // Clear any old script
    },
  });

  console.log(`\n📊 Total clip duration: ${Math.round(totalDuration)}s\n`);

  return {
    selectedClipIds: curationResult.selectedClipIds,
    totalDuration,
    candidates: curationResult.selectedClipIds.map((id) => candidates.find((c) => c.clipId === id)!),
  };
}

async function generateScript(candidates: CandidateClip[]) {
  console.log("📝 PHASE 2: SCRIPT GENERATION\n");

  const digest = await prisma.digest.findUnique({
    where: { id: DIGEST_ID },
    include: { user: true },
  });

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

  // Parse script
  let jsonContent = result.content;
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonContent = jsonMatch[1];
  const script: NarratorScripts = JSON.parse(jsonContent);

  // Validate script matches clip count
  if (script.transitions.length !== candidates.length - 1) {
    console.error(`❌ MISMATCH: ${candidates.length} clips but ${script.transitions.length} transitions!`);
  } else {
    console.log(`✅ Script validation passed: ${candidates.length} clips, ${script.transitions.length} transitions\n`);
  }

  // Save script
  await prisma.digest.update({
    where: { id: DIGEST_ID },
    data: {
      narratorScript: JSON.stringify(script),
      status: "pending",
    },
  });

  return script;
}

function displayScript(script: NarratorScripts, candidates: CandidateClip[]) {
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

  // Duration estimate
  const clipDuration = candidates.reduce((sum, c) => sum + c.duration, 0);
  const scriptWords = script.intro.split(" ").length +
    script.transitions.join(" ").split(" ").length +
    script.outro.split(" ").length;
  const scriptDuration = scriptWords / 2; // ~2 words per second

  console.log("📊 DURATION ESTIMATE:");
  console.log(`   Clips: ${Math.round(clipDuration)}s`);
  console.log(`   Narrator: ~${Math.round(scriptDuration)}s`);
  console.log(`   Total: ~${Math.round((clipDuration + scriptDuration) / 60)} min\n`);
}

async function main() {
  console.log("🚀 SIFTER PIPELINE TEST\n");
  console.log("Digest:", DIGEST_ID);
  console.log("Model:", process.env.DEFAULT_LLM_MODEL || "gpt-4o");
  console.log("\n" + "=".repeat(50) + "\n");

  try {
    // Phase 1: Curation
    const { selectedClipIds, totalDuration, candidates } = await runCuration();

    // Phase 2: Script Generation
    const script = await generateScript(candidates);

    // Display results
    displayScript(script, candidates);

    console.log("✅ Pipeline test complete!");
    console.log("\nNext step: Generate audio with:");
    console.log(`   curl -X POST http://localhost:3010/api/digests/${DIGEST_ID}/generate \\\n     -H "Authorization: Bearer b111046e-2dd1-44c4-840c-b4f971a69bfb"`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
