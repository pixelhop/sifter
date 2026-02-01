import { defineNitroConfig } from "nitropack/config";

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: {
    autoImport: true,
    dirs: ["../providers/**", "../utils/**"],
  },
  runtimeConfig: {
    redisUrl: process.env.REDIS_URL || "",
    bullBoardUsername: "admin",
    bullBoardPassword: "admin",
    // Whisper configuration
    whisperMode: "api", // 'local' | 'api'
    whisperModel: "whisper-1", // OpenAI model or local model size (base, small, medium, large)
    openaiApiKey: process.env.OPENAI_API_KEY || "", // Required for whisperMode: 'api'
    // LLM configuration (OpenRouter or OpenAI)
    llmProvider: process.env.LLM_PROVIDER || "openai", // 'openrouter' or 'openai'
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "", // Required if llmProvider: 'openrouter'
    openrouterHttpReferer: process.env.OPENROUTER_HTTP_REFERER || "https://sifter.app",
    openrouterAppName: process.env.OPENROUTER_APP_NAME || "Sifter",
    defaultLlmModel: process.env.DEFAULT_LLM_MODEL || "gpt-5-mini", // e.g., openai/gpt-5-mini, anthropic/claude-3.5-sonnet
    llmFallbackToOpenai: process.env.LLM_FALLBACK_TO_OPENAI || "false",
    // TTS configuration
    ttsProvider: process.env.TTS_PROVIDER || "elevenlabs", // 'elevenlabs' or 'mock'
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || "",
    ttsDefaultVoice: "ZQe5CZNOzWyzPSCn5a3c", // Default narrator voice (Domi)
  },
});
