# Sifter Railway Deployment

## Services to Create

In Railway dashboard, create a new project with these services:

### 1. Redis
- Add → Database → Redis
- Note the `REDIS_URL` (auto-injected)

### 2. Postgres
- Add → Database → PostgreSQL
- Note the `DATABASE_URL` (auto-injected)

### 3. API Service
- Add → GitHub Repo → Select `sifter`
- Settings:
  - Root Directory: `packages/api`
  - Build Command: (uses railway.toml)
  - Start Command: (uses railway.toml)

### 4. Workers Service
- Add → GitHub Repo → Select `sifter`
- Settings:
  - Root Directory: `packages/workers`
  - Build Command: (uses railway.toml)
  - Start Command: (uses railway.toml)

## Environment Variables

Set these in Railway for **both** API and Workers services:

```bash
# Database (auto-injected from Railway Postgres)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (auto-injected from Railway Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# LLM (OpenRouter)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-xxx
DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4.5

# TTS (ElevenLabs)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_xxx

# Whisper (OpenAI API)
OPENAI_API_KEY=sk-xxx

# Node environment
NODE_ENV=production
```

## After Deploy

1. Run database migrations:
   ```bash
   railway run -s api -- pnpm prisma migrate deploy
   ```

2. Check health:
   - API: `https://your-api.railway.app/api/health`
   - Workers: `https://your-workers.railway.app/admin/queues` (login: admin/admin)

3. Test the pipeline:
   ```bash
   curl -X POST https://your-api.railway.app/api/digests/generate \
     -H "Authorization: Bearer <user-id>" \
     -H "Content-Type: application/json" \
     -d '{"frequency": "daily"}'
   ```

## Costs Estimate

- Redis: ~$5/month (Starter)
- Postgres: ~$5/month (Starter)
- API: ~$5/month (usage-based)
- Workers: ~$10/month (usage-based, more compute)
- **Total: ~$25/month** for dev/testing
