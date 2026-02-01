/**
 * Digest Orchestrator Worker
 *
 * Single job that automates the entire Sifter digest pipeline end-to-end:
 * 1. Get user subscriptions and find recent episodes
 * 2. Transcribe any episodes that need it (parallel)
 * 3. Analyze episodes with user interests (parallel)
 * 4. Wait for transcription/analysis to complete (poll)
 * 5. Run curation to select best 6-8 clips (~7 min target)
 * 6. Create digest record with curated clip IDs
 * 7. Generate narrator script, TTS, stitch audio
 * 8. Return the completed digest
 */

import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import { useQueue } from "../../utils/queues";
import curationWorker from "../curation/worker";
import digestWorker from "../digest/worker";

export interface OrchestratorJobData {
  userId: string;
  frequency: "daily" | "weekly";
}

export interface OrchestratorJobResult {
  digestId: string;
  audioUrl: string;
  duration: number;
  status: "ready" | "no_episodes";
  episodeCount: number;
  clipCount: number;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_TIME_MS = 20 * 60 * 1000; // 20 minutes max wait for transcription/analysis

/**
 * Main orchestrator worker function
 */
export default async function orchestratorWorker(
  job: Job<OrchestratorJobData>
): Promise<OrchestratorJobResult> {
  const logger = useJobLogger(job);
  const prisma = usePrismaClient();
  const { userId, frequency } = job.data;

  logger.log(`Starting orchestrator for user: ${userId}, frequency: ${frequency}`);

  // ===== PHASE 1: GET USER & SUBSCRIPTIONS =====
  logger.log("Phase 1: Fetching user subscriptions and recent episodes");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        include: {
          podcast: {
            include: {
              episodes: {
                where: {
                  publishedAt: {
                    gte: getFrequencyWindow(frequency),
                  },
                },
                orderBy: { publishedAt: "desc" },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  logger.log(`User: ${user.name || user.email}, Interests: ${user.interests.join(", ") || "none"}`);
  logger.log(`Subscriptions: ${user.subscriptions.length}`);

  // Collect all recent episodes across subscriptions
  const allEpisodes = user.subscriptions.flatMap((sub) => sub.podcast.episodes);

  if (allEpisodes.length === 0) {
    logger.log("No recent episodes found. Returning early.");
    return {
      digestId: "",
      audioUrl: "",
      duration: 0,
      status: "no_episodes",
      episodeCount: 0,
      clipCount: 0,
    };
  }

  logger.log(`Found ${allEpisodes.length} recent episodes across ${user.subscriptions.length} podcasts`);

  // Log episode statuses
  const statusCounts: Record<string, number> = {};
  for (const ep of allEpisodes) {
    statusCounts[ep.status] = (statusCounts[ep.status] || 0) + 1;
  }
  logger.log(`Episode statuses: ${JSON.stringify(statusCounts)}`);

  // ===== PHASE 2: TRANSCRIBE EPISODES THAT NEED IT =====
  logger.log("Phase 2: Queueing transcription for pending episodes");

  const needsTranscription = allEpisodes.filter(
    (ep) => ep.status === "pending" || ep.status === "failed"
  );

  if (needsTranscription.length > 0) {
    const transcriptionQueue = await useQueue("transcription");

    for (const ep of needsTranscription) {
      // Reset failed episodes to pending
      if (ep.status === "failed") {
        await prisma.episode.update({
          where: { id: ep.id },
          data: { status: "pending" },
        });
      }

      await transcriptionQueue.add(
        "transcribe",
        { episodeId: ep.id, audioUrl: ep.audioUrl },
        {
          jobId: `transcription-${ep.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );
      logger.log(`Queued transcription: ${ep.title} (${ep.id})`);
    }

    logger.log(`Queued ${needsTranscription.length} transcription jobs`);
  } else {
    logger.log("No episodes need transcription");
  }

  // ===== PHASE 3: QUEUE ANALYSIS FOR ALREADY-TRANSCRIBED EPISODES =====
  logger.log("Phase 3: Queueing analysis for transcribed episodes");

  const needsAnalysis = allEpisodes.filter((ep) => ep.status === "transcribed");

  if (needsAnalysis.length > 0) {
    const analysisQueue = await useQueue("analysis");

    for (const ep of needsAnalysis) {
      await analysisQueue.add(
        "analyze",
        {
          episodeId: ep.id,
          userId,
          userInterests: user.interests,
        },
        {
          jobId: `analysis-${ep.id}-${userId}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );
      logger.log(`Queued analysis: ${ep.title} (${ep.id})`);
    }

    logger.log(`Queued ${needsAnalysis.length} analysis jobs`);
  } else {
    logger.log("No episodes need analysis right now");
  }

  // ===== PHASE 4: POLL FOR COMPLETION =====
  // Wait for all episodes to reach "analyzed" status
  // Episodes going through transcription will automatically need analysis after
  const episodeIds = allEpisodes.map((ep) => ep.id);
  const alreadyAnalyzed = allEpisodes.filter((ep) => ep.status === "analyzed").length;

  if (alreadyAnalyzed < allEpisodes.length) {
    logger.log(
      `Phase 4: Waiting for episodes to complete processing (${alreadyAnalyzed}/${allEpisodes.length} already analyzed)`
    );

    await waitForEpisodesAnalyzed(
      prisma,
      episodeIds,
      userId,
      user.interests,
      logger,
      job
    );
  } else {
    logger.log("Phase 4: All episodes already analyzed, skipping wait");
  }

  // Re-fetch episode statuses to confirm
  const analyzedEpisodes = await prisma.episode.findMany({
    where: {
      id: { in: episodeIds },
      status: "analyzed",
    },
    select: { id: true, title: true },
  });

  if (analyzedEpisodes.length === 0) {
    throw new Error("No episodes were successfully analyzed");
  }

  logger.log(`${analyzedEpisodes.length}/${allEpisodes.length} episodes analyzed successfully`);
  const analyzedEpisodeIds = analyzedEpisodes.map((ep) => ep.id);

  // ===== PHASE 5: CREATE DIGEST & RUN CURATION =====
  logger.log("Phase 5: Creating digest and running curation");

  const primaryPodcastId = user.subscriptions[0]?.podcast.id;

  // Create the digest record
  const digest = await prisma.digest.create({
    data: {
      userId,
      status: "curating",
      podcastId: primaryPodcastId,
      episodeIds: analyzedEpisodeIds,
    },
  });

  logger.log(`Created digest: ${digest.id}`);

  // Run curation directly (not via queue - we're already in a worker)
  const curationResult = await curationWorker({
    data: {
      digestId: digest.id,
      userId,
      episodeIds: analyzedEpisodeIds,
      userInterests: user.interests,
      targetDuration: 420, // 7 minutes
      targetClipCount: { min: 6, max: 8 },
    },
    // Provide minimal Job-like interface for the logger
    id: `orchestrator-curation-${digest.id}`,
    log: (msg: string) => logger.log(`[curation] ${msg}`),
    updateProgress: async () => {},
  } as unknown as Job);

  logger.log(
    `Curation completed: ${curationResult.selectedClipIds.length} clips, ${curationResult.totalDuration.toFixed(1)}s total`
  );

  // ===== PHASE 6: GENERATE DIGEST (SCRIPT + TTS + STITCH) =====
  logger.log("Phase 6: Generating digest audio");

  // Run digest generation directly
  const digestResult = await digestWorker({
    data: {
      digestId: digest.id,
      userId,
      clipIds: curationResult.selectedClipIds,
      podcastId: primaryPodcastId,
      episodeIds: analyzedEpisodeIds,
    },
    id: `orchestrator-digest-${digest.id}`,
    log: (msg: string) => logger.log(`[digest] ${msg}`),
    updateProgress: async () => {},
  } as unknown as Job);

  logger.log(`Digest generation completed: ${digestResult.audioUrl}`);
  logger.log(`Final duration: ${digestResult.duration}s`);

  return {
    digestId: digest.id,
    audioUrl: digestResult.audioUrl,
    duration: digestResult.duration,
    status: "ready",
    episodeCount: analyzedEpisodes.length,
    clipCount: curationResult.selectedClipIds.length,
  };
}

/**
 * Get the date window based on frequency
 */
function getFrequencyWindow(frequency: "daily" | "weekly"): Date {
  const now = new Date();
  if (frequency === "weekly") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Poll episode statuses until all are analyzed (or timeout).
 * Also queues analysis jobs for episodes that finish transcription.
 */
async function waitForEpisodesAnalyzed(
  prisma: ReturnType<typeof usePrismaClient>,
  episodeIds: string[],
  userId: string,
  userInterests: string[],
  logger: ReturnType<typeof useJobLogger>,
  job: Job
): Promise<void> {
  const startTime = Date.now();
  const analysisQueued = new Set<string>();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const episodes = await prisma.episode.findMany({
      where: { id: { in: episodeIds } },
      select: { id: true, status: true, title: true },
    });

    const analyzed = episodes.filter((e) => e.status === "analyzed");
    const failed = episodes.filter((e) => e.status === "failed");
    const processing = episodes.filter(
      (e) =>
        e.status !== "analyzed" && e.status !== "failed"
    );

    // Queue analysis for newly transcribed episodes
    const newlyTranscribed = episodes.filter(
      (e) => e.status === "transcribed" && !analysisQueued.has(e.id)
    );

    if (newlyTranscribed.length > 0) {
      const analysisQueue = await useQueue("analysis");
      for (const ep of newlyTranscribed) {
        await analysisQueue.add(
          "analyze",
          {
            episodeId: ep.id,
            userId,
            userInterests,
          },
          {
            jobId: `analysis-${ep.id}-${userId}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          }
        );
        analysisQueued.add(ep.id);
        logger.log(`Queued analysis for newly transcribed: ${ep.title} (${ep.id})`);
      }
    }

    // Check if we're done (all analyzed or failed, none still processing)
    if (processing.length === 0) {
      if (analyzed.length > 0) {
        logger.log(
          `All episodes done: ${analyzed.length} analyzed, ${failed.length} failed`
        );
        return;
      } else {
        throw new Error("All episodes failed processing");
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.log(
      `Polling: ${analyzed.length} analyzed, ${processing.length} processing, ${failed.length} failed (${elapsed}s elapsed)`
    );

    // Update job progress
    const progress = Math.round(
      ((analyzed.length + failed.length) / episodes.length) * 50
    );
    await job.updateProgress(progress);

    // Wait before next poll
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout - proceed with whatever we have
  logger.warn(
    `Polling timed out after ${MAX_POLL_TIME_MS / 1000}s. Proceeding with available episodes.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
