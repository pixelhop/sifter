export interface PodcastSearchResult {
  id: string;
  title: string;
  author: string | null;
  imageUrl: string | null;
  feedUrl: string | null;
  genres: string[];
  episodeCount: number | null;
}

export interface Subscription {
  id: string;
  subscribedAt: string;
  podcast: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
    rssUrl: string;
    episodeCount: number;
    lastCheckedAt: string | null;
  };
}

export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl;

  async function searchPodcasts(query: string): Promise<PodcastSearchResult[]> {
    const response = await $fetch<{ results: PodcastSearchResult[] }>(
      `${apiUrl}/api/podcasts/search`,
      { params: { q: query } }
    );
    return response.results;
  }

  async function subscribe(feedUrl: string, title?: string, author?: string, imageUrl?: string | null) {
    const response = await $fetch<{ subscription: { id: string; podcast: unknown } }>(
      `${apiUrl}/api/podcasts/subscribe`,
      {
        method: "POST",
        body: { feedUrl, title, author, imageUrl },
      }
    );
    return response.subscription;
  }

  async function getSubscriptions(): Promise<Subscription[]> {
    const response = await $fetch<{ subscriptions: Subscription[] }>(
      `${apiUrl}/api/podcasts/subscriptions`
    );
    return response.subscriptions;
  }

  async function unsubscribe(subscriptionId: string): Promise<void> {
    await $fetch(`${apiUrl}/api/podcasts/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  }

  return {
    searchPodcasts,
    subscribe,
    getSubscriptions,
    unsubscribe,
  };
}
