import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: false,
  css: ["~/assets/css/tailwind.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  experimental: { appManifest: false },
  modules: ["@nuxt/eslint", "@pinia/nuxt"],
  runtimeConfig: {
    public: {
      apiUrl: process.env.API_URL ?? "http://localhost:3010",
    },
  },
});
