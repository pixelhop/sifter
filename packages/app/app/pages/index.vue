<script setup lang="ts">
import { reactive } from "vue";

const status = reactive({
  loading: false,
  message: "API not called yet.",
});

async function checkApi() {
  status.loading = true;
  try {
    const response = await $fetch<{ status: string; timestamp: string }>(
      "/api/health",
    );
    status.message = `API responded with "${response.status}" at ${response.timestamp}`;
  } catch (error) {
    status.message =
      error instanceof Error ? error.message : "Unable to reach the API.";
  } finally {
    status.loading = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <p class="text-sm uppercase tracking-[0.3em] text-slate-500">
      Kickoff Checklist
    </p>
    <div class="space-y-4 rounded-xl border border-white/10 bg-slate-900/70 p-6">
      <h2 class="text-2xl font-semibold text-white">You’re ready to build.</h2>
      <p class="text-slate-300">
        This template keeps the monorepo structure (app, api, db, workers) but
        removes project-specific logic so you can plug in your own modules.
      </p>
      <ul class="list-disc space-y-2 pl-5 text-slate-300">
        <li>Update the UI and routes to suit your product.</li>
        <li>Swap in your auth provider (None is installed by default).</li>
        <li>Extend the Prisma schema with the models you need.</li>
      </ul>
      <div class="rounded-lg border border-white/5 bg-slate-950/30 p-4">
        <p class="mb-4 text-sm text-slate-400">
          Send a sample request to the API to confirm everything is wired up.
        </p>
        <button
          type="button"
          class="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          :disabled="status.loading"
          @click="checkApi"
        >
          {{ status.loading ? "Contacting API..." : "Ping /api/health" }}
        </button>
        <p class="mt-4 text-sm text-slate-300">
          {{ status.message }}
        </p>
      </div>
    </div>
  </section>
</template>

