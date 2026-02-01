# Sifter Morning Examples - Ready to Generate

## Issue to Fix First
- ElevenLabs API quota exceeded (need paid key or new key with credits)
- Also fix: GPT-5-mini "No content" errors (switch to gpt-4o-mini?)
- Also fix: FFprobe errors on some audio files

---

## 5 Persona Examples to Generate

### 1. Startup Founder (✅ Already done - needs regeneration)
**Podcasts:** My First Million, Startup Ideas, AI Daily Brief
**Interests:** startups, business ideas, growth, entrepreneurship, innovation
**Clip Count:** 6-8 clips
**Duration:** ~7-8 minutes

### 2. Tech Enthusiast
**Podcasts:** Lex Fridman Podcast, Huberman Lab, The AI Daily Brief
**Interests:** artificial intelligence, neuroscience, technology, future, science
**Clip Count:** 6-8 clips
**Duration:** ~7-8 minutes

### 3. Marketing Professional
**Podcasts:** Marketing School, The GaryVee Audio Experience, My First Million
**Interests:** marketing, social media, branding, growth hacking, content strategy
**Clip Count:** 6-8 clips
**Duration:** ~7-8 minutes

### 4. Product Manager
**Podcasts:** How I Built This, The Product Podcast, Lenny's Podcast
**Interests:** product management, user experience, product strategy, startups, growth
**Clip Count:** 6-8 clips
**Duration:** ~7-8 minutes

### 5. Health & Wellness Seeker
**Podcasts:** Huberman Lab, The Drive, Feel Better, Live More
**Interests:** health, fitness, nutrition, sleep, mental health, longevity
**Clip Count:** 6-8 clips
**Duration:** ~7-8 minutes

---

## Steps to Generate Each

1. **Subscribe to podcasts** (if not already)
2. **Fetch recent episodes** (2-3 per podcast)
3. **Transcribe episodes** (with chunking for large files)
4. **Analyze with persona interests** (GPT-5-mini or fallback)
5. **Create digest via API** with clipIds
6. **Wait for digest worker** (TTS + clip extraction + mixing)
7. **Deliver MP3**

---

## Time Estimate Per Digest
- Transcription: ~15 min (depends on episode count)
- Analysis: ~5 min
- Digest generation: ~8 min
- **Total: ~30 min per persona**

**All 5 examples: ~2.5 hours**

---

## Required API Keys (Morning Checklist)
- [ ] ElevenLabs API key with sufficient credits ($5-10 should cover all)
- [ ] OpenAI API key (for GPT/transcription)
- [ ] Optional: Switch to gpt-4o-mini if GPT-5-mini keeps failing

---

## Command to Generate
```bash
# For each persona, run:
cd /Users/jozefmaxted/clawd/sifter
node scripts/generate-persona-digest.mjs \
  --persona "Tech Enthusiast" \
  --podcasts "Lex Fridman,Huberman Lab,AI Daily Brief" \
  --interests "artificial intelligence,neuroscience,technology"
```
