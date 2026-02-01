/**
 * Mock TTS Provider for Testing
 * Creates silent/placeholder MP3 files without API calls
 */

import * as fs from "node:fs";
import type { TTSProvider, TTSOptions, TTSResult } from "./types";

interface MockConfig {
  defaultVoice?: string;
}

// Simple MP3 header for a silent file (1 second at low bitrate)
const SILENT_MP3_HEADER = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

export class MockTTSProvider implements TTSProvider {
  readonly name = "mock";
  private defaultVoice: string;

  constructor(config: MockConfig = {}) {
    this.defaultVoice = config.defaultVoice || "mock-voice";
  }

  async generate(
    text: string,
    outputPath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    // Estimate duration based on text length (average 150 words per minute)
    const wordCount = text.split(/\s+/).length;
    const duration = Math.max(1, Math.ceil((wordCount / 150) * 60)); // seconds

    // Create a mock MP3 file with estimated size
    // MP3 at 32kbps: 4KB per second
    const estimatedSize = duration * 4 * 1024;
    
    // Create file with repeated header pattern
    const chunks = Math.ceil(estimatedSize / SILENT_MP3_HEADER.length);
    const buffer = Buffer.concat(
      Array(chunks).fill(SILENT_MP3_HEADER),
      estimatedSize
    );
    
    await fs.promises.writeFile(outputPath, buffer);

    return {
      path: outputPath,
      duration,
      size: estimatedSize,
    };
  }
}
