import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: [
      ["itunes:duration", "itunesDuration"],
      ["enclosure", "enclosure"],
    ],
  },
});

export interface RssEpisode {
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  duration: number | null;
  publishedAt: Date | null;
}

export interface RssFeed {
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  episodes: RssEpisode[];
}

/**
 * Parse duration string (HH:MM:SS or MM:SS or seconds) to seconds
 */
function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;

  // If it's just a number, treat as seconds
  if (/^\d+$/.test(duration)) {
    return parseInt(duration, 10);
  }

  // Handle HH:MM:SS or MM:SS format
  const parts = duration.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return null;
}

/**
 * Fetch and parse RSS feed
 * @param feedUrl - RSS feed URL
 * @param maxEpisodes - Maximum episodes to return (default 10)
 */
export async function fetchRssFeed(
  feedUrl: string,
  maxEpisodes: number = 10
): Promise<RssFeed> {
  const feed = await parser.parseURL(feedUrl);

  const episodes: RssEpisode[] = feed.items.slice(0, maxEpisodes).map((item) => {
    // Get audio URL from enclosure
    let audioUrl: string | null = null;
    const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
    if (enclosure?.url && enclosure?.type?.startsWith("audio/")) {
      audioUrl = enclosure.url;
    }

    // Get duration
    const itunesDuration = (item as { itunesDuration?: string }).itunesDuration;
    const duration = parseDuration(itunesDuration);

    // Get publish date
    let publishedAt: Date | null = null;
    if (item.pubDate) {
      const parsed = new Date(item.pubDate);
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed;
      }
    }

    return {
      guid: item.guid || item.link || item.title || crypto.randomUUID(),
      title: item.title || "Untitled Episode",
      description: item.contentSnippet || item.content || null,
      audioUrl,
      duration,
      publishedAt,
    };
  });

  return {
    title: feed.title || "Untitled Podcast",
    author: feed.creator || feed.author || null,
    description: feed.description || null,
    imageUrl: feed.image?.url || feed.itunes?.image || null,
    episodes,
  };
}
