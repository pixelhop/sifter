<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { Subscription } from "~/composables/useApi";

const api = useApi();

const subscriptions = ref<Subscription[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const unsubscribingIds = ref<Set<string>>(new Set());

async function loadSubscriptions() {
  isLoading.value = true;
  error.value = null;

  try {
    subscriptions.value = await api.getSubscriptions();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load subscriptions";
  } finally {
    isLoading.value = false;
  }
}

async function handleUnsubscribe(subscription: Subscription) {
  if (unsubscribingIds.value.has(subscription.id)) return;

  unsubscribingIds.value.add(subscription.id);

  try {
    await api.unsubscribe(subscription.id);
    subscriptions.value = subscriptions.value.filter((s) => s.id !== subscription.id);
  } catch (err) {
    console.error("Unsubscribe failed:", err);
  } finally {
    unsubscribingIds.value.delete(subscription.id);
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

onMounted(() => {
  loadSubscriptions();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">My Subscriptions</h1>
        <p class="mt-1 text-slate-400">Podcasts in your digest</p>
      </div>
      <NuxtLink
        to="/"
        class="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
      >
        Add Podcast
      </NuxtLink>
    </div>

    <!-- Loading state -->
    <div
      v-if="isLoading"
      class="flex items-center justify-center py-12"
    >
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400"
    >
      {{ error }}
      <button
        type="button"
        class="ml-2 underline hover:no-underline"
        @click="loadSubscriptions"
      >
        Retry
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="subscriptions.length === 0"
      class="rounded-lg border border-white/5 bg-slate-900/50 p-8 text-center"
    >
      <svg
        class="mx-auto h-12 w-12 text-slate-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      <p class="mt-4 text-slate-400">No subscriptions yet</p>
      <p class="mt-1 text-sm text-slate-500">Search for podcasts to add to your digest</p>
      <NuxtLink
        to="/"
        class="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
      >
        Discover Podcasts
      </NuxtLink>
    </div>

    <!-- Subscriptions list -->
    <div
      v-else
      class="space-y-4"
    >
      <div
        v-for="subscription in subscriptions"
        :key="subscription.id"
        class="flex items-center gap-4 rounded-xl border border-white/5 bg-slate-900/70 p-4 transition hover:border-white/10"
      >
        <!-- Podcast image -->
        <div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-800">
          <img
            v-if="subscription.podcast.imageUrl"
            :src="subscription.podcast.imageUrl"
            :alt="subscription.podcast.title"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center"
          >
            <svg
              class="h-8 w-8 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
        </div>

        <!-- Podcast info -->
        <div class="min-w-0 flex-1">
          <h3 class="font-medium text-white truncate">{{ subscription.podcast.title }}</h3>
          <p
            v-if="subscription.podcast.author"
            class="text-sm text-slate-400 truncate"
          >
            {{ subscription.podcast.author }}
          </p>
          <div class="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span>{{ subscription.podcast.episodeCount }} episodes</span>
            <span>&middot;</span>
            <span>Subscribed {{ formatDate(subscription.subscribedAt) }}</span>
          </div>
        </div>

        <!-- Actions -->
        <button
          type="button"
          :disabled="unsubscribingIds.has(subscription.id)"
          class="flex-shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleUnsubscribe(subscription)"
        >
          <span v-if="unsubscribingIds.has(subscription.id)">...</span>
          <span v-else>Unsubscribe</span>
        </button>
      </div>
    </div>
  </div>
</template>
