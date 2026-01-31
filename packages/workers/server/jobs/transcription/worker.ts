import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";

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
  };
}

/**
 * Transcription worker
 * Downloads episode audio and transcribes it using Whisper API
 */
export default async function transcriptionWorker(
  job: Job<TranscriptionJobData>
): Promise<TranscriptionJobResult> {
  const logger = useJobLogger(job);
  const { episodeId, audioUrl } = job.data;

  logger.log(`Starting transcription for episode: ${episodeId}`);
  logger.log(`Audio URL: ${audioUrl}`);

  // TODO: Implement actual transcription logic:
  // 1. Download audio from audioUrl
  // 2. Send to Whisper API for transcription
  // 3. Update episode status in database
  // 4. Store transcript with timestamps

  logger.log("Transcription job completed (placeholder)");

  return {
    episodeId,
    transcript: {
      text: "Placeholder transcript",
      segments: [],
    },
  };
}
