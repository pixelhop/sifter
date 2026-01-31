/**
 * FFmpeg Utilities
 * Audio processing functions for clip manipulation
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

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
    "-i",
    inputPath,
    "-ss",
    startTime.toString(),
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
