import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import {
  CLIP_SELECTION_SYSTEM_PROMPT,
  buildClipSelectionPrompt,
  type ClipSelectionInput,
  type ClipSelectionOutput,
} from "../../../prompts/clip-selection";

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

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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

    // ===== PHASE 2: GPT-4 ANALYSIS =====
    logger.log("Calling GPT-5-mini for clip analysis");

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
    logger.log(`Sending to GPT-5-mini for analysis...`);

    // Call OpenAI GPT-4 API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini", // Cost-efficient model for clip selection
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
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data: OpenAIResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    logger.log(`GPT-4 response received. Tokens used: ${data.usage.total_tokens}`);

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
      logger.error(`Failed to parse GPT-4 response: ${content}`);
      throw new Error(`Failed to parse GPT-4 response: ${parseError}`);
    }

    if (!analysisResult.clips || !Array.isArray(analysisResult.clips)) {
      throw new Error("Invalid response format: clips array not found");
    }

    logger.log(`GPT-4 identified ${analysisResult.clips.length} clips`);

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
