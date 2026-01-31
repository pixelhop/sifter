import { defineEventHandler, getRouterParam, getHeader } from "h3";
import { errors } from "../../../../utils/errors";
import { usePrismaClient } from "../../../../utils/prisma";
import { queueAnalysisJob } from "../../../../utils/queues";

// POST /api/episodes/:id/analyze
// Queue analysis job with deduplication check
//
// Headers:
// - Authorization: Bearer <token> (required)
//
// Response based on episode status:
// - If 'transcribed' → queue job, return { jobId, status: 'queued' }
// - If 'analyzing' → return { status: 'in_progress' }
// - If 'analyzed' → return { status: 'completed', clips }
// - If 'failed' → reset to 'transcribed', queue job, return { jobId, status: 'retry_queued' }
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Episode ID is required");
  }

  // Get user from auth header (simplified - in production use proper auth middleware)
  const authHeader = getHeader(event, "authorization");
  if (!authHeader) {
    throw errors.unauthorized("Authorization required");
  }

  const prisma = usePrismaClient();

  // For now, get user from a simple lookup (in production, decode JWT)
  // This assumes the auth header contains the user ID for simplicity
  // In production, this should verify a JWT token
  const userId = authHeader.replace("Bearer ", "").trim();

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      interests: true,
    },
  });

  if (!user) {
    throw errors.unauthorized("Invalid user");
  }

  // Fetch episode with podcast info
  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!episode) {
    throw errors.notFound("Episode");
  }

  // Check if user has access to this episode (via subscription)
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      podcastId: episode.podcastId,
    },
  });

  if (!subscription) {
    throw errors.forbidden("You must be subscribed to this podcast to analyze episodes");
  }

  // Handle based on current status
  switch (episode.status) {
    case "analyzed": {
      // Already analyzed - return existing clips
      const clips = await prisma.clip.findMany({
        where: { episodeId: episode.id },
        orderBy: { relevanceScore: "desc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          duration: true,
          transcript: true,
          relevanceScore: true,
          reasoning: true,
          summary: true,
        },
      });

      return {
        status: "completed",
        episodeId: episode.id,
        clips,
      };
    }

    case "analyzing": {
      // Already in progress - return status
      return {
        status: "in_progress",
        episodeId: episode.id,
        currentStatus: episode.status,
      };
    }

    case "downloading":
    case "transcribing": {
      // Episode is still being transcribed
      return {
        status: "waiting_for_transcription",
        episodeId: episode.id,
        currentStatus: episode.status,
        message: "Episode is still being transcribed. Try again later.",
      };
    }

    case "transcribed": {
      // Ready to analyze - queue the job
      const result = await queueAnalysisJob({
        episodeId: episode.id,
        userId: user.id,
        userInterests: user.interests,
      });

      if (!result) {
        throw errors.internal("Queue service unavailable");
      }

      return {
        status: "queued",
        episodeId: episode.id,
        jobId: result.jobId,
        interestsUsed: user.interests,
      };
    }

    case "failed": {
      // Reset to transcribed if we have a transcript, or pending if not
      const hasTranscript = episode.transcript !== null;

      if (!hasTranscript) {
        return {
          status: "needs_transcription",
          episodeId: episode.id,
          message: "Episode needs to be transcribed first",
        };
      }

      // Reset to transcribed and queue analysis
      await prisma.episode.update({
        where: { id },
        data: { status: "transcribed" },
      });

      const result = await queueAnalysisJob({
        episodeId: episode.id,
        userId: user.id,
        userInterests: user.interests,
      });

      if (!result) {
        throw errors.internal("Queue service unavailable");
      }

      return {
        status: "retry_queued",
        episodeId: episode.id,
        jobId: result.jobId,
        interestsUsed: user.interests,
      };
    }

    case "pending":
    default: {
      // Episode hasn't been processed yet
      return {
        status: "needs_transcription",
        episodeId: episode.id,
        currentStatus: episode.status,
        message: "Episode needs to be transcribed before analysis",
      };
    }
  }
});
