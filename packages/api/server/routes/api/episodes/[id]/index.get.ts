import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../../utils/errors";
import { usePrismaClient } from "../../../../utils/prisma";

// GET /api/episodes/:id
// Returns episode details with transcript if available
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Episode ID is required");
  }

  const prisma = usePrismaClient();

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: {
        select: {
          id: true,
          title: true,
          author: true,
          imageUrl: true,
        },
      },
      clips: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          duration: true,
          transcript: true,
          summary: true,
          relevanceScore: true,
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!episode) {
    throw errors.notFound("Episode");
  }

  return {
    episode: {
      id: episode.id,
      title: episode.title,
      description: episode.description,
      audioUrl: episode.audioUrl,
      duration: episode.duration,
      publishedAt: episode.publishedAt,
      status: episode.status,
      transcript: episode.transcript,
      podcast: episode.podcast,
      clips: episode.clips,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
    },
  };
});
