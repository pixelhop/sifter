# General info

This repository is a Pixelhop starter template that ships with four packages:

- `packages/api` – Nitro API with sample health + users endpoints.
- `packages/app` – Nuxt client with a single landing page.
- `packages/db` – Prisma client + schema exporting a base `Users` model.
- `packages/workers` – Nitro-based BullMQ worker with an example queue.

Guidelines:

- Write all application code in TypeScript.
- Use `pnpm` for dependency management and workspace scripts.
- Keep the template framework-agnostic (no auth providers or product branding by default).

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.agent/PLANS.md`) from design to implementation.
