import { defineEventHandler, createError, getHeader } from "h3";
import { usePrismaClient } from "../../../utils/prisma";

// GET /api/digests
// List all digests for the authenticated user
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

  // Fetch user's digests
  const digests = await prisma.digest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { digestClips: true },
      },
    },
  });

  return {
    digests: digests.map((d) => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      audioUrl: d.audioUrl,
      duration: d.duration,
      isPublic: d.isPublic,
      shareId: d.shareId,
      // @ts-expect-error - field added in migration
      podcastId: d.podcastId,
      clipCount: d._count.digestClips,
    })),
  };
});
