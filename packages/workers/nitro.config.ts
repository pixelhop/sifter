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
    redisUrl: "",
    bullBoardUsername: "admin",
    bullBoardPassword: "admin",
    // Whisper configuration
    whisperMode: "api", // 'local' | 'api'
    whisperModel: "whisper-1", // OpenAI model or local model size (base, small, medium, large)
    openaiApiKey: "", // Required for whisperMode: 'api'
  },
});
