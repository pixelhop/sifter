# Sifter Workers

Background job processing service powered by BullMQ and Redis.

## Queues

- **transcription** - Whisper-based audio transcription
- **analysis** - AI clip selection and relevance scoring
- **stitching** - FFmpeg audio mixing for final digest

## Running Locally

```bash
cd packages/workers
pnpm dev
```

### Required Environment Variables

```bash
# Redis connection (required)
REDIS_URL=redis://localhost:6380

# Whisper configuration
WHISPER_MODE=api          # 'api' for OpenAI, 'local' for local Whisper
WHISPER_MODEL=whisper-1   # For API: whisper-1. For local: tiny, base, small, medium, large
OPENAI_API_KEY=sk-...     # Required when WHISPER_MODE=api
```

### Bull Board Dashboard

Visit `http://localhost:3040/admin/queues` to monitor queues.

Default credentials:
- Username: `admin`
- Password: `admin`

## Whisper Setup

### Option 1: OpenAI Whisper API (Recommended)

Requires an OpenAI API key with access to the Whisper API.

```bash
WHISPER_MODE=api
OPENAI_API_KEY=sk-your-api-key
```

### Option 2: Local Whisper

Runs Whisper locally using Python. Requires:

1. **Python 3.8+** with pip
2. **FFmpeg** installed

```bash
# Install OpenAI Whisper
pip install openai-whisper

# For GPU acceleration (optional)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

Configure:
```bash
WHISPER_MODE=local
WHISPER_MODEL=base  # Options: tiny, base, small, medium, large, large-v2, large-v3
```

**Model sizes:**
| Model | Parameters | English-only | Multilingual | Required VRAM |
|-------|------------|--------------|--------------|---------------|
| tiny | 39M | ~1 GB | ~1 GB | ~1 GB |
| base | 74M | ~1 GB | ~1 GB | ~1 GB |
| small | 244M | ~2 GB | ~2 GB | ~2 GB |
| medium | 769M | ~5 GB | ~5 GB | ~5 GB |
| large | 1550M | N/A | ~10 GB | ~10 GB |

## FFmpeg Setup

FFmpeg is required for audio processing (clip extraction, concatenation, fades).

### macOS
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### Windows
Download from https://ffmpeg.org/download.html and add to PATH.

## Architecture

### Episode Deduplication

Episodes are transcribed **once globally**, not per-user. Multiple users subscribing to the same podcast share the same transcript.

The `Episode.status` field is the single source of truth:
- `pending` - Ready to be processed
- `downloading` - Audio being downloaded
- `transcribing` - Whisper processing
- `transcribed` - Transcript available
- `analyzing` - AI analysis in progress
- `analyzed` - Clips created
- `failed` - Error occurred (can be retried)

### Job Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Transcription Job                     │
├─────────────────────────────────────────────────────────┤
│  pending → downloading → transcribing → transcribed     │
│                                                          │
│  1. Check Episode.status (skip if already processing)   │
│  2. Download audio to /tmp/sifter/episodes/{id}.mp3     │
│  3. Transcribe with Whisper (API or local)              │
│  4. Save transcript JSON to Episode.transcript          │
│  5. Cleanup temp file                                    │
└─────────────────────────────────────────────────────────┘
```

## API Endpoints

The API service exposes endpoints to trigger transcription:

- `GET /api/episodes/:id` - Get episode with transcript
- `POST /api/episodes/:id/transcribe` - Queue transcription job
  - Returns `{ status: 'queued', jobId }` if pending
  - Returns `{ status: 'in_progress' }` if already processing
  - Returns `{ status: 'completed', transcript }` if done
  - Returns `{ status: 'retry_queued', jobId }` if retrying failed

## Development

### Testing the Pipeline

```bash
# Run the test script
pnpm tsx scripts/test-pipeline.ts
```

### Worker Files

```
packages/workers/
├── server/
│   ├── jobs/
│   │   ├── transcription/worker.ts  # Transcription job handler
│   │   ├── analysis/worker.ts       # AI clip selection (Phase 4)
│   │   └── stitching/worker.ts      # Audio mixing (Phase 5)
│   ├── plugins/
│   │   └── queues.ts                # Queue initialization
│   └── utils/
│       ├── jobs.ts                  # Job logging utility
│       ├── queues.ts                # BullMQ queue/worker helpers
│       ├── redis.ts                 # Redis connection
│       └── prisma.ts                # Database client
├── providers/
│   └── whisper/                     # Whisper provider abstraction
│       ├── types.ts
│       ├── openai.ts                # OpenAI API provider
│       ├── local.ts                 # Local Python provider
│       └── index.ts                 # Factory
├── utils/
│   ├── download.ts                  # Audio download utility
│   └── ffmpeg.ts                    # FFmpeg clip utilities
├── scripts/
│   └── whisper-transcribe.py        # Python Whisper wrapper
└── nitro.config.ts
```
