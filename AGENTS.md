# Podcast Digest

AI-powered personalized podcast highlights. The app listens to podcasts on your behalf, extracts relevant clips using AI, and stitches them into a polished daily/weekly digest with an AI narrator.

## Project Structure

This is a monorepo with four packages:

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/api` | Nitro | REST API — auth, podcast management, digest generation, audio processing endpoints |
| `packages/app` | Nuxt 4 | Web app — user dashboard, podcast search, digest player |
| `packages/db` | Prisma | PostgreSQL database — users, podcasts, episodes, clips, digests |
| `packages/workers` | BullMQ | Background jobs — transcription, AI analysis, audio stitching |

## Tech Stack

- **API**: Nitro (Node.js) with OpenAI, ElevenLabs, FFmpeg
- **Frontend**: Nuxt 4 (Vue 3) with Tailwind
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ with Redis
- **Audio**: FFmpeg for mixing, Whisper API for transcription, ElevenLabs for TTS

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
3. GPT-4 analyzes transcript, selects clips with timestamps
4. FFmpeg slices clips and adds fade in/out
5. ElevenLabs generates AI narrator audio
6. FFmpeg mixes everything together

## External APIs

- **iTunes Search API** — podcast discovery (free, no auth)
- **OpenAI Whisper** — transcription ($0.006/min)
- **OpenAI GPT-4** — clip selection
- **ElevenLabs** — AI narrator TTS ($5/month for 100K chars)

## Guidelines

- Write all code in TypeScript
- Use `pnpm` for dependencies and workspace scripts
- Keep packages decoupled — API shouldn't import from app
- Use Prisma client from `packages/db` in API and workers
- Queue long-running jobs (transcription, stitching) in workers
- Store audio files in S3, reference by URL in database

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
