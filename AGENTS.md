# Sifter

AI-powered personalized podcast highlights. Sifter listens to podcasts on your behalf, extracts relevant clips using AI, and stitches them into a polished daily/weekly digest with an AI narrator.

## Project Structure

This is a monorepo with four packages:

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/api` | Nitro | REST API — auth, podcast management, digest generation, audio processing |
| `packages/app` | Nuxt 4 | Web app — user dashboard, podcast search, digest player |
| `packages/db` | Prisma | PostgreSQL database — users, podcasts, episodes, clips, digests |
| `packages/workers` | BullMQ | Background jobs — transcription, AI analysis, audio stitching |

## Tech Stack

- **API**: Nitro (Node.js) with Vercel AI SDK
- **Frontend**: Nuxt 4 (Vue 3) with Tailwind
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ with Redis
- **Audio**: FFmpeg for mixing, OpenAI Whisper for transcription, ElevenLabs for TTS
- **AI**: Vercel AI SDK + OpenRouter (access to GPT-4, Claude, Llama, etc.)

## Key Concepts

**Digest**: A generated audio file containing:
- AI narrator intro/outro
- 3-5 clips from different podcasts
- Smooth fade transitions

**Clip**: A segment of a podcast episode selected by AI as relevant to user interests

**Episode**: A podcast episode that gets transcribed and analyzed

## Audio Pipeline

1. Download episode MP3
2. Transcribe with Whisper API (word-level timestamps)
3. AI analyzes transcript (via Vercel AI SDK), selects clips with timestamps
4. FFmpeg slices clips and adds fade in/out
5. ElevenLabs generates AI narrator audio
6. FFmpeg mixes everything together

## External APIs

- **iTunes Search API** — podcast discovery (free, no auth)
- **OpenAI Whisper** — transcription ($0.006/min)
- **OpenRouter** — LLM access via Vercel AI SDK (GPT-4, Claude, etc.)
- **ElevenLabs** — AI narrator TTS ($5/month for 100K chars)

## AI SDK Configuration

We use Vercel AI SDK with OpenRouter for flexibility:

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const { text } = await generateText({
  model: openrouter('anthropic/claude-3.5-sonnet'),
  prompt: 'Select clips from this transcript...',
});
```

## Guidelines

- Write all code in TypeScript
- Use `pnpm` for dependencies and workspace scripts
- Keep packages decoupled — API shouldn't import from app
- Use Prisma client from `packages/db` in API and workers
- Queue long-running jobs (transcription, stitching) in workers
- Store audio files in S3, reference by URL in database
- Use Vercel AI SDK for all LLM calls (via OpenRouter)

## Environment Setup

See README.md for full setup instructions.

Quick start:
```bash
pnpm install
cd packages/db && pnpm run prisma:generate
pnpm dev
```

## Full Specification

See `specs/mvp-spec.md` for complete feature list, data models, API endpoints, and AI prompts.
