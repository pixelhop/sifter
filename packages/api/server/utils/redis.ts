import Redis from "ioredis";
import { getConfig } from "./config";

let redis: Redis | null = null;

/**
 * Get Redis client instance
 * Returns null if REDIS_URL is not configured
 */
export function useRedis(): Redis | null {
  const config = getConfig();

  if (!config.REDIS_URL) {
    return null;
  }

  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("Redis connection error:", err);
    });
  }

  return redis;
}

/**
 * Cache helper for storing and retrieving JSON data
 */
export const cache = {
  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const client = useRedis();
    if (!client) return null;

    try {
      const data = await client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  /**
   * Set cached value with TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Time to live in seconds
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const client = useRedis();
    if (!client) return;

    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      console.error("Redis set error:", err);
    }
  },

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    const client = useRedis();
    if (!client) return;

    try {
      await client.del(key);
    } catch (err) {
      console.error("Redis del error:", err);
    }
  },
};
