import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../../utils/errors";
import { usePrismaClient } from "../../../../utils/prisma";
import { queueTranscriptionJob } from "../../../../utils/queues";

// POST /api/episodes/:id/transcribe
// Queue transcription with deduplication check
//
// Response based on episode status:
// - If 'pending' → queue job, return { jobId, status: 'queued' }
// - If 'downloading'/'transcribing' → return { status: 'in_progress' }
// - If 'transcribed' → return { status: 'completed', transcript }
// - If 'failed' → reset to 'pending', queue job, return { jobId, status: 'retry_queued' }
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Episode ID is required");
  }

  const prisma = usePrismaClient();

  const episode = await prisma.episode.findUnique({
    where: { id },
    select: {
      id: true,
      audioUrl: true,
      status: true,
      transcript: true,
      title: true,
    },
  });

  if (!episode) {
    throw errors.notFound("Episode");
  }

  // Handle based on current status
  switch (episode.status) {
    case "transcribed": {
      // Already completed - return existing transcript
      return {
        status: "completed",
        episodeId: episode.id,
        transcript: episode.transcript,
      };
    }

    case "downloading":
    case "transcribing": {
      // Already in progress - return status
      return {
        status: "in_progress",
        episodeId: episode.id,
        currentStatus: episode.status,
      };
    }

    case "analyzing":
    case "analyzed": {
      // Episode is past transcription phase
      return {
        status: "completed",
        episodeId: episode.id,
        transcript: episode.transcript,
        note: "Episode is in analysis phase",
      };
    }

    case "failed": {
      // Reset to pending and retry
      await prisma.episode.update({
        where: { id },
        data: { status: "pending" },
      });

      const result = await queueTranscriptionJob({
        episodeId: episode.id,
        audioUrl: episode.audioUrl,
      });

      if (!result) {
        throw errors.internal("Queue service unavailable");
      }

      return {
        status: "retry_queued",
        episodeId: episode.id,
        jobId: result.jobId,
      };
    }

    case "pending":
    default: {
      // Queue new transcription job
      const result = await queueTranscriptionJob({
        episodeId: episode.id,
        audioUrl: episode.audioUrl,
      });

      if (!result) {
        throw errors.internal("Queue service unavailable");
      }

      return {
        status: "queued",
        episodeId: episode.id,
        jobId: result.jobId,
      };
    }
  }
});
