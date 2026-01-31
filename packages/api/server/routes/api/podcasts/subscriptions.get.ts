import { defineEventHandler } from "h3";
import { usePrismaClient } from "../../../utils/prisma";
import { getCurrentUser } from "../../../utils/user";

// GET /api/podcasts/subscriptions
export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const prisma = usePrismaClient();

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id },
    include: {
      podcast: {
        include: {
          _count: {
            select: { episodes: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    subscriptions: subscriptions.map((sub) => ({
      id: sub.id,
      subscribedAt: sub.createdAt,
      podcast: {
        id: sub.podcast.id,
        title: sub.podcast.title,
        author: sub.podcast.author,
        imageUrl: sub.podcast.imageUrl,
        rssUrl: sub.podcast.rssUrl,
        episodeCount: sub.podcast._count.episodes,
        lastCheckedAt: sub.podcast.lastCheckedAt,
      },
    })),
  };
});
