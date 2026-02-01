/**
 * TTS Provider Types
 * Abstraction layer for text-to-speech backends
 */

export interface TTSResult {
  audioPath: string;
  duration: number;
  format: string;
}

export interface TTSOptions {
  voice?: string;
  model?: string;
  speed?: number;
}

export interface TTSProvider {
  /**
   * Generate speech from text
   * @param text - Text to convert to speech
   * @param outputPath - Path to save the audio file
   * @param options - TTS options
   * @returns TTS result with audio path and duration
   */
  generate(
    text: string,
    outputPath: string,
    options?: TTSOptions
  ): Promise<TTSResult>;

  /**
   * Get the provider name
   */
  readonly name: string;

  /**
   * Get available voices
   */
  getVoices?(): Promise<Array<{ id: string; name: string; previewUrl?: string }>>;
}
