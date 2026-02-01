# Sifter Pipeline Improvement: Cross-Episode Clip Curation

## Current Pipeline (Problem)

```
Episode 1 → Analysis → Clips [1A, 1B, 1C] ──┐
Episode 2 → Analysis → Clips [2A, 2B, 2C] ──┼──> Digest (ALL clips)
Episode 3 → Analysis → Clips [3A, 3B, 3C] ──┘
```

**Issues:**
- ❌ Includes ALL clips from each episode
- ❌ No deduplication of similar topics
- ❌ No diversity optimization across sources
- ❌ May exceed target digest length
- ❌ Hard to see which podcast/episode clips came from in reports

---

## Proposed Pipeline (Solution)

```
Episode 1 → Analysis → Candidate Clips [1A, 1B, 1C] ──┐
Episode 2 → Analysis → Candidate Clips [2A, 2B, 2C] ──┼──> Cross-Episode
Episode 3 → Analysis → Candidate Clips [3A, 3B, 3C] ──┘     Curator
                                                                   ↓
                                                       Selects best 6-8 clips
                                                       from ALL candidates
                                                                   ↓
                                                        Optimized Digest
```

**New Step: "Cross-Episode Curator"**

Takes ALL candidate clips from ALL episodes and intelligently selects the best mix:

### Selection Criteria:
1. **Relevance Score** (highest first)
2. **Topic Diversity** (avoid similar content)
3. **Source Diversity** (mix podcasts/episodes)
4. **Narrative Flow** (create compelling progression)
5. **Target Duration** (fit 6-8 minute target)

---

## Implementation Options

### Option 1: LLM-Based Curation (Recommended)

Add a new worker job `curate-clips` that:

```typescript
interface CurationInput {
  targetDuration: number;  // e.g., 420 seconds (7 min)
  targetClipCount: number; // e.g., 6-8 clips
  userInterests: string[];
  candidates: Array<{
    clipId: string;
    episodeTitle: string;
    podcastTitle: string;
    summary: string;
    relevanceScore: number;
    duration: number;
    transcript: string;
  }>;
}

interface CurationOutput {
  selectedClipIds: string[];
  reasoning: string;  // Why these clips were selected
  estimatedDuration: number;
  topicCoverage: string[];  // Which topics are covered
}
```

**Prompt:**
```
You are a podcast curator. From the candidate clips below, select the best 
6-8 clips to create a compelling, diverse digest of about 7 minutes.

Selection criteria:
1. Prioritize highest relevance scores
2. Ensure topic diversity (don't pick 2 clips about the same thing)
3. Mix sources (include clips from different podcasts/episodes)
4. Create narrative flow (early clips → middle → end should progress logically)
5. Hit target duration (6-8 minutes total)

Candidates:
[clip summaries with podcast/episode info, relevance, duration]

Return JSON:
{
  "selectedClipIds": ["id1", "id2", ...],
  "reasoning": "Selected X from podcast A about topic Y, mixed with Z from podcast B...",
  "estimatedDuration": 420,
  "topicCoverage": ["distribution", "AI agents", "marketing"]
}
```

### Option 2: Algorithmic Curation (Faster)

Rank clips by score, then apply diversity filter:

```typescript
function curateClips(candidates: Clip[], targetDuration: number): Clip[] {
  // 1. Sort by relevance score
  const sorted = candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // 2. Greedy selection with diversity constraint
  const selected: Clip[] = [];
  let currentDuration = 0;
  const coveredTopics = new Set<string>();
  
  for (const clip of sorted) {
    // Skip if too similar to already selected
    if (isTooSimilar(clip, selected)) continue;
    
    // Skip if would exceed target duration
    if (currentDuration + clip.duration > targetDuration + 60) continue;
    
    selected.push(clip);
    currentDuration += clip.duration;
    coveredTopics.add(extractTopic(clip));
    
    if (selected.length >= 8) break;
  }
  
  return selected;
}
```

### Option 3: Hybrid Approach

Use algorithm for initial filtering, then LLM for final selection:

1. Algorithm: Filter to top 15 candidates
2. LLM: Select best 6-8 with narrative flow

---

## UI/UX Improvements

### Better Clip Reporting

Current report shows:
```
- 1200s-1270s (score: 92)
  Why picking a single effective distribution channel...
```

Improved report should show:
```
- 1200s-1270s (score: 92) | My First Million | "How I went from $0 to $1M"
  Why picking a single effective distribution channel...
  [Podcast: My First Million | Episode: How I went from $0 to $1M | Duration: 70s]
```

### Digest Preview Before Generation

```
📊 DIGEST PREVIEW

Target Duration: 7 minutes
Selected Clips: 7

1. [70s] My First Million - Distribution matters (score: 100)
   → Why finding the right channel is crucial

2. [85s] Startup Ideas - AI agents for business (score: 98)
   → How CloudBot-style agents automate operations

3. [45s] My First Million - Focus on one channel (score: 95)
   → Master one channel before expanding

4. [70s] My First Million - Marketing beats product (score: 93)
   → Storytelling drives sales more than features

5. [75s] My First Million - Star registry business (score: 90)
   → Low-cost, high-margin business model

6. [80s] AI Daily Brief - Agent swarms (score: 88)
   → AI teams working in parallel

7. [60s] Startup Ideas - Discord automation (score: 85)
   → Using agents for customer support

Total Duration: 8 min 25 sec
Topic Coverage: Distribution, AI Agents, Marketing, Automation
Podcast Mix: My First Million (4), Startup Ideas (2), AI Daily Brief (1)

[Auto-generate digest with curated clips]
```

---

## Database Changes

### New Table: `DigestCandidate`

```prisma
model DigestCandidate {
  id          String   @id @default(uuid())
  digestId    String
  clipId      String
  episodeId   String
  podcastId   String
  relevanceScore Int
  wasSelected Boolean  @default(false)
  selectionRank  Int?  // 1-8 for selected clips
  
  digest      Digest   @relation(fields: [digestId], references: [id])
  clip        Clip     @relation(fields: [clipId], references: [id])
  
  createdAt   DateTime @default(now())
}
```

### Updated Digest Status Flow (Fully Automatic)

```
pending 
  ↓
analyzing_episodes  ← Run analysis on all episodes
  ↓
curating            ← NEW: Cross-episode curation (automatic)
  ↓
generating_script
  ↓
generating_audio
  ↓
ready
```

*All automatic - no user confirmation required. Curator runs as part of pipeline.*

---

## Benefits

1. **Better Quality**: Only best clips make the digest
2. **No Duplicates**: Similar topics from different episodes are deduplicated
3. **Diverse Sources**: Ensures mix of podcasts/episodes
4. **Right Length**: Hits target duration precisely
5. **Compelling Flow**: Narrative arc across clips
6. **Fully Automatic**: No manual steps required

---

## Quick Win: Update Report Format

Immediate improvement - update comparison script to show:
- Podcast name for each clip
- Episode title
- Better formatting

Then implement full curation pipeline.
