# Sifter Prompt Refinement & Token Analysis

## Current Prompts

### 1. Clip Selection (Analysis Phase)
**File:** `packages/workers/prompts/clip-selection.ts`

**System Prompt:**
```
You are an expert podcast curator. Your task is to analyze podcast transcripts and identify the most valuable, interesting, and relevant clips for a listener.

## Your Goal
Extract 3-5 high-quality clips from the provided transcript that would be most interesting and relevant to the listener based on their interests.

## Clip Requirements
- Each clip should be 30-120 seconds long
- Self-contained: make sense without additional context
- Capture complete thoughts, not mid-sentence
- Avoid ads, intros, promos, repetitive content

## What Makes a Good Clip
- Insights, unique perspectives, "aha moments"
- Interesting stories, anecdotes, examples
- Actionable advice or practical tips
- Thought-provoking ideas or contrarian takes
- Expert knowledge or insider information

## Relevance Scoring (0-100)
- 90-100: Directly addresses user interests with valuable content
- 70-89: Related to user interests with good insights
- 50-69: Generally interesting, tangentially related
- 30-49: Interesting but not related to stated interests
- 0-29: Generic or low-value (avoid)

## Output Format
Return JSON with clips array containing:
- startTime, endTime, transcript, relevanceScore, reasoning, summary
```

**User Prompt includes:**
- User interests (if provided)
- Podcast name, episode title, duration
- Full transcript with timestamps

---

### 2. Narrator Script Generation (Digest Phase)
**File:** `packages/workers/prompts/narrator-scripts.ts`

**System Prompt:**
```
You are a professional podcast narrator for Sifter, a personalized podcast digest service.
Your job is to write a complete narrator script including intro, transitions, and outro.

## Guidelines
- Conversational, friendly tone
- Intro: Welcome listener, set expectations (under 30 seconds)
- Transitions: Brief bridges between clips (5-10 seconds each)
- Outro: Thank listener, wrap up naturally (under 20 seconds)
- Don't reference timestamps or durations in spoken text

Return JSON with: intro, transitions (array), outro
```

**User Prompt includes:**
- Podcast title(s)
- Clip summaries with durations
- Total duration
- User name (if personalized)

---

## Token Usage Analysis

### Clip Selection (Per Episode)

| Component | Approx Tokens | Notes |
|-----------|--------------|-------|
| System Prompt | ~500 | Fixed |
| User Prompt | ~2,000-8,000 | Depends on transcript length |
| - Transcript (60 min) | ~6,000-8,000 | ~100 words/minute |
| - Episode info | ~100 | Fixed |
| - User interests | ~50 | Fixed |
| **Total Input** | **~2,500-8,500** | |
| **Output (5 clips)** | **~800-1,200** | JSON with clip data |
| **Total per episode** | **~3,300-9,700** | |

**Cost (GPT-5-mini):**
- ~$0.002-0.006 per episode
- 10 episodes = ~$0.02-0.06

### Narrator Script Generation (Per Digest)

| Component | Approx Tokens | Notes |
|-----------|--------------|-------|
| System Prompt | ~200 | Fixed |
| User Prompt | ~300-600 | Depends on clip count |
| - Clip summaries | ~200-400 | ~50 words per clip |
| - Podcast info | ~100 | Fixed |
| **Total Input** | **~500-800** | |
| **Output (script)** | **~300-500** | JSON with intro/transitions/outro |
| **Total per digest** | **~800-1,300** | |

**Cost (GPT-5-mini):**
- ~$0.0005-0.001 per digest
- Negligible compared to clip selection

---

## Total Cost for Multi-Podcast Digest

**Example: 3 podcasts, 9 episodes, 1 digest**

| Step | Episodes | Tokens | Cost |
|------|----------|--------|------|
| Clip Selection | 9 | ~45,000 | ~$0.03 |
| Script Generation | 1 | ~1,000 | ~$0.001 |
| **Total LLM** | - | **~46,000** | **~$0.03** |

**Plus ElevenLabs TTS:**
- ~1,500 characters = ~3,000 credits
- ~$0.05-0.10 per digest

**Total per digest: ~$0.08-0.15**

---

## Dry Run Mode (Preview Scripts Without Audio)

Created: `scripts/dry-run-digest.ts`

**Usage:**
```bash
cd /Users/jozefmaxted/clawd/sifter
npx tsx scripts/dry-run-digest.ts \
  --digest-id <digest-id> \
  --show-clips \
  --show-tokens \
  --model gpt-5-mini
```

**Output includes:**
1. Full narrator script (intro, transitions, outro)
2. Clip summaries and key excerpts
3. Estimated token usage
4. Cost breakdown
5. No audio generated, no API costs (except LLM)

---

## Testing Different Models

### Currently Using
- **Clip Selection:** GPT-5-mini
- **Script Generation:** GPT-5-mini

### Alternative Models to Test

| Model | Use For | Pros | Cons |
|-------|---------|------|------|
| **gpt-4o** | Clip selection | Better reasoning, fewer errors | 10x cost |
| **gpt-4o-mini** | Clip selection | Good balance, cheaper than 4o | Slightly worse than 4o |
| **claude-3-5-sonnet** | Script generation | More natural, creative scripts | Slower, different API |
| **gpt-5-mini** | Both (current) | Fast, cheap, good enough | Occasional "no content" errors |

### A/B Testing Script

```bash
# Test clip selection with different models
npx tsx scripts/test-model.ts \
  --episode-id <id> \
  --models gpt-5-mini,gpt-4o-mini,gpt-4o \
  --output comparison.json

# Compare results side-by-side
npx tsx scripts/compare-models.ts \
  --input comparison.json \
  --format markdown
```

---

## Recommended Improvements

### 1. Add Dry Run Mode to Worker
Add flag to digest worker:
```typescript
interface DigestJobData {
  // ... existing fields
  dryRun?: boolean; // If true, only generate scripts, no audio
}
```

### 2. Token Logging
Add detailed token tracking:
```typescript
logger.log(`Clip selection: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
logger.log(`Script generation: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
logger.log(`Total LLM cost: $${estimatedCost}`);
```

### 3. Model Fallback
If GPT-5-mini fails, fallback to gpt-4o-mini:
```typescript
try {
  result = await callGPT5Mini(prompt);
} catch (e) {
  logger.warn("GPT-5-mini failed, falling back to 4o-mini");
  result = await callGPT4oMini(prompt);
}
```

### 4. Prompt Versioning
Track prompt versions for A/B testing:
```typescript
const PROMPT_VERSION = "v2.1";
logger.log(`Using prompt version: ${PROMPT_VERSION}`);
```

---

## Quick Start: Preview a Digest

```bash
# 1. Create a digest (or use existing)
curl -X POST http://localhost:3010/api/digests \
  -H "Authorization: Bearer <user-id>" \
  -d '{"clipIds": ["..."]}'

# 2. Run dry run to see script
npx tsx scripts/dry-run-digest.ts --digest-id <id>

# 3. Review the output
# - Full narrator script
# - Clip summaries
# - Token usage
# - Cost estimate

# 4. If happy, generate audio
curl -X POST http://localhost:3010/api/digests/<id>/generate
```
