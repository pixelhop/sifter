# Sifter

AI-powered personalized podcast highlights. Sifter listens to podcasts on your behalf, extracts relevant clips using AI, and stitches them into a polished daily digest with an AI narrator.

## What It Does

1. **Subscribe** to your favorite podcasts
2. **AI analyzes** new episodes and finds interesting segments
3. **Auto-stitches** clips with an AI narrator into a digest
4. **Listen** in your private podcast feed
5. **Share** your curated digest publicly (optional)

## Architecture

| Package | Purpose |
|---------|---------|
| `packages/api` | REST API — auth, podcast management, digest generation |
| `packages/app` | Nuxt 4 web app — user dashboard, podcast search |
| `packages/db` | Prisma schema — users, podcasts, episodes, clips, digests |
| `packages/workers` | BullMQ workers — transcription, AI analysis, audio stitching |

## Tech Stack

- **Backend**: Nitro (Node.js) with Vercel AI SDK
- **Frontend**: Nuxt 4 (Vue)
- **Database**: PostgreSQL + Prisma
- **Queue**: BullMQ + Redis
- **Audio**: FFmpeg, OpenAI Whisper, ElevenLabs TTS
- **AI**: Vercel AI SDK + OpenRouter (GPT-4, Claude, etc.)

## Getting Started

```bash
pnpm install

# Setup database
cd packages/db
pnpm run prisma:generate
pnpm run prisma:migrate:dev

# Start Redis for workers
cd packages/workers
docker-compose up -d

# Start all services
cd ../..
pnpm dev
```

## Environment Variables

```bash
# packages/api/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/sifter"
REDIS_URL="redis://localhost:6379"
OPENROUTER_API_KEY="sk-or-..."
ELEVENLABS_API_KEY="..."
WHISPER_API_KEY="..."  # OpenAI API key for Whisper

# packages/app/.env
NUXT_PUBLIC_API_URL="http://localhost:3001"
```

## AI SDK Configuration

We use Vercel AI SDK with OpenRouter for maximum flexibility:

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Use any model: GPT-4, Claude, Llama, etc.
const model = openrouter('anthropic/claude-3.5-sonnet');
```

## Project Structure

```
sifter/
├── packages/
│   ├── api/           # Nitro API server
│   │   ├── routes/
│   │   │   ├── auth/       # Login/register
│   │   │   ├── podcasts/   # Subscribe, search
│   │   │   ├── digests/    # Generate, list
│   │   │   └── clips/      # Clip details
│   │   └── utils/
│   │       ├── audio.ts    # FFmpeg helpers
│   │       ├── whisper.ts  # Transcription
│   │       └── ai.ts       # Vercel AI SDK + OpenRouter
│   │
│   ├── app/           # Nuxt 4 frontend
│   │   ├── pages/
│   │   │   ├── index.vue      # Landing
│   │   │   ├── dashboard.vue  # My digests
│   │   │   ├── podcasts.vue   # Search & subscribe
│   │   │   └── digest/[id].vue # Listen to digest
│   │   └── components/
│   │       ├── AudioPlayer.vue
│   │       ├── PodcastSearch.vue
│   │       └── DigestCard.vue
│   │
│   ├── db/            # Prisma database
│   │   ├── prisma/
│   │   │   └── schema.prisma  # Models
│   │   └── src/
│   │       └── index.ts       # Database client
│   │
│   └── workers/       # BullMQ background jobs
│       ├── jobs/
│       │   ├── transcribe.ts      # Whisper transcription
│       │   ├── analyze.ts         # AI clip selection
│       │   └── stitch.ts          # FFmpeg audio mixing
│       └── queues/
│           └── index.ts
│
└── specs/
    └── mvp-spec.md    # Full MVP specification
```

## Key Features (MVP)

- [ ] User auth & profile setup
- [ ] Podcast search via iTunes API
- [ ] RSS feed subscription (5-10 podcasts)
- [ ] Daily/weekly digest generation
- [ ] AI clip selection with Vercel AI SDK
- [ ] AI narrator with ElevenLabs
- [ ] Audio stitching with FFmpeg
- [ ] Private podcast feed
- [ ] Public digest sharing

## Development

```bash
# Run everything
pnpm dev

# Run specific package
pnpm --filter api dev
pnpm --filter app dev
pnpm --filter workers dev

# Database commands
cd packages/db
pnpm run prisma:studio    # Open Prisma Studio
pnpm run prisma:migrate:dev  # Create migration
```

## Deployment

- API: Render/Railway
- App: Vercel
- Database: Supabase/Neon
- Redis: Upstash
- Storage: S3 + CloudFront

## License

MIT
