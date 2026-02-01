import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import {
  CLIP_SELECTION_SYSTEM_PROMPT,
  buildClipSelectionPrompt,
  type ClipSelectionInput,
  type ClipSelectionOutput,
} from "../../../prompts/clip-selection";
import { useLLMClient } from "../../../providers/llm";

export interface AnalysisJobData {
  episodeId: string;
  userId: string;
  userInterests: string[];
}

export interface AnalysisJobResult {
  episodeId: string;
  userId: string;
  clips: Array<{
    id: string;
    startTime: number;
    endTime: number;
    transcript: string;
    relevanceScore: number;
    reasoning: string;
    summary: string;
  }>;
}

/**
 * Analysis worker
 * Uses GPT-4 to analyze transcripts and identify relevant clips for users
 *
 * Flow: transcribed → analyzing → analyzed
 */
export default async function analysisWorker(
  job: Job<AnalysisJobData>
): Promise<AnalysisJobResult> {
  const logger = useJobLogger(job);
  const prisma = usePrismaClient();
  const { episodeId, userId, userInterests } = job.data;

  logger.log(`Starting analysis for episode: ${episodeId}`);
  logger.log(`User: ${userId}`);
  logger.log(`Interests: ${userInterests.length > 0 ? userInterests.join(", ") : "None provided"}`);

  // Verify episode exists and check current status
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      podcast: true,
    },
  });

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`);
  }

  // Check if already analyzed (deduplication)
  if (episode.status === "analyzed") {
    logger.log(`Episode already analyzed, fetching existing clips: ${episodeId}`);
    const existingClips = await prisma.clip.findMany({
      where: { episodeId },
      orderBy: { relevanceScore: "desc" },
    });

    logger.log(`Found ${existingClips.length} existing clips`);

    return {
      episodeId,
      userId,
      clips: existingClips.map((clip) => ({
        id: clip.id,
        startTime: clip.startTime,
        endTime: clip.endTime,
        transcript: clip.transcript,
        relevanceScore: clip.relevanceScore,
        reasoning: clip.reasoning || "",
        summary: clip.summary || "",
      })),
    };
  }

  // Check if transcript exists
  if (!episode.transcript) {
    throw new Error(`Episode ${episodeId} has no transcript. Run transcription first.`);
  }

  // Check if already being analyzed
  if (episode.status === "analyzing") {
    logger.log(`Episode already being analyzed, skipping: ${episodeId}`);
    throw new Error(`Episode ${episodeId} is already being analyzed`);
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, interests: true },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  try {
    // ===== PHASE 1: ANALYZING =====
    logger.log(`Updating status to 'analyzing'`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "analyzing" },
    });

    // ===== PHASE 2: LLM ANALYSIS =====
    const llm = useLLMClient();
    const model = llm.getDefaultModel();
    logger.log(`Calling ${model} for clip analysis (provider: ${llm.getProvider()})`);

    const transcript = episode.transcript as {
      text: string;
      segments: Array<{ start: number; end: number; text: string }>;
      duration?: number;
      language?: string;
    };

    // Build the prompt
    const promptInput: ClipSelectionInput = {
      episodeTitle: episode.title,
      podcastTitle: episode.podcast.title,
      transcript: {
        text: transcript.text,
        segments: transcript.segments,
        duration: transcript.duration,
      },
      userInterests: userInterests.length > 0 ? userInterests : user.interests,
    };

    const userPrompt = buildClipSelectionPrompt(promptInput);

    logger.log(`Transcript has ${transcript.segments.length} segments`);
    logger.log(`Sending to ${model} for analysis...`);

    // Call LLM API (OpenRouter or OpenAI)
    const result = await llm.complete({
      messages: [
        {
          role: "system",
          content: CLIP_SELECTION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 1,
      maxTokens: 4000,
    });

    const content = result.content;
    logger.log(`LLM response received (${result.provider}). Tokens used: ${result.usage.totalTokens}`);

    // Parse the JSON response
    let analysisResult: ClipSelectionOutput;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      analysisResult = JSON.parse(jsonContent) as ClipSelectionOutput;
    } catch (parseError) {
      logger.error(`Failed to parse LLM response: ${content}`);
      throw new Error(`Failed to parse LLM response: ${parseError}`);
    }

    if (!analysisResult.clips || !Array.isArray(analysisResult.clips)) {
      throw new Error("Invalid response format: clips array not found");
    }

    logger.log(`LLM identified ${analysisResult.clips.length} clips`);

    // ===== PHASE 3: SAVE CLIPS =====
    logger.log("Saving clips to database");

    // Delete any existing clips for this episode (in case of retry)
    await prisma.clip.deleteMany({
      where: { episodeId },
    });

    // Create new clips
    const createdClips = [];
    for (const clip of analysisResult.clips) {
      const duration = clip.endTime - clip.startTime;

      const createdClip = await prisma.clip.create({
        data: {
          episodeId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration,
          transcript: clip.transcript,
          relevanceScore: clip.relevanceScore,
          reasoning: clip.reasoning,
          summary: clip.summary,
        },
      });

      createdClips.push({
        id: createdClip.id,
        startTime: createdClip.startTime,
        endTime: createdClip.endTime,
        transcript: createdClip.transcript,
        relevanceScore: createdClip.relevanceScore,
        reasoning: createdClip.reasoning || "",
        summary: createdClip.summary || "",
      });

      logger.log(
        `Created clip: ${createdClip.id} (${duration.toFixed(1)}s, score: ${clip.relevanceScore})`
      );
    }

    // Update episode status to analyzed
    logger.log(`Updating episode status to 'analyzed'`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "analyzed" },
    });

    logger.log(`Analysis completed. Created ${createdClips.length} clips.`);

    return {
      episodeId,
      userId,
      clips: createdClips,
    };
  } catch (error) {
    // Update status to failed
    logger.error(`Analysis failed: ${error}`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "failed" },
    });

    throw error;
  }
}
