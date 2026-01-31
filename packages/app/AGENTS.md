# Frontend guidelines

- Use Vue 3 with `<script setup lang="ts">` sections and keep the order `script -> template -> style`.
- Tailwind CSS is available globally; prefer utility classes over custom CSS whenever possible.
- There is no default auth provider; when you add one, keep integration-specific logic inside dedicated composables or plugins.
- Keep the default layout lightweight. Add UI frameworks only when the project requires them and document the choice in this file.
- Use Nuxt auto-imports (`~/composables`, `~/utils`, etc.) instead of manual import barrels where possible.
- When interacting with the API from pages or components, prefer `$fetch` or dedicated composables for data fetching.
- Before opening a PR, run `pnpm run build` inside `packages/app`.
