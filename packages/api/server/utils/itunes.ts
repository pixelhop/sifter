import { z } from "zod";

const iTunesResultSchema = z.object({
  collectionId: z.number(),
  collectionName: z.string(),
  artistName: z.string().optional(),
  artworkUrl600: z.string().optional(),
  artworkUrl100: z.string().optional(),
  feedUrl: z.string().optional(),
  genres: z.array(z.string()).optional(),
  trackCount: z.number().optional(),
});

const iTunesSearchResponseSchema = z.object({
  resultCount: z.number(),
  results: z.array(iTunesResultSchema),
});

export interface PodcastSearchResult {
  id: string;
  title: string;
  author: string | null;
  imageUrl: string | null;
  feedUrl: string | null;
  genres: string[];
  episodeCount: number | null;
}

/**
 * Search for podcasts using the iTunes Search API
 * @param query - Search term
 * @param limit - Maximum results (default 20, max 200)
 */
export async function searchPodcasts(
  query: string,
  limit: number = 20
): Promise<PodcastSearchResult[]> {
  const params = new URLSearchParams({
    term: query,
    media: "podcast",
    limit: Math.min(limit, 200).toString(),
  });

  const url = `https://itunes.apple.com/search?${params}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iTunes API error: ${response.status}`);
  }

  const data = await response.json();
  const parsed = iTunesSearchResponseSchema.parse(data);

  return parsed.results
    .filter((result) => result.feedUrl) // Only include podcasts with RSS feeds
    .map((result) => ({
      id: result.collectionId.toString(),
      title: result.collectionName,
      author: result.artistName ?? null,
      imageUrl: result.artworkUrl600 ?? result.artworkUrl100 ?? null,
      feedUrl: result.feedUrl ?? null,
      genres: result.genres ?? [],
      episodeCount: result.trackCount ?? null,
    }));
}
