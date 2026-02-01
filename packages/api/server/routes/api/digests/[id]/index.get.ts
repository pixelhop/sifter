import { defineEventHandler, createError, getRouterParam, getHeader } from "h3";
import { usePrismaClient } from "../../../../utils/prisma";

// GET /api/digests/:id
// Get a specific digest with its clips
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Digest ID is required",
    });
  }

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

  const digest = await prisma.digest.findUnique({
    where: { id },
    include: {
      digestClips: {
        include: {
          clip: {
            include: {
              episode: {
                select: {
                  id: true,
                  title: true,
                  podcast: {
                    select: {
                      id: true,
                      title: true,
                      imageUrl: true,
                    },
                  },
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
    throw createError({
      statusCode: 404,
      statusMessage: "Digest not found",
    });
  }

  // Check ownership (or if public)
  if (digest.userId !== userId && !digest.isPublic) {
    throw createError({
      statusCode: 403,
      statusMessage: "You don't have access to this digest",
    });
  }

  return {
    id: digest.id,
    status: digest.status,
    createdAt: digest.createdAt,
    updatedAt: digest.updatedAt,
    audioUrl: digest.audioUrl,
    duration: digest.duration,
    isPublic: digest.isPublic,
    shareId: digest.shareId,
    // @ts-expect-error - field added in migration
    podcastId: digest.podcastId,
    narratorScript: digest.narratorScript
      ? JSON.parse(digest.narratorScript)
      : null,
    clips: digest.digestClips.map((dc) => ({
      id: dc.clip.id,
      order: dc.order,
      startTime: dc.clip.startTime,
      endTime: dc.clip.endTime,
      duration: dc.clip.duration,
      transcript: dc.clip.transcript,
      summary: dc.clip.summary,
      relevanceScore: dc.clip.relevanceScore,
      episode: dc.clip.episode,
    })),
  };
});
