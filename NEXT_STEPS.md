# Sifter - Next Steps Summary

## ✅ COMPLETED

### 1. Audio Pipeline Fix
- **Fixed:** FFmpeg clip extraction was producing silent audio
- **Solution:** Moved `-ss` (seek) BEFORE `-i` (input) for fast seeking
- **Files:** `packages/workers/utils/ffmpeg.ts`

### 2. OpenRouter Migration
- **Done:** All LLM calls now go through OpenRouter
- **Benefits:** Can use any model (GPT, Claude, Gemini, Kimi)
- **Config:** Set via `LLM_PROVIDER=openrouter` and `DEFAULT_LLM_MODEL`
- **Files:** New `packages/workers/providers/llm/` module

### 3. Model Comparison
- **Tested:** GPT-5.2, Gemini 3 Flash, Kimi K2.5, Claude Sonnet 4.5
- **Winner:** Claude Sonnet 4.5 🏆
  - Best multi-podcast transitions
  - Most natural scripts
  - Good speed (20s per request)
- **Set as default:** `DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4.5`

### 4. Cross-Episode Curation
- **Implemented:** New pipeline step between analysis and digest generation
- **Function:** Intelligently selects best 6-8 clips from ALL episodes
- **Criteria:** Relevance, topic diversity, source diversity, narrative flow
- **Result:** Fully automatic, no user confirmation needed

---

## 🎯 NEXT STEPS (Priority Order)

### 1. Generate 5 Persona Examples
**Goal:** Create sample digests for different user types

**Personas:**
1. **Startup Founder** - My First Million, Startup Ideas, AI Daily Brief
   - Interests: startups, growth, business ideas
   
2. **Tech Enthusiast** - Lex Fridman, Huberman Lab, AI Daily Brief
   - Interests: AI, neuroscience, technology
   
3. **Marketing Pro** - Marketing School, GaryVee, My First Million
   - Interests: marketing, branding, growth hacking
   
4. **Product Manager** - How I Built This, Product Podcast, Lenny's
   - Interests: product strategy, UX, startups
   
5. **Health Seeker** - Huberman Lab, The Drive, Feel Better Live More
   - Interests: health, fitness, longevity, sleep

**Command:**
```bash
cd /Users/jozefmaxted/clawd/sifter
npx tsx scripts/generate-persona-digest.ts --persona "Startup Founder"
```

---

### 2. Fix Remaining Bugs

#### Bug 1: GPT-5-mini "No Content" Errors
- **Issue:** OpenAI occasionally returns empty responses
- **Solution:** Add fallback to gpt-4o-mini
- **File:** `packages/workers/server/jobs/analysis/worker.ts`

#### Bug 2: FFprobe Failures on Some Audio
- **Issue:** Some podcast audio files fail FFmpeg probing
- **Solution:** Add retry logic or alternative download method
- **File:** `packages/workers/utils/download.ts`

---

### 3. Improve Clip Reports
**Current:** Reports don't show podcast/episode info for each clip

**Desired:**
```
Clip 1: [100] My First Million | "How I went from $0 to $1M"
  Summary: Why distribution matters...
  Duration: 70s | Relevance: 100/100
```

**Files to update:**
- `scripts/compare-models.ts`
- `scripts/dry-run-digest.ts`

---

### 4. Add Digest Preview UI
**Before generating audio, show:**
- Selected clips with summaries
- Podcast/episode sources
- Estimated duration
- Topic coverage
- Cost estimate

**Then:** [Generate Audio] button

**Files:**
- New API endpoint: `GET /api/digests/:id/preview`
- Optional: Simple web UI

---

### 5. Production Deployment Prep

#### Environment Variables Needed:
```bash
# LLM (via OpenRouter)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-xxx
DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4.5

# TTS (ElevenLabs)
ELEVENLABS_API_KEY=sk-xxx

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# OpenAI (for Whisper transcription)
OPENAI_API_KEY=sk-xxx
```

#### Infrastructure:
- [ ] Database migrations applied
- [ ] Redis running
- [ ] Workers service deployed
- [ ] API service deployed
- [ ] Bull Board accessible for monitoring

---

## 💰 COST ESTIMATES

### Per Digest (7-8 min, 3 podcasts, 9 episodes)
| Component | Cost |
|-----------|------|
| Transcription (9 eps) | ~$0.15 |
| Clip Analysis (9 eps) | ~$0.03 |
| Curation (1) | ~$0.01 |
| Script Generation (1) | ~$0.005 |
| ElevenLabs TTS | ~$0.08 |
| **Total** | **~$0.27** |

---

## 📁 KEY FILES

### Implementation:
- `packages/workers/server/jobs/curation/worker.ts` - Curation worker
- `packages/workers/providers/llm/` - LLM client with OpenRouter
- `packages/workers/utils/ffmpeg.ts` - Fixed audio extraction
- `scripts/compare-models.ts` - Model comparison tool
- `scripts/dry-run-digest.ts` - Preview scripts without audio

### Documentation:
- `PROMPT_REFINEMENT.md` - Token analysis & prompts
- `PIPELINE_IMPROVEMENT.md` - Curation design doc
- `MORNING_EXAMPLES.md` - 5 persona examples plan

---

## 🚀 QUICK START FOR FRESH SESSION

```bash
# 1. Start services
cd packages/db && docker-compose up -d
cd packages/workers && pnpm dev
cd packages/api && pnpm dev

# 2. Test curation
curl -X POST http://localhost:3010/api/digests/:id/curate \
  -H "Authorization: Bearer <user-id>"

# 3. Generate digest
curl -X POST http://localhost:3010/api/digests/:id/generate \
  -H "Authorization: Bearer <user-id>"

# 4. Download audio
curl http://localhost:3010/audio/digests/:id.mp3 \
  -H "Authorization: Bearer <user-id>" > digest.mp3
```

---

## 🎯 IMMEDIATE ACTION ITEMS

1. **Generate 5 persona examples** (2-3 hours)
2. **Fix GPT-5-mini fallback** (30 min)
3. **Add podcast/episode info to reports** (1 hour)
4. **Create digest preview endpoint** (2 hours)
5. **Deploy to production** (varies)

**Total estimated time:** ~6-8 hours of work
