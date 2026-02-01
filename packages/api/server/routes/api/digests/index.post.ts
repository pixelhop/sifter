import { defineEventHandler, createError, getHeader, readBody } from "h3";
import { usePrismaClient } from "../../../utils/prisma";
import { useQueue, QUEUE_NAMES } from "../../../utils/queues";

// POST /api/digests
// Create a new digest for the authenticated user
//
// Body: {
//   clipIds: string[] - Array of clip IDs to include
//   podcastId?: string - Optional podcast ID (for tracking)
// }
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization");
  if (!authHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authorization required",
    });
  }

  // Simple user ID extraction (in production, verify JWT)
  const userId = authHeader.replace("Bearer ", "").trim();

  const body = await readBody(event);
  const { clipIds, podcastId } = body;

  if (!clipIds || !Array.isArray(clipIds) || clipIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "clipIds array is required",
    });
  }

  const prisma = usePrismaClient();

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid user",
    });
  }

  // Verify all clips exist and user has access to them
  const clips = await prisma.clip.findMany({
    where: {
      id: { in: clipIds },
    },
    include: {
      episode: {
        select: {
          id: true,
          podcastId: true,
        },
      },
    },
  });

  if (clips.length !== clipIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "One or more clips not found",
    });
  }

  // Check user subscription to podcasts
  const podcastIds = [...new Set(clips.map((c) => c.episode.podcastId))];
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      podcastId: { in: podcastIds },
    },
  });

  if (subscriptions.length !== podcastIds.length) {
    throw createError({
      statusCode: 403,
      statusMessage: "You must be subscribed to all podcasts containing these clips",
    });
  }

  // Get episode IDs
  const episodeIds = [...new Set(clips.map((c) => c.episode.id))];

  // Create the digest
  const digest = await prisma.digest.create({
    data: {
      userId,
      status: "pending",
      // @ts-expect-error - fields added in migration
      podcastId: podcastId || podcastIds[0],
      episodeIds: episodeIds as string[],
      digestClips: {
        create: clipIds.map((clipId, index) => ({
          clipId,
          order: index,
        })),
      },
      // Link clips to digest
      clips: {
        connect: clipIds.map((id) => ({ id })),
      },
    },
  });

  // Queue the digest generation job
  const queue = useQueue(QUEUE_NAMES.DIGEST);
  if (queue) {
    await queue.add(
      "generate",
      {
        digestId: digest.id,
        userId,
        clipIds,
        podcastId: podcastId || podcastIds[0],
        episodeIds,
      },
      {
        jobId: `digest-${digest.id}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      }
    );
  }

  return {
    digestId: digest.id,
    status: "pending",
    clipCount: clipIds.length,
    message: "Digest creation queued",
  };
});
