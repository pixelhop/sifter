/**
 * Whisper Provider Types
 * Abstraction layer for different transcription backends
 */

export interface TranscriptSegment {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string; // Transcribed text for this segment
}

export interface TranscriptionResult {
  text: string; // Full transcript text
  segments: TranscriptSegment[];
  language?: string; // Detected language
  duration?: number; // Audio duration in seconds
}

export interface WhisperProviderOptions {
  model?: string; // Model size: tiny, base, small, medium, large, large-v2, large-v3
  language?: string; // Force language (optional, auto-detect by default)
  prompt?: string; // Optional prompt to guide transcription
}

export interface WhisperProvider {
  /**
   * Transcribe an audio file
   * @param audioPath - Path to the audio file
   * @param options - Transcription options
   * @returns Transcription result with segments
   */
  transcribe(
    audioPath: string,
    options?: WhisperProviderOptions
  ): Promise<TranscriptionResult>;

  /**
   * Get the provider name
   */
  readonly name: string;
}

export type WhisperMode = "local" | "api";
