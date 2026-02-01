/**
 * Queue utilities for the API service
 * Used to add jobs to BullMQ queues from API endpoints
 */

import { Queue } from "bullmq";
import { useRedis } from "./redis";

const queues = new Map<string, Queue>();

/**
 * Get or create a queue instance
 * NOTE: Requires REDIS_URL to be configured
 */
export function useQueue(name: string): Queue | null {
  const redis = useRedis();

  if (!redis) {
    console.warn(`Cannot create queue '${name}': REDIS_URL not configured`);
    return null;
  }

  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const queue = new Queue(name, {
    connection: redis,
  });

  queues.set(name, queue);

  return queue;
}

// Queue names (keep in sync with workers)
export const QUEUE_NAMES = {
  TRANSCRIPTION: "transcription",
  ANALYSIS: "analysis",
  CURATION: "curation",
  STITCHING: "stitching",
  DIGEST: "digest",
  ORCHESTRATOR: "orchestrator",
} as const;

export interface TranscriptionJobData {
  episodeId: string;
  audioUrl: string;
}

/**
 * Add a transcription job to the queue
 * Returns null if Redis is not configured
 */
export async function queueTranscriptionJob(
  data: TranscriptionJobData
): Promise<{ jobId: string } | null> {
  const queue = useQueue(QUEUE_NAMES.TRANSCRIPTION);

  if (!queue) {
    return null;
  }

  const job = await queue.add("transcribe", data, {
    jobId: `transcription-${data.episodeId}`,
    // Prevent duplicate jobs for the same episode
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  });

  return { jobId: job.id! };
}

export interface AnalysisJobData {
  episodeId: string;
  userId: string;
  userInterests: string[];
}

/**
 * Add an analysis job to the queue
 * Returns null if Redis is not configured
 */
export async function queueAnalysisJob(
  data: AnalysisJobData
): Promise<{ jobId: string } | null> {
  const queue = useQueue(QUEUE_NAMES.ANALYSIS);

  if (!queue) {
    return null;
  }

  const job = await queue.add("analyze", data, {
    jobId: `analysis-${data.episodeId}-${data.userId}`,
    // Prevent duplicate jobs for the same episode/user combination
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  });

  return { jobId: job.id! };
}

export interface CurationJobData {
  digestId: string;
  userId: string;
  episodeIds: string[];
  userInterests: string[];
  targetDuration?: number;
  targetClipCount?: { min: number; max: number };
}

/**
 * Add a curation job to the queue
 * Returns null if Redis is not configured
 */
export async function queueCurationJob(
  data: CurationJobData
): Promise<{ jobId: string } | null> {
  const queue = useQueue(QUEUE_NAMES.CURATION);

  if (!queue) {
    return null;
  }

  const job = await queue.add("curate", data, {
    jobId: `curation-${data.digestId}`,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  });

  return { jobId: job.id! };
}

export interface OrchestratorJobData {
  userId: string;
  frequency: "daily" | "weekly";
}

/**
 * Add an orchestrator job to the queue
 * Returns null if Redis is not configured
 */
export async function queueOrchestratorJob(
  data: OrchestratorJobData
): Promise<{ jobId: string } | null> {
  const queue = useQueue(QUEUE_NAMES.ORCHESTRATOR);

  if (!queue) {
    return null;
  }

  const jobId = `orchestrator-${data.userId}-${Date.now()}`;
  const job = await queue.add("orchestrate", data, {
    jobId,
    attempts: 1,
  });

  return { jobId: job.id! };
}
