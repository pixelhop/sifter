/**
 * Digest Generation Worker
 *
 * This worker handles the digest generation pipeline:
 * 1. Generate narrator scripts using GPT-5-mini
 * 2. Generate audio using ElevenLabs TTS
 * 3. Stitch everything together using FFmpeg
 *
 * Flow: pending → generating_script → generating_audio → stitching → ready
 */

import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import { useTTSProvider } from "../../../providers/tts";
import { useLLMClient } from "../../../providers/llm";
import {
  downloadAudio,
  ensureTempDir,
  cleanupDownload,
} from "../../../utils/download";
import {
  sliceClip,
  concatenateClips,
  getTempChunkDir,
} from "../../../utils/ffmpeg";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  FULL_SCRIPT_SYSTEM_PROMPT,
  buildFullScriptPrompt,
  type FullScriptInput,
  type NarratorScripts,
} from "../../../prompts/narrator-scripts";

export interface DigestJobData {
  digestId: string;
  userId: string;
  clipIds: string[];
  podcastId: string;
  episodeIds: string[];
  /** Skip script generation and use existing narratorScript from database */
  skipScriptGeneration?: boolean;
  /** Skip TTS generation and use these paths for narrator audio */
  existingTTSPaths?: {
    introPath: string;
    transitionPaths: string[];
    outroPath: string;
  };
}

export interface DigestJobResult {
  digestId: string;
  audioUrl: string;
  duration: number;
  status: "ready" | "failed";
}

/**
 * Generate narrator scripts using LLM
 */
async function generateNarratorScripts(
  digestId: string,
  podcastTitle: string,
  clips: Array<{
    podcastTitle: string;
    episodeTitle: string;
    summary: string;
    keyInsight?: string;
    duration: number;
  }>,
  totalDuration: number,
  userName?: string,
  logger?: ReturnType<typeof useJobLogger>
): Promise<NarratorScripts> {
  const llm = useLLMClient();
  const model = llm.getDefaultModel();
  logger?.log(`Generating narrator scripts with ${model} (provider: ${llm.getProvider()})`);

  const input: FullScriptInput = {
    userName,
    podcastTitle,
    clips,
    totalDuration,
  };

  const result = await llm.complete({
    messages: [
      {
        role: "system",
        content: FULL_SCRIPT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildFullScriptPrompt(input),
      },
    ],
    maxTokens: 2000,
  });

  logger?.log(`LLM response received (${result.provider}). Tokens used: ${result.usage.totalTokens}`);

  // Parse the JSON response
  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = result.content;
    const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }
    const scripts = JSON.parse(jsonContent) as NarratorScripts;

    // Validate structure
    if (!scripts.intro || !Array.isArray(scripts.transitions) || !scripts.outro) {
      throw new Error("Invalid script format");
    }

    return scripts;
  } catch (parseError) {
    logger?.error(`Failed to parse LLM response: ${result.content}`);
    throw new Error(`Failed to parse narrator scripts: ${parseError}`);
  }
}

/**
 * Generate TTS audio for all scripts
 */
async function generateNarratorAudio(
  scripts: NarratorScripts,
  outputDir: string,
  logger?: ReturnType<typeof useJobLogger>
): Promise<{
  introPath: string;
  transitionPaths: string[];
  outroPath: string;
  totalDuration: number;
}> {
  logger?.log("Generating narrator audio with ElevenLabs TTS");

  const tts = useTTSProvider();
  logger?.log(`Using TTS provider: ${tts.name}`);

  // Generate intro audio
  const introPath = path.join(outputDir, "narrator_intro.mp3");
  logger?.log("Generating intro audio...");
  const introResult = await tts.generate(scripts.intro, introPath);
  logger?.log(`Intro audio generated: ${introResult.duration}s`);

  // Generate transition audios
  const transitionPaths: string[] = [];
  for (let i = 0; i < scripts.transitions.length; i++) {
    const transitionPath = path.join(outputDir, `narrator_transition_${i}.mp3`);
    logger?.log(`Generating transition ${i + 1}/${scripts.transitions.length}...`);
    await tts.generate(scripts.transitions[i], transitionPath);
    transitionPaths.push(transitionPath);
  }

  // Generate outro audio
  const outroPath = path.join(outputDir, "narrator_outro.mp3");
  logger?.log("Generating outro audio...");
  const outroResult = await tts.generate(scripts.outro, outroPath);
  logger?.log(`Outro audio generated: ${outroResult.duration}s`);

  const totalDuration =
    introResult.duration +
    transitionPaths.length * 5 + // Estimate 5s per transition
    outroResult.duration;

  return {
    introPath,
    transitionPaths,
    outroPath,
    totalDuration,
  };
}

/**
 * Download and slice clip from episode
 */
async function extractClipAudio(
  clipId: string,
  audioUrl: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  logger?: ReturnType<typeof useJobLogger>
): Promise<void> {
  // Download full episode audio
  const tempEpisodePath = outputPath.replace(".mp3", "_full.mp3");

  logger?.log(`Downloading episode audio for clip ${clipId}...`);
  await downloadAudio(audioUrl, tempEpisodePath);

  try {
    // Slice the clip with fade in/out
    logger?.log(`Slicing clip ${clipId} (${startTime}s - ${endTime}s)...`);
    await sliceClip(tempEpisodePath, outputPath, {
      startTime,
      endTime,
      fadeIn: 0.3,
      fadeOut: 0.3,
    });
  } finally {
    // Cleanup full episode download
    await cleanupDownload(tempEpisodePath);
  }
}

/**
 * Stitch all audio components together
 */
async function stitchDigest(
  introPath: string,
  transitionPaths: string[],
  outroPath: string,
  clipPaths: string[],
  outputPath: string,
  logger?: ReturnType<typeof useJobLogger>
): Promise<number> {
  logger?.log("Stitching digest audio...");
  logger?.log(`Components: intro, ${clipPaths.length} clips, ${transitionPaths.length} transitions, outro`);

  // Build the sequence: intro → clip1 → transition1 → clip2 → ... → outro
  const sequence: string[] = [introPath];

  for (let i = 0; i < clipPaths.length; i++) {
    sequence.push(clipPaths[i]);

    // Add transition after each clip except the last one
    if (i < transitionPaths.length) {
      sequence.push(transitionPaths[i]);
    }
  }

  sequence.push(outroPath);

  logger?.log(`Concatenating ${sequence.length} audio files...`);
  await concatenateClips(sequence, outputPath);

  // Get final duration
  const stats = await fs.promises.stat(outputPath);
  // Rough estimate: MP3 at 128kbps is ~16KB per second
  const estimatedDuration = Math.round(stats.size / (128 * 1024 / 8));

  logger?.log(`Digest stitched successfully: ${estimatedDuration}s estimated duration`);

  return estimatedDuration;
}

/**
 * Main digest worker function
 */
export default async function digestWorker(
  job: Job<DigestJobData>
): Promise<DigestJobResult> {
  const logger = useJobLogger(job);
  const prisma = usePrismaClient();
  const { digestId, userId, clipIds, podcastId, skipScriptGeneration, existingTTSPaths } = job.data;

  logger.log(`Starting digest generation: ${digestId}`);
  logger.log(`User: ${userId}, Clips: ${clipIds.length}`);
  if (skipScriptGeneration) {
    logger.log("Mode: Skip script generation (using existing narratorScript)");
  }
  if (existingTTSPaths) {
    logger.log("Mode: Skip TTS generation (using existing audio files)");
  }

  // Verify digest exists
  const digest = await prisma.digest.findUnique({
    where: { id: digestId },
    include: {
      user: true,
      digestClips: {
        include: {
          clip: {
            include: {
              episode: {
                include: {
                  podcast: true,
                },
              },
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!digest) {
    throw new Error(`Digest not found: ${digestId}`);
  }

  // Get podcast info (use digest.podcastId as fallback)
  const effectivePodcastId = podcastId || (digest as any).podcastId;
  const podcast = await prisma.podcast.findUnique({
    where: { id: effectivePodcastId },
  });

  if (!podcast) {
    throw new Error(`Podcast not found: ${effectivePodcastId}`);
  }

  let tempDir: string | null = null;
  const cleanupFiles: string[] = [];

  try {
    // ===== PHASE 1: GENERATE SCRIPTS =====
    let scripts: NarratorScripts;

    if (skipScriptGeneration && digest.narratorScript) {
      // Use existing script from database
      logger.log("Phase 1: Using existing narrator scripts from database");
      scripts = JSON.parse(digest.narratorScript) as NarratorScripts;
      logger.log(`Loaded scripts: intro (${scripts.intro.length} chars), ${scripts.transitions.length} transitions, outro (${scripts.outro.length} chars)`);
    } else {
      // Generate new scripts
      logger.log("Phase 1: Generating narrator scripts");
      await prisma.digest.update({
        where: { id: digestId },
        data: { status: "generating_script" },
      });

      // Prepare clip info for script generation
      const clipInfos = digest.digestClips.map((dc) => ({
        podcastTitle: dc.clip.episode.podcast.title,
        episodeTitle: dc.clip.episode.title,
        summary: dc.clip.summary || "Interesting clip",
        keyInsight: dc.clip.summary || undefined,
        duration: dc.clip.duration,
      }));

      const totalDuration = clipInfos.reduce((sum, c) => sum + c.duration, 0);

      scripts = await generateNarratorScripts(
        digestId,
        podcast.title,
        clipInfos,
        totalDuration / 60, // Convert to minutes
        digest.user.name || undefined,
        logger
      );

      logger.log(`Scripts generated: intro (${scripts.intro.length} chars), ${scripts.transitions.length} transitions, outro (${scripts.outro.length} chars)`);

      // Save scripts to database
      await prisma.digest.update({
        where: { id: digestId },
        data: {
          narratorScript: JSON.stringify(scripts),
        },
      });
    }

    // ===== PHASE 2: GENERATE AUDIO =====
    await ensureTempDir();
    tempDir = getTempChunkDir(digestId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    let narratorAudio: {
      introPath: string;
      transitionPaths: string[];
      outroPath: string;
      totalDuration: number;
    };

    if (existingTTSPaths) {
      // Use existing TTS files
      logger.log("Phase 2: Using existing TTS audio files");

      // Verify files exist
      const filesToCheck = [
        existingTTSPaths.introPath,
        ...existingTTSPaths.transitionPaths,
        existingTTSPaths.outroPath,
      ];

      for (const filePath of filesToCheck) {
        if (!fs.existsSync(filePath)) {
          throw new Error(`Existing TTS file not found: ${filePath}`);
        }
      }

      narratorAudio = {
        ...existingTTSPaths,
        totalDuration: 0, // Will be calculated from actual file durations
      };

      logger.log(`Using existing TTS: intro, ${existingTTSPaths.transitionPaths.length} transitions, outro`);
    } else {
      // Generate new TTS audio
      logger.log("Phase 2: Generating narrator audio with ElevenLabs TTS");
      await prisma.digest.update({
        where: { id: digestId },
        data: { status: "generating_audio" },
      });

      narratorAudio = await generateNarratorAudio(scripts, tempDir, logger);
      cleanupFiles.push(
        narratorAudio.introPath,
        ...narratorAudio.transitionPaths,
        narratorAudio.outroPath
      );
    }

    // ===== PHASE 3: EXTRACT CLIPS =====
    logger.log("Phase 3: Extracting clip audio");

    const clipPaths: string[] = [];
    for (let i = 0; i < digest.digestClips.length; i++) {
      const dc = digest.digestClips[i];
      const clipPath = path.join(tempDir, `clip_${i}.mp3`);

      await extractClipAudio(
        dc.clip.id,
        dc.clip.episode.audioUrl,
        dc.clip.startTime,
        dc.clip.endTime,
        clipPath,
        logger
      );

      clipPaths.push(clipPath);
      cleanupFiles.push(clipPath);

      // Update progress
      await job.updateProgress(50 + Math.round(((i + 1) / digest.digestClips.length) * 30));
    }

    // ===== PHASE 4: STITCHING =====
    logger.log("Phase 4: Stitching final digest");
    await prisma.digest.update({
      where: { id: digestId },
      data: { status: "stitching" },
    });

    const finalOutputPath = path.join(tempDir, "final_digest.mp3");
    const finalDuration = await stitchDigest(
      narratorAudio.introPath,
      narratorAudio.transitionPaths,
      narratorAudio.outroPath,
      clipPaths,
      finalOutputPath,
      logger
    );

    // ===== PHASE 5: UPLOAD & SAVE =====
    logger.log("Phase 5: Uploading final audio");

    // For now, store locally (in production, upload to S3/CDN)
    const finalDir = "/tmp/sifter/digests";
    await fs.promises.mkdir(finalDir, { recursive: true });

    const finalFilename = `${digestId}.mp3`;
    const finalDestPath = path.join(finalDir, finalFilename);

    await fs.promises.copyFile(finalOutputPath, finalDestPath);
    cleanupFiles.push(finalOutputPath);

    // In production, upload to S3 and get URL:
    // const audioUrl = await uploadToS3(finalOutputPath, `digests/${finalFilename}`);
    const audioUrl = `/audio/digests/${finalFilename}`;

    // Update digest as ready
    await prisma.digest.update({
      where: { id: digestId },
      data: {
        status: "ready",
        audioUrl,
        duration: finalDuration,
      },
    });

    logger.log(`Digest generation completed: ${digestId}`);
    logger.log(`Final audio: ${audioUrl}, Duration: ${finalDuration}s`);

    return {
      digestId,
      audioUrl,
      duration: finalDuration,
      status: "ready",
    };
  } catch (error) {
    logger.error(`Digest generation failed: ${error}`);

    await prisma.digest.update({
      where: { id: digestId },
      data: { status: "failed" },
    });

    throw error;
  } finally {
    // Cleanup temp files
    if (tempDir) {
      logger.log(`Cleaning up temp files`);
      for (const file of cleanupFiles) {
        try {
          await fs.promises.unlink(file);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
