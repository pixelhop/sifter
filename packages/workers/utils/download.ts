/**
 * Audio Download Utility
 * Streaming download with progress support
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface DownloadResult {
  path: string;
  size: number;
  contentType: string | null;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
  percentage: number | null;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  timeout?: number; // Timeout in milliseconds
  maxRetries?: number;
  headers?: Record<string, string>;
}

const SIFTER_TEMP_DIR = "/tmp/sifter/episodes";

/**
 * Ensure the temp directory exists
 */
export async function ensureTempDir(): Promise<void> {
  await fs.promises.mkdir(SIFTER_TEMP_DIR, { recursive: true });
}

/**
 * Get the temp path for an episode
 */
export function getTempPath(episodeId: string, extension = "mp3"): string {
  return path.join(SIFTER_TEMP_DIR, `${episodeId}.${extension}`);
}

/**
 * Download audio file from URL with streaming
 */
export async function downloadAudio(
  url: string,
  destPath: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const { onProgress, timeout = 30 * 60 * 1000, maxRetries = 3, headers = {} } =
    options;

  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Sifter/1.0 (Podcast Digest Service)",
          ...headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}`
        );
      }

      const contentLength = response.headers.get("content-length");
      const totalSize = contentLength ? parseInt(contentLength, 10) : null;
      const contentType = response.headers.get("content-type");

      let downloadedSize = 0;

      const writeStream = fs.createWriteStream(destPath);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response body to read");
      }

      // Stream the download
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        writeStream.write(value);
        downloadedSize += value.length;

        if (onProgress) {
          onProgress({
            downloaded: downloadedSize,
            total: totalSize,
            percentage: totalSize
              ? Math.round((downloadedSize / totalSize) * 100)
              : null,
          });
        }
      }

      writeStream.end();

      // Wait for file to finish writing
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      return {
        path: destPath,
        size: downloadedSize,
        contentType,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Download failed after all retries");
}

/**
 * Cleanup a downloaded file
 */
export async function cleanupDownload(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to cleanup file ${filePath}:`, error);
    }
  }
}

/**
 * Cleanup all temp files for an episode
 */
export async function cleanupEpisodeTempFiles(episodeId: string): Promise<void> {
  const extensions = ["mp3", "wav", "m4a", "ogg"];

  for (const ext of extensions) {
    const filePath = getTempPath(episodeId, ext);
    await cleanupDownload(filePath);
  }
}

/**
 * Get file size
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
