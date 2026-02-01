/**
 * FFmpeg Utilities
 * Audio processing functions for clip manipulation and chunking
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Whisper API limit: 25MB
export const WHISPER_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
// Target chunk size to stay safely under limit (with some buffer)
export const TARGET_CHUNK_SIZE = 22 * 1024 * 1024; // 22MB
// Default chunk duration for splitting (at 128kbps, ~20 min = ~19MB)
export const DEFAULT_CHUNK_DURATION_MINUTES = 20;
export const DEFAULT_CHUNK_DURATION_SECONDS = DEFAULT_CHUNK_DURATION_MINUTES * 60;

export interface ClipOptions {
  startTime: number; // Start time in seconds
  endTime: number; // End time in seconds
  fadeIn?: number; // Fade in duration in seconds (default: 0.5)
  fadeOut?: number; // Fade out duration in seconds (default: 0.5)
}

export interface AudioInfo {
  duration: number; // Duration in seconds
  sampleRate: number;
  channels: number;
  codec: string;
  bitrate: number; // In kbps
}

/**
 * Run an FFmpeg command and return promise
 */
function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    process.on("error", (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });
  });
}

/**
 * Run ffprobe command and return promise
 */
function runFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffprobe", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        // FFprobe often outputs info to stderr, so check both
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
      }
    });

    process.on("error", (error) => {
      reject(new Error(`FFprobe process error: ${error.message}`));
    });
  });
}

/**
 * Get audio file duration in seconds
 */
export async function getAudioDuration(inputPath: string): Promise<number> {
  const output = await runFFprobe([
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    inputPath,
  ]);

  const info = JSON.parse(output);
  return parseFloat(info.format.duration);
}

/**
 * Get detailed audio information
 */
export async function getAudioInfo(inputPath: string): Promise<AudioInfo> {
  const output = await runFFprobe([
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ]);

  const info = JSON.parse(output);
  const audioStream = info.streams.find(
    (s: { codec_type: string }) => s.codec_type === "audio"
  );

  return {
    duration: parseFloat(info.format.duration),
    sampleRate: parseInt(audioStream?.sample_rate || "44100"),
    channels: audioStream?.channels || 2,
    codec: audioStream?.codec_name || "unknown",
    bitrate: parseInt(info.format.bit_rate || "128000") / 1000,
  };
}

/**
 * Extract a clip from an audio file
 */
export async function sliceClip(
  inputPath: string,
  outputPath: string,
  options: ClipOptions
): Promise<void> {
  const { startTime, endTime, fadeIn = 0.5, fadeOut = 0.5 } = options;
  const duration = endTime - startTime;

  // Ensure output directory exists
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // Build filter for fades
  const filters: string[] = [];

  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeIn}`);
  }

  if (fadeOut > 0) {
    const fadeOutStart = Math.max(0, duration - fadeOut);
    filters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
  }

  const args = [
    "-y", // Overwrite output
    "-ss",
    startTime.toString(), // Seek BEFORE -i for fast seeking
    "-i",
    inputPath,
    "-t",
    duration.toString(),
  ];

  if (filters.length > 0) {
    args.push("-af", filters.join(","));
  }

  // Output settings
  args.push(
    "-acodec",
    "libmp3lame",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath
  );

  await runFFmpeg(args);
}

/**
 * Add fade in/out effects to an existing audio file
 */
export async function addFadeInOut(
  inputPath: string,
  outputPath: string,
  fadeIn: number = 0.5,
  fadeOut: number = 0.5
): Promise<void> {
  const duration = await getAudioDuration(inputPath);

  // Ensure output directory exists
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const filters: string[] = [];

  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeIn}`);
  }

  if (fadeOut > 0) {
    const fadeOutStart = Math.max(0, duration - fadeOut);
    filters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
  }

  const args = ["-y", "-i", inputPath];

  if (filters.length > 0) {
    args.push("-af", filters.join(","));
  }

  args.push(
    "-acodec",
    "libmp3lame",
    "-b:a",
    "128k",
    outputPath
  );

  await runFFmpeg(args);
}

/**
 * Concatenate multiple audio clips into a single file
 */
export async function concatenateClips(
  inputPaths: string[],
  outputPath: string
): Promise<void> {
  if (inputPaths.length === 0) {
    throw new Error("No input files provided for concatenation");
  }

  if (inputPaths.length === 1) {
    // Just copy the single file
    await fs.promises.copyFile(inputPaths[0], outputPath);
    return;
  }

  // Ensure output directory exists
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // Create a temporary file list for concat demuxer
  const listPath = outputPath + ".txt";
  const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
  await fs.promises.writeFile(listPath, listContent);

  try {
    await runFFmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-acodec",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      outputPath,
    ]);
  } finally {
    // Clean up the temporary list file
    await fs.promises.unlink(listPath).catch(() => {});
  }
}

/**
 * Convert audio file to standard format (MP3, 128k, 44.1kHz, stereo)
 */
export async function normalizeAudio(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await runFFmpeg([
    "-y",
    "-i",
    inputPath,
    "-acodec",
    "libmp3lame",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ]);
}

/**
 * Mix multiple audio tracks together (e.g., background music + voice)
 */
export async function mixAudioTracks(
  tracks: Array<{ path: string; volume?: number }>,
  outputPath: string
): Promise<void> {
  if (tracks.length === 0) {
    throw new Error("No tracks provided for mixing");
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const inputs: string[] = [];
  const filterParts: string[] = [];

  tracks.forEach((track, index) => {
    inputs.push("-i", track.path);
    const volume = track.volume ?? 1.0;
    filterParts.push(`[${index}]volume=${volume}[a${index}]`);
  });

  const mixInputs = tracks.map((_, i) => `[a${i}]`).join("");
  const filter =
    filterParts.join(";") +
    `;${mixInputs}amix=inputs=${tracks.length}:duration=longest[out]`;

  await runFFmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-acodec",
    "libmp3lame",
    "-b:a",
    "128k",
    outputPath,
  ]);
}

/**
 * Check if FFmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await runFFmpeg(["-version"]);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// TEMP DIRECTORY HELPERS
// ============================================

const SIFTER_TEMP_DIR = "/tmp/sifter/episodes";

/**
 * Get the temp directory for chunks
 */
export function getTempChunkDir(episodeId: string): string {
  return path.join(SIFTER_TEMP_DIR, `${episodeId}_chunks`);
}

// ============================================
// AUDIO CHUNKING FOR WHISPER API
// ============================================

export interface AudioChunk {
  index: number;
  path: string;
  startTime: number; // Start time in original audio (seconds)
  endTime: number; // End time in original audio (seconds)
  duration: number; // Duration of this chunk (seconds)
}

export interface ChunkingOptions {
  maxChunkSizeBytes?: number;
  targetChunkDurationSeconds?: number;
  compressTo64kbps?: boolean; // Fallback to 64kbps compression
  overlapSeconds?: number; // Overlap between chunks to avoid cutting words
}

/**
 * Get file size in bytes
 */
export async function getFileSize(inputPath: string): Promise<number> {
  const stats = await fs.promises.stat(inputPath);
  return stats.size;
}

/**
 * Check if audio file needs chunking for Whisper API (25MB limit)
 */
export async function needsChunking(inputPath: string): Promise<boolean> {
  const size = await getFileSize(inputPath);
  return size > WHISPER_MAX_FILE_SIZE;
}

/**
 * Compress audio to lower bitrate to fit within size limit
 * 64kbps MP3 allows ~52 minutes per 25MB
 */
export async function compressAudio(
  inputPath: string,
  outputPath: string,
  bitrate: "64k" | "96k" | "128k" = "64k"
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await runFFmpeg([
    "-y",
    "-i",
    inputPath,
    "-acodec",
    "libmp3lame",
    "-b:a",
    bitrate,
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ]);
}

/**
 * Try to compress audio to fit within 25MB limit
 * Returns true if compression succeeded, false if file is still too large
 */
export async function tryCompressForWhisper(
  inputPath: string,
  outputPath: string
): Promise<{ success: boolean; path: string; size: number }> {
  // First try 64kbps compression
  await compressAudio(inputPath, outputPath, "64k");
  const size = await getFileSize(outputPath);

  if (size <= WHISPER_MAX_FILE_SIZE) {
    return { success: true, path: outputPath, size };
  }

  // If still too large, compression alone won't work
  return { success: false, path: outputPath, size };
}

/**
 * Split audio into chunks based on duration
 * Each chunk will have timestamps relative to the original audio
 */
export async function splitAudioIntoChunks(
  inputPath: string,
  outputDir: string,
  options: ChunkingOptions = {}
): Promise<AudioChunk[]> {
  const {
    targetChunkDurationSeconds = DEFAULT_CHUNK_DURATION_SECONDS,
    overlapSeconds = 2, // 2 second overlap to avoid cutting words
  } = options;

  // Get audio info
  const info = await getAudioInfo(inputPath);
  const totalDuration = info.duration;

  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  const chunks: AudioChunk[] = [];
  const baseName = path.basename(inputPath, path.extname(inputPath));

  let currentTime = 0;
  let chunkIndex = 0;

  while (currentTime < totalDuration) {
    // Calculate chunk boundaries
    const chunkStart = Math.max(0, currentTime - overlapSeconds);
    const chunkEnd = Math.min(
      totalDuration,
      currentTime + targetChunkDurationSeconds + overlapSeconds
    );
    const chunkDuration = chunkEnd - chunkStart;

    // Generate output path
    const outputPath = path.join(
      outputDir,
      `${baseName}_chunk_${chunkIndex.toString().padStart(3, "0")}.mp3`
    );

    // Extract chunk (seek BEFORE -i for fast seeking with correct audio)
    await runFFmpeg([
      "-y",
      "-ss",
      chunkStart.toString(),
      "-i",
      inputPath,
      "-t",
      chunkDuration.toString(),
      "-acodec",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      outputPath,
    ]);

    chunks.push({
      index: chunkIndex,
      path: outputPath,
      startTime: chunkStart,
      endTime: chunkEnd,
      duration: chunkDuration,
    });

    // Move to next chunk (accounting for overlap)
    currentTime += targetChunkDurationSeconds;
    chunkIndex++;

    // Break if we've reached the end
    if (currentTime >= totalDuration) {
      break;
    }
  }

  return chunks;
}

/**
 * Smart audio chunking strategy:
 * 1. First, try compressing to 64kbps (allows ~52 min per 25MB)
 * 2. If still too large, split into time-based chunks
 *
 * Returns array of chunks that can be transcribed individually
 */
export async function prepareAudioForWhisper(
  inputPath: string,
  outputDir: string,
  options: ChunkingOptions = {}
): Promise<AudioChunk[]> {
  const fileSize = await getFileSize(inputPath);

  // If file is already under limit, return as single chunk
  if (fileSize <= WHISPER_MAX_FILE_SIZE) {
    const info = await getAudioInfo(inputPath);
    return [
      {
        index: 0,
        path: inputPath,
        startTime: 0,
        endTime: info.duration,
        duration: info.duration,
      },
    ];
  }

  // Try compression first
  const compressedPath = path.join(outputDir, "compressed.mp3");
  const compressResult = await tryCompressForWhisper(inputPath, compressedPath);

  if (compressResult.success) {
    const info = await getAudioInfo(compressedPath);
    return [
      {
        index: 0,
        path: compressedPath,
        startTime: 0,
        endTime: info.duration,
        duration: info.duration,
      },
    ];
  }

  // Compression alone not enough, need to split
  // Clean up failed compression attempt
  await fs.promises.unlink(compressedPath).catch(() => {});

  // Use compression + chunking for maximum space efficiency
  const chunks = await splitAudioIntoChunks(compressedPath, outputDir, {
    ...options,
    targetChunkDurationSeconds: 25 * 60, // 25 min chunks at 64kbps = ~12MB each
  });

  return chunks;
}

/**
 * Clean up chunk files after transcription
 */
export async function cleanupChunks(chunks: AudioChunk[]): Promise<void> {
  for (const chunk of chunks) {
    try {
      await fs.promises.unlink(chunk.path);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Merge multiple transcript chunks, adjusting timestamps
 * Each chunk's segments should have their timestamps offset by the chunk's startTime
 */
export interface TranscriptChunk {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  duration?: number;
}

export interface MergedTranscript {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export function mergeTranscriptChunks(
  chunks: Array<{ chunk: AudioChunk; transcript: TranscriptChunk }>,
  detectedLanguage: string
): MergedTranscript {
  const allSegments: Array<{ start: number; end: number; text: string }> = [];
  const textParts: string[] = [];
  let totalDuration = 0;

  for (const { chunk, transcript } of chunks) {
    // Adjust segment timestamps by chunk's offset
    const adjustedSegments = transcript.segments.map((seg) => ({
      start: seg.start + chunk.startTime,
      end: seg.end + chunk.startTime,
      text: seg.text,
    }));

    allSegments.push(...adjustedSegments);
    textParts.push(transcript.text);

    // Track the furthest end time
    const chunkEndTime =
      chunk.startTime + (transcript.duration || chunk.duration);
    totalDuration = Math.max(totalDuration, chunkEndTime);
  }

  // Sort segments by start time
  allSegments.sort((a, b) => a.start - b.start);

  return {
    text: textParts.join(" ").trim(),
    segments: allSegments,
    language: detectedLanguage,
    duration: totalDuration,
  };
}
