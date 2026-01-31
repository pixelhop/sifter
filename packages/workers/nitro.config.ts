import { defineNitroConfig } from "nitropack/config";

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: {
    autoImport: true,
  },
  runtimeConfig: {
    redisUrl: "",
    bullBoardUsername: "admin",
    bullBoardPassword: "admin",
  },
});
