<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-white/5 bg-slate-900/80">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pixelhop Template
          </p>
          <h1 class="text-lg font-semibold">Nuxt Starter Shell</h1>
        </div>
        <slot name="header-actions" />
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-6 py-12">
      <slot />
    </main>
    <footer class="border-t border-white/5 bg-slate-900/60">
      <div class="mx-auto max-w-5xl px-6 py-4 text-sm text-slate-400">
        Ready for your next idea · {{ year }}
      </div>
    </footer>
  </div>
</template>

