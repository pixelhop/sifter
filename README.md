# Podcast Digest

AI-powered personalized podcast highlights. Listens to podcasts on your behalf, extracts relevant clips, and stitches them into a polished digest with an AI narrator.

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

- **Backend**: Nitro (Node.js)
- **Frontend**: Nuxt 4 (Vue)
- **Database**: PostgreSQL + Prisma
- **Queue**: BullMQ + Redis
- **Audio**: FFmpeg, OpenAI Whisper, ElevenLabs TTS
- **AI**: OpenAI GPT-4 for clip selection

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
DATABASE_URL="postgresql://user:pass@localhost:5432/podcast_digest"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY="sk-..."
ELEVENLABS_API_KEY="..."

# packages/app/.env
NUXT_PUBLIC_API_URL="http://localhost:3001"
```

## Project Structure

```
podcast-digest/
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
│   │       └── elevenlabs.ts # TTS
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
│       │   ├── analyze.ts         # GPT-4 clip selection
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
- [ ] AI clip selection with GPT-4
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
- App: Vercel/Netlify
- Database: Supabase/Neon
- Redis: Upstash
- Storage: S3 + CloudFront

## License

MIT
