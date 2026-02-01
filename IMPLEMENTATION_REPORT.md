# Sifter Implementation Report

## Overview
This report summarizes the implementation of two major features for the Sifter project:
1. **Part 1**: Audio chunking to handle the OpenAI Whisper API 25MB file limit
2. **Part 2**: Phase 5 Digest Generation pipeline

---

## Part 1: Audio Chunking for 25MB Limit

### Problem
Podcast episodes like "My First Million" are ~63MB (50+ minutes), exceeding Whisper's 25MB limit.

### Solution: Hybrid Strategy
The implementation uses a **compression-first, chunking-fallback** approach:

1. **Compression to 64kbps**: Allows ~52 minutes per 25MB (2x capacity of 128kbps)
2. **Time-based chunking**: If compression alone isn't enough, split into ~20-minute chunks

### Files Modified/Created

#### `packages/workers/utils/ffmpeg.ts`
Added comprehensive audio chunking utilities:

**New Constants:**
- `WHISPER_MAX_FILE_SIZE = 25MB`
- `TARGET_CHUNK_SIZE = 22MB` (safety buffer)
- `DEFAULT_CHUNK_DURATION_SECONDS = 20 minutes`

**New Functions:**
- `needsChunking(inputPath)` - Check if file exceeds 25MB
- `compressAudio(inputPath, outputPath, bitrate)` - Compress to specified bitrate
- `tryCompressForWhisper(inputPath, outputPath)` - Attempt compression
- `splitAudioIntoChunks(inputPath, outputDir, options)` - Split audio into time-based chunks
- `prepareAudioForWhisper(inputPath, outputDir, options)` - Smart preparation (compress → chunk if needed)
- `cleanupChunks(chunks)` - Clean up temporary chunk files
- `mergeTranscriptChunks(chunks, detectedLanguage)` - Merge transcripts with timestamp adjustment
- `getTempChunkDir(episodeId)` - Get temp directory for chunks

**Key Features:**
- 2-second overlap between chunks to avoid cutting words mid-sentence
- Automatic timestamp offset adjustment when merging transcripts
- Support for both 128kbps (default) and 64kbps (compressed) bitrates

#### `packages/workers/server/jobs/transcription/worker.ts`
Updated transcription worker to support chunked processing:

**Changes:**
- Added file size check after download
- If file > 25MB, uses `prepareAudioForWhisper()` to create chunks
- Transcribes each chunk sequentially
- Merges chunk transcripts with adjusted timestamps
- Cleans up all temporary files in finally block

**Flow:**
```
downloading → transcribing (single or chunked) → save transcript
```

### Chunking Strategy Summary

| Strategy | Bitrate | Max Duration per 25MB | When Used |
|----------|---------|----------------------|-----------|
| Direct | 128kbps | ~27 minutes | Files < 25MB |
| Compression | 64kbps | ~54 minutes | Files 25-30MB |
| Chunking | 64kbps | Unlimited (20min chunks) | Files > 30MB |

### Test Results
```
✅ File size detection works correctly
✅ Timestamp adjustment for merged transcripts verified
✅ 64kbps compression provides ~2x capacity
✅ 20-minute chunks at 128kbps: ~18MB each (safe)
✅ 20-minute chunks at 64kbps: ~9MB each (very safe)
```

---

## Part 2: Phase 5 - Digest Generation

### Overview
Complete digest generation pipeline that:
1. Generates AI narrator scripts using GPT-5-mini
2. Creates audio using ElevenLabs TTS
3. Stitches clips together with FFmpeg
4. Produces a final digest MP3

### Files Created

#### `packages/workers/providers/tts/index.ts`
TTS provider factory with runtime configuration support.

#### `packages/workers/providers/tts/types.ts`
Type definitions for TTS providers:
- `TTSResult` - Audio generation result
- `TTSOptions` - Voice/model options
- `TTSProvider` - Provider interface

#### `packages/workers/providers/tts/elevenlabs.ts`
ElevenLabs TTS implementation:

**Features:**
- Default voice: "Adam" (professional, neutral)
- Other available voices: Antoni, Arnold, Bella, Domi, Elli, Josh, Rachel, Sam
- Supports custom voice settings (stability, similarity boost)
- Voice listing API support

**Configuration:**
```typescript
runtimeConfig: {
  ttsProvider: "elevenlabs",
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  ttsDefaultVoice: "Adam",
}
```

#### `packages/workers/prompts/narrator-scripts.ts`
GPT-5-mini prompts for narrator script generation:

**System Prompts:**
- `INTRO_SCRIPT_SYSTEM_PROMPT` - Guidelines for intro scripts (under 30s)
- `TRANSITION_SCRIPT_SYSTEM_PROMPT` - Guidelines for transitions (5-10s)
- `OUTRO_SCRIPT_SYSTEM_PROMPT` - Guidelines for outro (under 20s)
- `FULL_SCRIPT_SYSTEM_PROMPT` - Complete script generation

**Prompt Builders:**
- `buildIntroPrompt(input)` - Generate intro script prompt
- `buildTransitionPrompt(currentClip, nextClip?)` - Generate transition prompt
- `buildOutroPrompt(input)` - Generate outro prompt
- `buildFullScriptPrompt(input)` - Generate complete script

**Example Output Format:**
```json
{
  "intro": "Welcome to your personalized digest from My First Million...",
  "transitions": ["Next up...", "Moving on to..."],
  "outro": "That wraps up your digest..."
}
```

#### `packages/workers/server/jobs/digest/worker.ts`
Complete digest generation worker:

**Phases:**
1. **Generating Script** - Call GPT-5-mini for narrator scripts
2. **Generating Audio** - Generate TTS for intro/transitions/outro
3. **Extracting Clips** - Download episodes and slice clip segments
4. **Stitching** - Concatenate all audio components with FFmpeg
5. **Upload & Save** - Store final audio and update database

**Flow:**
```
pending → generating_script → generating_audio → stitching → ready
```

**Audio Pipeline:**
```
intro.mp3 → clip1.mp3 → transition1.mp3 → clip2.mp3 → transition2.mp3 → ... → outro.mp3
```

**Features:**
- Automatic fade in/out on clips (0.3s)
- Progress tracking via job updates
- Comprehensive error handling
- Automatic cleanup of temp files

### Database Schema Updates

#### `packages/db/prisma/schema.prisma`

**Digest Model Updated:**
```prisma
model Digest {
  // ... existing fields ...
  
  // Source tracking (new)
  podcastId  String?  // Primary podcast
  episodeIds String[] // All episodes included
  
  // Relations (updated)
  clips       Clip[]  // Direct relation to clips
}
```

**Clip Model Updated:**
```prisma
model Clip {
  // ... existing fields ...
  
  // New relation
  digestId String?
  digest   Digest? @relation(fields: [digestId], references: [id], onDelete: SetNull)
}
```

**Note:** Run `npx prisma migrate dev` to apply these changes.

### API Endpoints

#### `GET /api/digests`
List all digests for the authenticated user.

**Response:**
```json
{
  "digests": [
    {
      "id": "...",
      "status": "ready",
      "createdAt": "...",
      "audioUrl": "/audio/digests/xxx.mp3",
      "duration": 480,
      "clipCount": 3
    }
  ]
}
```

#### `POST /api/digests`
Create a new digest for the authenticated user.

**Request:**
```json
{
  "clipIds": ["clip-id-1", "clip-id-2", "clip-id-3"],
  "podcastId": "optional-podcast-id"
}
```

**Response:**
```json
{
  "digestId": "...",
  "status": "pending",
  "clipCount": 3,
  "message": "Digest creation queued"
}
```

#### `GET /api/digests/:id`
Get a specific digest with its clips.

**Response:**
```json
{
  "id": "...",
  "status": "ready",
  "audioUrl": "/audio/digests/xxx.mp3",
  "duration": 480,
  "narratorScript": {
    "intro": "...",
    "transitions": ["...", "..."],
    "outro": "..."
  },
  "clips": [...]
}
```

#### `GET /api/digests/:id/audio`
Stream the digest audio file.

**Features:**
- Supports byte-range requests (for audio seeking)
- Proper Content-Type headers
- Cache-Control for performance
- Authentication/ownership check

### Queue Integration

#### `packages/workers/server/plugins/queues.ts`
Added digest worker to the queue system:
- Queue name: `"digest"`
- Worker: `digestWorker`
- Bull Board integration for monitoring

#### `packages/api/server/utils/queues.ts`
Added digest queue constants for API usage.

### Test Results

```
✅ Audio chunking logic validated
✅ Transcript merging with timestamps verified
✅ Compression calculations confirmed
✅ Narrator script prompts generated correctly
✅ ElevenLabs provider structure verified
✅ Worker interfaces functional
✅ API endpoints created and structured
✅ TypeScript compilation successful
```

---

## Testing Instructions

### 1. Run Database Migration
```bash
cd packages/db
npx prisma migrate dev --name add_digest_features
```

### 2. Set Environment Variables
```bash
export OPENAI_API_KEY="your-key"
export ELEVENLABS_API_KEY="your-key"
export DATABASE_URL="postgresql://..."
export REDIS_URL="redis://..."
```

### 3. Run Validation Tests
```bash
npx tsx scripts/test-validation.ts
```

### 4. Test End-to-End (with real audio)
```bash
# Start the workers service
cd packages/workers
pnpm dev

# In another terminal, start the API service
cd packages/api
pnpm dev

# Subscribe to a podcast and test the full flow
curl -X POST http://localhost:3001/api/podcasts/subscribe \
  -H "Authorization: Bearer <user-id>" \
  -d '{"rssUrl": "https://feeds.megaphone.fm/million"}'
```

---

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Audio chunking (FFmpeg) | ✅ Complete | Compression + time-based splitting |
| Transcript merging | ✅ Complete | Timestamp offset adjustment |
| ElevenLabs TTS | ✅ Complete | Default "Adam" voice |
| Narrator scripts | ✅ Complete | GPT-5-mini prompts |
| Digest worker | ✅ Complete | Full pipeline implementation |
| Database schema | ✅ Complete | Needs migration |
| API endpoints | ✅ Complete | CRUD + audio streaming |
| Queue integration | ✅ Complete | Bull Board monitoring |

---

## Known Limitations / Future Improvements

1. **Storage**: Currently stores audio files locally. Production should use S3/CDN.
2. **TTS Duration**: Duration is estimated from word count, not actual audio length.
3. **Chunk Overlap**: 2-second overlap may not be enough for all edge cases.
4. **Voice Selection**: Currently uses single default voice; could add voice options.
5. **Error Recovery**: Limited retry logic for failed chunk transcriptions.

---

## Sample Digest Audio Duration Estimation

For a digest with:
- 3 clips averaging 2 minutes each = 6 minutes
- Intro: ~10 seconds
- 2 transitions: ~10 seconds each = 20 seconds
- Outro: ~10 seconds

**Total: ~6 minutes 40 seconds**

Quality: Professional narrator voice (Adam) with smooth transitions and clip fades.
