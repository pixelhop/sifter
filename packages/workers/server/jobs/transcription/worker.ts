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
import {
  WHISPER_MAX_FILE_SIZE,
  needsChunking,
  prepareAudioForWhisper,
  cleanupChunks,
  mergeTranscriptChunks,
  getTempChunkDir,
  type AudioChunk,
  type TranscriptChunk,
} from "../../../utils/ffmpeg";

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
 * Supports chunking for files >25MB (Whisper API limit)
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
  let chunks: AudioChunk[] = [];

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

    // Check if chunking is needed
    const requiresChunking = await needsChunking(tempFilePath);
    if (requiresChunking) {
      logger.log(
        `File size ${(downloadResult.size / 1024 / 1024).toFixed(2)} MB exceeds Whisper limit of ${WHISPER_MAX_FILE_SIZE / 1024 / 1024} MB, preparing chunks...`
      );
    }

    // ===== PHASE 2: TRANSCRIBING =====
    logger.log(`Updating status to 'transcribing'`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "transcribing" },
    });

    const whisper = useWhisperProvider();
    logger.log(`Using Whisper provider: ${whisper.name}`);

    let transcript: TranscriptionJobResult["transcript"];

    if (requiresChunking) {
      // ===== CHUNKED TRANSCRIPTION =====
      logger.log(`Starting chunked transcription`);

      const chunkDir = getTempChunkDir(episodeId);
      chunks = await prepareAudioForWhisper(tempFilePath, chunkDir);

      logger.log(`Audio split into ${chunks.length} chunks`);

      // Transcribe each chunk
      const chunkResults: Array<{
        chunk: AudioChunk;
        transcript: TranscriptChunk;
      }> = [];
      let detectedLanguage = "en";

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        logger.log(
          `Transcribing chunk ${i + 1}/${chunks.length} (offset: ${chunk.startTime}s, duration: ${chunk.duration}s)`
        );

        const result = await whisper.transcribe(chunk.path);

        chunkResults.push({
          chunk,
          transcript: {
            text: result.text,
            segments: result.segments,
            language: result.language,
            duration: result.duration,
          },
        });

        // Use language from first chunk
        if (i === 0 && result.language) {
          detectedLanguage = result.language;
        }

        // Update progress
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        await job.updateProgress(progress);
      }

      // Merge transcripts with adjusted timestamps
      logger.log(`Merging ${chunkResults.length} chunk transcripts`);
      const merged = mergeTranscriptChunks(chunkResults, detectedLanguage);

      transcript = {
        text: merged.text,
        segments: merged.segments,
        language: merged.language,
        duration: merged.duration,
      };

      logger.log(
        `Merged transcript has ${transcript.segments.length} segments, duration: ${transcript.duration}s`
      );
    } else {
      // ===== SINGLE FILE TRANSCRIPTION =====
      logger.log(`Starting Whisper transcription (single file)`);
      const result = await whisper.transcribe(tempFilePath);

      transcript = {
        text: result.text,
        segments: result.segments,
        language: result.language,
        duration: result.duration,
      };

      logger.log(
        `Transcription complete. Segments: ${transcript.segments.length}`
      );
    }

    logger.log(`Detected language: ${transcript.language}`);
    logger.log(`Duration: ${transcript.duration}s`);

    // ===== PHASE 3: SAVE TRANSCRIPT =====
    logger.log(`Saving transcript to database`);
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        status: "transcribed",
        // Cast to any for Prisma JSON field compatibility
        transcript: transcript as any,
        duration: transcript.duration
          ? Math.round(transcript.duration)
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
    // Cleanup temp files
    if (tempFilePath) {
      logger.log(`Cleaning up temp file: ${tempFilePath}`);
      await cleanupDownload(tempFilePath);
    }

    // Cleanup chunks if any were created
    if (chunks.length > 0) {
      logger.log(`Cleaning up ${chunks.length} chunk files`);
      await cleanupChunks(chunks);
    }
  }
}
