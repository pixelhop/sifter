/**
 * OpenAI Whisper API Provider
 * Uses OpenAI's cloud API for transcription
 */

import * as fs from "node:fs";
import type {
  WhisperProvider,
  WhisperProviderOptions,
  TranscriptionResult,
  TranscriptSegment,
} from "./types";

interface OpenAIWhisperConfig {
  apiKey: string;
  model?: string;
}

interface OpenAISegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface OpenAIVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: OpenAISegment[];
}

export class OpenAIWhisperProvider implements WhisperProvider {
  readonly name = "openai";
  private apiKey: string;
  private defaultModel: string;

  constructor(config: OpenAIWhisperConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.model || "whisper-1";
  }

  async transcribe(
    audioPath: string,
    options?: WhisperProviderOptions
  ): Promise<TranscriptionResult> {
    const formData = new FormData();

    // Read file as blob for FormData
    const fileBuffer = fs.readFileSync(audioPath);
    const blob = new Blob([fileBuffer], { type: "audio/mpeg" });
    formData.append("file", blob, audioPath.split("/").pop() || "audio.mp3");
    formData.append("model", this.defaultModel);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    if (options?.language) {
      formData.append("language", options.language);
    }

    if (options?.prompt) {
      formData.append("prompt", options.prompt);
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Whisper API error: ${response.status} - ${error}`);
    }

    const data: OpenAIVerboseResponse = await response.json();

    const segments: TranscriptSegment[] = data.segments.map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }));

    return {
      text: data.text,
      segments,
      language: data.language,
      duration: data.duration,
    };
  }
}
