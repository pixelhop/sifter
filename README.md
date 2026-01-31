# Pixelhop Monorepo Template

This repository is a clean starting point for new Pixelhop projects. It keeps a familiar structure—API, web app, database package, and workers service—without any product-specific logic or vendor lock-ins.

## Packages

| Package | Description |
| --- | --- |
| `packages/api` | Nitro server exposing `/api/health` plus a sample `/api/users` collection backed by Prisma. |
| `packages/app` | Nuxt 4 application with a single landing page that pings the API. |
| `packages/db` | Prisma client with a minimal `Users` model and helper for sharing the client across packages. |
| `packages/workers` | Nitro-based BullMQ worker that seeds an `example-jobs` queue and exposes Bull Board. |

## Requirements

- Node.js 20+
- `pnpm` 9+
- PostgreSQL (or any Postgres-compatible service) for Prisma
- Redis for BullMQ (run `packages/workers/docker-compose.yml` if you need a local instance)

## Getting Started

```bash
pnpm install

# database helpers
cd packages/db
pnpm run prisma:generate

# API server
cd ../api
pnpm dev

# Nuxt app
cd ../app
pnpm dev

# Workers (needs REDIS_URL)
cd ../workers
pnpm dev
```

Environment variables:

- `DATABASE_URL` – used by Prisma/`packages/db`
- `REDIS_URL` – used by `packages/workers`
- `NITRO_PORT` or similar if you want to override default ports

## Customising

- Extend `packages/db/prisma/schema.prisma` with your own models, then rerun `pnpm run prisma:generate`.
- Replace the sample API routes with your domain logic while keeping the shared Prisma helper.
- Drop in your preferred auth provider on the app/API sides (none ships with the template).
- Add more queues or background jobs by following the `example-jobs` pattern in `packages/workers`.

Keep this README updated as you add new conventions so future teams understand how to build on top of the template.*** End Patch
