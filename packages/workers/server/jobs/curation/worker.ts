/**
 * Cross-Episode Curation Worker
 *
 * This worker handles the curation step of the digest pipeline:
 * - Fetches all candidate clips from all episodes in the digest
 * - Uses LLM to select the best 6-8 clips for diversity and quality
 * - Creates DigestClip records linking selected clips to the digest
 *
 * Flow: analyzing_episodes → curating → generating_script
 */

import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import { useLLMClient } from "../../../providers/llm";
import {
  CURATION_SYSTEM_PROMPT,
  buildCurationPrompt,
  type CurationInput,
  type CurationOutput,
  type CandidateClip,
} from "../../../prompts/curation";

export interface CurationJobData {
  digestId: string;
  userId: string;
  episodeIds: string[];
  userInterests: string[];
  targetDuration?: number; // seconds, default 420 (7 min)
  targetClipCount?: { min: number; max: number }; // default { min: 6, max: 8 }
}

export interface CurationJobResult {
  digestId: string;
  selectedClipIds: string[];
  totalDuration: number;
  topicCoverage: string[];
  reasoning: string;
}

/**
 * Main curation worker function
 */
export default async function curationWorker(
  job: Job<CurationJobData>
): Promise<CurationJobResult> {
  const logger = useJobLogger(job);
  const prisma = usePrismaClient();
  const {
    digestId,
    userId,
    episodeIds,
    userInterests,
    targetDuration = 420,
    targetClipCount = { min: 6, max: 8 },
  } = job.data;

  logger.log(`Starting curation for digest: ${digestId}`);
  logger.log(`Episodes: ${episodeIds.length}, User: ${userId}`);
  logger.log(`Target: ${targetDuration}s (${targetClipCount.min}-${targetClipCount.max} clips)`);

  // Verify digest exists
  const digest = await prisma.digest.findUnique({
    where: { id: digestId },
  });

  if (!digest) {
    throw new Error(`Digest not found: ${digestId}`);
  }

  try {
    // ===== PHASE 1: UPDATE STATUS =====
    logger.log("Phase 1: Updating status to 'curating'");
    await prisma.digest.update({
      where: { id: digestId },
      data: { status: "curating" },
    });

    // ===== PHASE 2: FETCH CANDIDATE CLIPS =====
    logger.log("Phase 2: Fetching candidate clips from all episodes");

    const clips = await prisma.clip.findMany({
      where: {
        episodeId: { in: episodeIds },
      },
      include: {
        episode: {
          include: {
            podcast: true,
          },
        },
      },
      orderBy: {
        relevanceScore: "desc",
      },
    });

    logger.log(`Found ${clips.length} candidate clips across ${episodeIds.length} episodes`);

    if (clips.length === 0) {
      throw new Error("No candidate clips found for the specified episodes");
    }

    // Transform clips to curation input format
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

    // ===== PHASE 3: LLM CURATION =====
    logger.log("Phase 3: Calling LLM for cross-episode curation");

    const llm = useLLMClient();
    const model = llm.getDefaultModel();
    logger.log(`Using ${model} (provider: ${llm.getProvider()})`);

    const curationInput: CurationInput = {
      targetDuration,
      targetClipCount,
      userInterests,
      candidates,
    };

    const result = await llm.complete({
      messages: [
        {
          role: "system",
          content: CURATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildCurationPrompt(curationInput),
        },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    });

    logger.log(`LLM response received (${result.provider}). Tokens used: ${result.usage.totalTokens}`);

    // Parse the JSON response
    let curationResult: CurationOutput;
    try {
      let jsonContent = result.content;
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      curationResult = JSON.parse(jsonContent) as CurationOutput;
    } catch (parseError) {
      logger.error(`Failed to parse LLM response: ${result.content}`);
      throw new Error(`Failed to parse curation response: ${parseError}`);
    }

    if (!curationResult.selectedClipIds || !Array.isArray(curationResult.selectedClipIds)) {
      throw new Error("Invalid curation response: selectedClipIds array not found");
    }

    logger.log(`LLM selected ${curationResult.selectedClipIds.length} clips`);
    logger.log(`Reasoning: ${curationResult.reasoning}`);
    logger.log(`Topics covered: ${curationResult.topicCoverage.join(", ")}`);

    // ===== PHASE 4: VALIDATE SELECTED CLIPS =====
    logger.log("Phase 4: Validating selected clips");

    // Verify all selected clip IDs exist in our candidates
    const validClipIds = new Set(candidates.map((c) => c.clipId));
    const invalidIds = curationResult.selectedClipIds.filter((id) => !validClipIds.has(id));

    if (invalidIds.length > 0) {
      logger.warn(`LLM selected ${invalidIds.length} invalid clip IDs, filtering them out`);
      curationResult.selectedClipIds = curationResult.selectedClipIds.filter((id) =>
        validClipIds.has(id)
      );
    }

    // Ensure we have enough clips
    if (curationResult.selectedClipIds.length < targetClipCount.min) {
      logger.warn(
        `Only ${curationResult.selectedClipIds.length} clips selected, falling back to top-scoring clips`
      );
      // Fill with top-scoring clips not already selected
      const selectedSet = new Set(curationResult.selectedClipIds);
      for (const candidate of candidates) {
        if (!selectedSet.has(candidate.clipId)) {
          curationResult.selectedClipIds.push(candidate.clipId);
          selectedSet.add(candidate.clipId);
        }
        if (curationResult.selectedClipIds.length >= targetClipCount.min) break;
      }
    }

    // ===== PHASE 5: CREATE DIGEST CLIPS =====
    logger.log("Phase 5: Creating DigestClip records");

    // Delete any existing digest clips for this digest
    await prisma.digestClip.deleteMany({
      where: { digestId },
    });

    // Create new digest clips in order
    let totalDuration = 0;
    for (let i = 0; i < curationResult.selectedClipIds.length; i++) {
      const clipId = curationResult.selectedClipIds[i];
      const candidate = candidates.find((c) => c.clipId === clipId);

      if (!candidate) continue;

      await prisma.digestClip.create({
        data: {
          digestId,
          clipId,
          order: i,
        },
      });

      totalDuration += candidate.duration;
      logger.log(
        `Added clip ${i + 1}: ${clipId} from "${candidate.episodeTitle}" (${candidate.duration.toFixed(1)}s, score: ${candidate.relevanceScore})`
      );
    }

    // ===== PHASE 6: UPDATE DIGEST =====
    logger.log("Phase 6: Updating digest with curation results");

    // Update digest status to pending (ready for digest generation)
    // Note: The actual digest generation worker expects "pending" status
    // Clear narratorScript if it exists - it needs regeneration for the new clip selection
    await prisma.digest.update({
      where: { id: digestId },
      data: {
        status: "pending",
        // Store curation metadata for reference
        episodeIds: episodeIds,
        // Clear old script so it gets regenerated with correct clip count
        narratorScript: null,
      },
    });

    logger.log(
      `Curation completed. Selected ${curationResult.selectedClipIds.length} clips, total duration: ${totalDuration.toFixed(1)}s`
    );

    return {
      digestId,
      selectedClipIds: curationResult.selectedClipIds,
      totalDuration,
      topicCoverage: curationResult.topicCoverage,
      reasoning: curationResult.reasoning,
    };
  } catch (error) {
    logger.error(`Curation failed: ${error}`);

    await prisma.digest.update({
      where: { id: digestId },
      data: { status: "failed" },
    });

    throw error;
  }
}
