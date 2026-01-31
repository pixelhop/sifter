<script setup lang="ts">
const year = new Date().getFullYear();

const navLinks = [
  { to: "/", label: "Search" },
  { to: "/subscriptions", label: "My Subscriptions" },
];
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-white/5 bg-slate-900/80">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-8">
          <NuxtLink to="/" class="flex items-center gap-2">
            <span class="text-xl font-bold text-white">Sifter</span>
            <span class="rounded bg-sky-500/20 px-1.5 py-0.5 text-xs font-medium text-sky-400">
              FM
            </span>
          </NuxtLink>
          <nav class="hidden sm:flex items-center gap-6">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="text-sm text-slate-400 transition hover:text-white"
              active-class="text-white"
            >
              {{ link.label }}
            </NuxtLink>
          </nav>
        </div>
        <slot name="header-actions" />
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-6 py-8">
      <slot />
    </main>
    <footer class="border-t border-white/5 bg-slate-900/60">
      <div class="mx-auto max-w-5xl px-6 py-4 text-sm text-slate-400">
        Sifter &middot; AI-powered podcast digests &middot; {{ year }}
      </div>
    </footer>
  </div>
</template>
