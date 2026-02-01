/**
 * ElevenLabs TTS Provider
 * Uses ElevenLabs API for high-quality voice generation
 */

import * as fs from "node:fs";
import type { TTSProvider, TTSOptions, TTSResult } from "./types";

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoice?: string;
  defaultModel?: string;
}

// Default professional narrator voice (Adam is a good neutral professional voice)
export const DEFAULT_ELEVENLABS_VOICE = "Adam";
export const DEFAULT_ELEVENLABS_MODEL = "eleven_monolingual_v1";

// Available voices from ElevenLabs
export const ELEVENLABS_VOICES = {
  ADAM: "Adam", // Professional, authoritative
  ANTONI: "Antoni", // Warm, engaging
  ARNOLD: "Arnold", // Strong, direct
  BELLA: "Bella", // Soft, feminine
  DOMI: "Domi", // Strong, feminine
  ELLI: "Elli", // Whimsical
  JOSH: "Josh", // Friendly, conversational
  RACHEL: "Rachel", // Calm, soothing
  SAM: "Sam", // Young, upbeat
} as const;

export class ElevenLabsProvider implements TTSProvider {
  readonly name = "elevenlabs";
  private apiKey: string;
  private defaultVoice: string;
  private defaultModel: string;

  constructor(config: ElevenLabsConfig) {
    this.apiKey = config.apiKey;
    this.defaultVoice = config.defaultVoice || DEFAULT_ELEVENLABS_VOICE;
    this.defaultModel = config.defaultModel || DEFAULT_ELEVENLABS_MODEL;
  }

  async generate(
    text: string,
    outputPath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    const voice = options?.voice || this.defaultVoice;
    const model = options?.model || this.defaultModel;

    // ElevenLabs API endpoint
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": this.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs API error: ${response.status} - ${errorText}`
      );
    }

    // Get audio data as array buffer
    const audioData = await response.arrayBuffer();

    // Ensure output directory exists
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    if (dir) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Write audio file
    await fs.promises.writeFile(outputPath, Buffer.from(audioData));

    // Estimate duration (rough approximation: ~150 words per minute)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = (wordCount / 150) * 60;

    return {
      audioPath: outputPath,
      duration: Math.round(estimatedDuration),
      format: "mp3",
    };
  }

  async getVoices(): Promise<
    Array<{ id: string; name: string; previewUrl?: string }>
  > {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }

    const data = await response.json();

    return data.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      previewUrl: voice.preview_url,
    }));
  }
}
