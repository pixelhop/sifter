import { defineEventHandler, createError, getHeader, getRouterParam } from "h3";
import { usePrismaClient } from "../../../../utils/prisma";
import { queueCurationJob } from "../../../../utils/queues";

// POST /api/digests/:id/curate
// Trigger cross-episode curation for a digest
//
// This endpoint:
// 1. Verifies the digest exists and belongs to the user
// 2. Fetches all episodes associated with the digest
// 3. Queues a curation job to select the best clips
//
// The curation worker will:
// - Fetch all clips from the specified episodes
// - Use LLM to select the best 6-8 clips for diversity and quality
// - Create DigestClip records linking selected clips to the digest
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

  const digestId = getRouterParam(event, "id");
  if (!digestId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Digest ID is required",
    });
  }

  const prisma = usePrismaClient();

  // Verify user exists and get interests
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, interests: true },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid user",
    });
  }

  // Verify digest exists and belongs to user
  const digest = await prisma.digest.findUnique({
    where: { id: digestId },
  });

  if (!digest) {
    throw createError({
      statusCode: 404,
      statusMessage: "Digest not found",
    });
  }

  if (digest.userId !== userId) {
    throw createError({
      statusCode: 403,
      statusMessage: "Access denied",
    });
  }

  // Get episode IDs from the digest
  const episodeIds = digest.episodeIds as string[];

  if (!episodeIds || episodeIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Digest has no associated episodes",
    });
  }

  // Verify all episodes exist and have been analyzed
  const episodes = await prisma.episode.findMany({
    where: {
      id: { in: episodeIds },
    },
    select: {
      id: true,
      status: true,
      title: true,
    },
  });

  if (episodes.length !== episodeIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "One or more episodes not found",
    });
  }

  // Check if all episodes are analyzed
  const unanalyzedEpisodes = episodes.filter((e) => e.status !== "analyzed");
  if (unanalyzedEpisodes.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Episodes not yet analyzed: ${unanalyzedEpisodes.map((e) => e.title).join(", ")}`,
    });
  }

  // Queue the curation job
  const result = await queueCurationJob({
    digestId,
    userId,
    episodeIds,
    userInterests: user.interests,
    targetDuration: 420, // 7 minutes
    targetClipCount: { min: 6, max: 8 },
  });

  if (!result) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to queue curation job. Redis may not be configured.",
    });
  }

  return {
    digestId,
    jobId: result.jobId,
    status: "curating",
    episodeCount: episodeIds.length,
    message: "Curation job queued",
  };
});
