# App Starter

This Nuxt 4 application is intentionally minimal so you can layer in your own UI framework, auth provider, and routes. The default page simply pings the API’s `/api/health` route to prove the stack is connected.

## Commands

```bash
# install deps at repo root
pnpm install

# start the dev server
cd packages/app
pnpm dev

# build for production
pnpm build
```

## Customising

- Add new pages under `app/pages`.
- Extend the default layout in `app/layouts/default.vue` or create additional layouts as needed.
- Tailwind CSS is configured globally in `app/assets/css/tailwind.css`.
- When you add auth, data fetching libraries, or UI kits, document the decision in `packages/app/AGENTS.md`.
