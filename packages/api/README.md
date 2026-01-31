# API Starter

This package contains a minimal [Nitro](https://nitro.build) server configured as part of the Pixelhop template. It demonstrates how to wire the API to the shared Prisma client exported by `packages/db`.

## Available routes

- `GET /api/health` – returns `{ status: "ok" }` so you can quickly test connectivity.
- `GET /api/users` – fetches all rows from the `Users` table.
- `POST /api/users` – accepts `{ email: string, name?: string }` and creates a new user.

## Running locally

```bash
cd packages/api
pnpm dev
```

Make sure `DATABASE_URL` points at a reachable PostgreSQL instance (run `pnpm db:up` in `packages/db` or use the provided docker-compose file there).
