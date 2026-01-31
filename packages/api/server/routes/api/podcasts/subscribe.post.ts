import { defineEventHandler, readBody } from "h3";
import { z } from "zod";
import { errors } from "../../../utils/errors";
import { usePrismaClient } from "../../../utils/prisma";
import { getCurrentUser } from "../../../utils/user";
import { fetchRssFeed } from "../../../utils/rss";

const subscribeSchema = z.object({
  feedUrl: z.string().url("Invalid RSS feed URL"),
  title: z.string().optional(),
  author: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
});

// POST /api/podcasts/subscribe
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.validation(parsed.error.errors[0]?.message ?? "Invalid request");
  }

  const { feedUrl, title, author, imageUrl } = parsed.data;
  const user = await getCurrentUser(event);
  const prisma = usePrismaClient();

  // Check if podcast already exists
  let podcast = await prisma.podcast.findUnique({
    where: { rssUrl: feedUrl },
  });

  if (!podcast) {
    // Fetch RSS feed to get metadata and validate the feed
    let feedData;
    try {
      feedData = await fetchRssFeed(feedUrl);
    } catch {
      throw errors.badRequest("Unable to fetch RSS feed. Please check the URL.");
    }

    // Create podcast with metadata from feed (or provided values)
    podcast = await prisma.podcast.create({
      data: {
        rssUrl: feedUrl,
        title: title || feedData.title,
        author: author || feedData.author,
        description: feedData.description,
        imageUrl: imageUrl ?? feedData.imageUrl,
        lastCheckedAt: new Date(),
      },
    });

    // Create episodes from feed
    if (feedData.episodes.length > 0) {
      await prisma.episode.createMany({
        data: feedData.episodes
          .filter((ep) => ep.audioUrl) // Only episodes with audio
          .map((ep) => ({
            podcastId: podcast!.id,
            guid: ep.guid,
            title: ep.title,
            description: ep.description,
            audioUrl: ep.audioUrl!,
            duration: ep.duration,
            publishedAt: ep.publishedAt ?? new Date(),
            status: "pending" as const,
          })),
        skipDuplicates: true,
      });
    }
  }

  // Check if user is already subscribed
  const existingSubscription = await prisma.subscription.findUnique({
    where: {
      userId_podcastId: {
        userId: user.id,
        podcastId: podcast.id,
      },
    },
  });

  if (existingSubscription) {
    throw errors.badRequest("Already subscribed to this podcast");
  }

  // Create subscription
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      podcastId: podcast.id,
    },
    include: {
      podcast: true,
    },
  });

  return {
    subscription: {
      id: subscription.id,
      podcast: {
        id: subscription.podcast.id,
        title: subscription.podcast.title,
        author: subscription.podcast.author,
        imageUrl: subscription.podcast.imageUrl,
        rssUrl: subscription.podcast.rssUrl,
      },
    },
  };
});
