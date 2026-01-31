import { defineEventHandler, getQuery } from "h3";
import { errors } from "../../../utils/errors";
import { searchPodcasts, type PodcastSearchResult } from "../../../utils/itunes";
import { cache } from "../../../utils/redis";

const CACHE_TTL_SECONDS = 3600; // 1 hour

// GET /api/podcasts/search?q=query
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const searchTerm = query.q as string;

  if (!searchTerm || searchTerm.trim().length === 0) {
    throw errors.badRequest("Search query is required");
  }

  const normalizedQuery = searchTerm.trim().toLowerCase();
  const cacheKey = `podcast:search:${normalizedQuery}`;

  // Check cache first
  const cached = await cache.get<PodcastSearchResult[]>(cacheKey);
  if (cached) {
    return { results: cached, cached: true };
  }

  // Fetch from iTunes API
  const results = await searchPodcasts(searchTerm);

  // Cache the results
  await cache.set(cacheKey, results, CACHE_TTL_SECONDS);

  return { results, cached: false };
});
