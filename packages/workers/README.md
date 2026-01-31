# Workers Starter

This package is a Nitro service that hosts background jobs powered by BullMQ and Redis. It ships with a single queue (`example-jobs`) that enqueues a repeating task every minute, demonstrating how to wire workers into the rest of the template.

## Running locally

```bash
cd packages/workers
pnpm dev
```

Set `REDIS_URL` (or `nitro.config.ts -> runtimeConfig.redisUrl`) before launching.

Visit `http://localhost:3040/admin/queues` and authenticate with the username/password defined in runtime config to monitor the queue via Bull Board.
