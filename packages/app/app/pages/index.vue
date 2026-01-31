<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { PodcastSearchResult } from "~/composables/useApi";

const api = useApi();

const searchQuery = ref("");
const debouncedQuery = useDebouncedRef(searchQuery, 300);

const searchResults = ref<PodcastSearchResult[]>([]);
const isSearching = ref(false);
const searchError = ref<string | null>(null);
const hasSearched = ref(false);

// Track which podcasts are being subscribed
const subscribingIds = ref<Set<string>>(new Set());
const subscribedFeedUrls = ref<Set<string>>(new Set());

// Watch for debounced query changes
watch(debouncedQuery, async (query) => {
  if (!query.trim()) {
    searchResults.value = [];
    hasSearched.value = false;
    return;
  }

  isSearching.value = true;
  searchError.value = null;
  hasSearched.value = true;

  try {
    searchResults.value = await api.searchPodcasts(query);
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : "Search failed";
    searchResults.value = [];
  } finally {
    isSearching.value = false;
  }
});

async function handleSubscribe(podcast: PodcastSearchResult) {
  if (!podcast.feedUrl || subscribingIds.value.has(podcast.id)) return;

  subscribingIds.value.add(podcast.id);

  try {
    await api.subscribe(podcast.feedUrl, podcast.title, podcast.author ?? undefined, podcast.imageUrl);
    subscribedFeedUrls.value.add(podcast.feedUrl);
  } catch (err) {
    // Show error (could improve with toast notification)
    console.error("Subscribe failed:", err);
  } finally {
    subscribingIds.value.delete(podcast.id);
  }
}

const showEmptyState = computed(() => {
  return hasSearched.value && !isSearching.value && searchResults.value.length === 0 && !searchError.value;
});
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-white">Discover Podcasts</h1>
      <p class="mt-1 text-slate-400">Search for podcasts to add to your digest</p>
    </div>

    <!-- Search input -->
    <div class="relative">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search podcasts..."
        class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3 pl-11 text-white placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
      />
      <svg
        class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <div
        v-if="isSearching"
        class="absolute right-4 top-1/2 -translate-y-1/2"
      >
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />
      </div>
    </div>

    <!-- Error state -->
    <div
      v-if="searchError"
      class="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400"
    >
      {{ searchError }}
    </div>

    <!-- Empty state -->
    <div
      v-else-if="showEmptyState"
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
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
      <p class="mt-4 text-slate-400">No podcasts found for "{{ debouncedQuery }}"</p>
      <p class="mt-1 text-sm text-slate-500">Try a different search term</p>
    </div>

    <!-- Initial state -->
    <div
      v-else-if="!hasSearched && !isSearching"
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
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <p class="mt-4 text-slate-400">Search for your favorite podcasts</p>
      <p class="mt-1 text-sm text-slate-500">Try "startup", "tech", or "comedy"</p>
    </div>

    <!-- Search results -->
    <div
      v-else-if="searchResults.length > 0"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="podcast in searchResults"
        :key="podcast.id"
        class="group flex flex-col overflow-hidden rounded-xl border border-white/5 bg-slate-900/70 transition hover:border-white/10"
      >
        <!-- Podcast image -->
        <div class="aspect-square overflow-hidden bg-slate-800">
          <img
            v-if="podcast.imageUrl"
            :src="podcast.imageUrl"
            :alt="podcast.title"
            class="h-full w-full object-cover transition group-hover:scale-105"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center"
          >
            <svg
              class="h-16 w-16 text-slate-600"
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
        <div class="flex flex-1 flex-col p-4">
          <h3 class="font-medium text-white line-clamp-2">{{ podcast.title }}</h3>
          <p
            v-if="podcast.author"
            class="mt-1 text-sm text-slate-400 line-clamp-1"
          >
            {{ podcast.author }}
          </p>
          <div class="mt-auto pt-4">
            <button
              v-if="podcast.feedUrl && !subscribedFeedUrls.has(podcast.feedUrl)"
              type="button"
              :disabled="subscribingIds.has(podcast.id)"
              class="w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              @click="handleSubscribe(podcast)"
            >
              <span v-if="subscribingIds.has(podcast.id)">Subscribing...</span>
              <span v-else>Subscribe</span>
            </button>
            <button
              v-else-if="podcast.feedUrl && subscribedFeedUrls.has(podcast.feedUrl)"
              type="button"
              disabled
              class="w-full rounded-lg bg-green-600/20 px-4 py-2 text-sm font-medium text-green-400"
            >
              Subscribed
            </button>
            <p
              v-else
              class="text-center text-sm text-slate-500"
            >
              No RSS feed available
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
