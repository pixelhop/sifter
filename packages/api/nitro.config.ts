import { defineNitroConfig } from "nitropack/config";
import { config } from "dotenv";

// Load environment variables
config();

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: {
    autoImport: true,
  },
  runtimeConfig: {
    logLevel: "info",
    redisUrl: process.env.REDIS_URL || "",
    public: {
      apiBase: "/api",
    },
  },
  routeRules: {
    "/**": {
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    },
  },
});
