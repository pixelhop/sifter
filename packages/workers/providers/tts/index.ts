/**
 * TTS Provider Factory
 * Creates the appropriate TTS provider based on configuration
 */

import type { TTSProvider } from "./types";
import { ElevenLabsProvider } from "./elevenlabs";
import { MockTTSProvider } from "./mock";

export * from "./types";
export { ElevenLabsProvider, ELEVENLABS_VOICES, DEFAULT_ELEVENLABS_VOICE } from "./elevenlabs";
export { MockTTSProvider } from "./mock";

interface TTSFactoryConfig {
  provider: "elevenlabs" | "mock";
  apiKey?: string;
  defaultVoice?: string;
}

/**
 * Create a TTS provider based on the configured provider
 */
export function createTTSProvider(config: TTSFactoryConfig): TTSProvider {
  switch (config.provider) {
    case "elevenlabs":
      if (!config.apiKey) {
        throw new Error(
          "ELEVENLABS_API_KEY is required when TTS_PROVIDER is set to 'elevenlabs'"
        );
      }
      return new ElevenLabsProvider({
        apiKey: config.apiKey,
        defaultVoice: config.defaultVoice,
      });

    case "mock":
      return new MockTTSProvider({
        defaultVoice: config.defaultVoice,
      });

    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}

/**
 * Get TTS provider from runtime config
 */
export function useTTSProvider(): TTSProvider {
  const runtimeConfig = useRuntimeConfig();

  const provider = (runtimeConfig.ttsProvider as string) || "elevenlabs";
  const apiKey = runtimeConfig.elevenlabsApiKey as string | undefined;
  const defaultVoice = (runtimeConfig.ttsDefaultVoice as string) || "Adam";

  // Fall back to mock provider if no API key available
  if (!apiKey || provider === "mock") {
    console.log("[TTS] Using mock provider (no API key or explicitly configured)");
    return createTTSProvider({
      provider: "mock",
      defaultVoice,
    });
  }

  return createTTSProvider({
    provider: provider as "elevenlabs",
    apiKey,
    defaultVoice,
  });
}
