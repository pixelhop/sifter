import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { usePrismaClient } from "../../utils/prisma";
import {
  downloadAudio,
  getTempPath,
  ensureTempDir,
  cleanupDownload,
} from "../../../utils/download";
import { useWhisperProvider } from "../../../providers/whisper";

export interface TranscriptionJobData {
  episodeId: string;
  audioUrl: string;
}

export interface TranscriptionJobResult {
  episodeId: string;
  transcript: {
    text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    language?: string;
    duration?: number;
  };
}

/**
 * Transcription worker
 * Downloads episode audio and transcribes it using Whisper API
 *
 * Flow: pending → downloading → transcribing → transcribed
 */
export default async function transcriptionWorker(
  job: Job<TranscriptionJobData>
): Promise<TranscriptionJobResult> {
  const logger = useJobLogger(job);
  const prisma = usePrismaClient();
  const { episodeId, audioUrl } = job.data;

  logger.log(`Starting transcription for episode: ${episodeId}`);
  logger.log(`Audio URL: ${audioUrl}`);

  // Verify episode exists and check current status
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: { id: true, status: true, title: true },
  });

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`);
  }

  // Check if already processed (deduplication)
  if (episode.status === "transcribed") {
    logger.log(`Episode already transcribed, skipping: ${episodeId}`);
    const existing = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { transcript: true },
    });
    return {
      episodeId,
      transcript: existing?.transcript as TranscriptionJobResult["transcript"],
    };
  }

  if (episode.status === "downloading" || episode.status === "transcribing") {
    logger.log(
      `Episode already being processed (status: ${episode.status}), skipping: ${episodeId}`
    );
    throw new Error(
      `Episode ${episodeId} is already being processed (status: ${episode.status})`
    );
  }

  let tempFilePath: string | null = null;

  try {
    // ===== PHASE 1: DOWNLOADING =====
    logger.log(`Updating status to 'downloading'`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "downloading" },
    });

    await ensureTempDir();
    tempFilePath = getTempPath(episodeId, "mp3");

    logger.log(`Downloading audio to: ${tempFilePath}`);
    const downloadResult = await downloadAudio(audioUrl, tempFilePath, {
      onProgress: (progress) => {
        if (progress.percentage !== null && progress.percentage % 20 === 0) {
          logger.log(`Download progress: ${progress.percentage}%`);
        }
      },
    });

    logger.log(
      `Download complete. Size: ${(downloadResult.size / 1024 / 1024).toFixed(2)} MB`
    );

    // ===== PHASE 2: TRANSCRIBING =====
    logger.log(`Updating status to 'transcribing'`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "transcribing" },
    });

    logger.log(`Starting Whisper transcription`);
    const whisper = useWhisperProvider();
    logger.log(`Using Whisper provider: ${whisper.name}`);

    const transcriptionResult = await whisper.transcribe(tempFilePath);

    logger.log(
      `Transcription complete. Segments: ${transcriptionResult.segments.length}`
    );
    logger.log(`Detected language: ${transcriptionResult.language}`);
    logger.log(`Duration: ${transcriptionResult.duration}s`);

    // ===== PHASE 3: SAVE TRANSCRIPT =====
    const transcript = {
      text: transcriptionResult.text,
      segments: transcriptionResult.segments,
      language: transcriptionResult.language,
      duration: transcriptionResult.duration,
    };

    logger.log(`Saving transcript to database`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        status: "transcribed",
        // Cast to any for Prisma JSON field compatibility
        transcript: transcript as any,
        duration: transcriptionResult.duration
          ? Math.round(transcriptionResult.duration)
          : undefined,
      },
    });

    logger.log(`Transcription job completed for episode: ${episodeId}`);

    return {
      episodeId,
      transcript,
    };
  } catch (error) {
    // Update status to failed
    logger.log(`Transcription failed: ${error}`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "failed" },
    });

    throw error;
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      logger.log(`Cleaning up temp file: ${tempFilePath}`);
      await cleanupDownload(tempFilePath);
    }
  }
}
