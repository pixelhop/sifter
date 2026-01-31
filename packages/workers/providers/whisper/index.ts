/**
 * Whisper Provider Factory
 * Creates the appropriate Whisper provider based on configuration
 */

import type { WhisperProvider, WhisperMode } from "./types";
import { OpenAIWhisperProvider } from "./openai";
import { LocalWhisperProvider } from "./local";

export * from "./types";
export { OpenAIWhisperProvider } from "./openai";
export { LocalWhisperProvider } from "./local";

interface WhisperFactoryConfig {
  mode: WhisperMode;
  model?: string;
  openaiApiKey?: string;
  pythonPath?: string;
}

/**
 * Create a Whisper provider based on the configured mode
 */
export function createWhisperProvider(
  config: WhisperFactoryConfig
): WhisperProvider {
  switch (config.mode) {
    case "api":
      if (!config.openaiApiKey) {
        throw new Error(
          "OPENAI_API_KEY is required when WHISPER_MODE is set to 'api'"
        );
      }
      return new OpenAIWhisperProvider({
        apiKey: config.openaiApiKey,
        model: config.model,
      });

    case "local":
      return new LocalWhisperProvider({
        model: config.model,
        pythonPath: config.pythonPath,
      });

    default:
      throw new Error(`Unknown WHISPER_MODE: ${config.mode}`);
  }
}

/**
 * Get Whisper provider from runtime config
 */
export function useWhisperProvider(): WhisperProvider {
  const runtimeConfig = useRuntimeConfig();

  const mode = (runtimeConfig.whisperMode as WhisperMode) || "api";
  const model = runtimeConfig.whisperModel as string | undefined;
  const openaiApiKey = runtimeConfig.openaiApiKey as string | undefined;

  return createWhisperProvider({
    mode,
    model,
    openaiApiKey,
  });
}
