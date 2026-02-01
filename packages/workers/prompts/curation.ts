/**
 * Cross-Episode Curation Prompt
 * System prompt for LLM to curate the best clips across multiple episodes
 */

export interface CandidateClip {
  clipId: string;
  episodeId: string;
  episodeTitle: string;
  podcastId: string;
  podcastTitle: string;
  summary: string;
  relevanceScore: number;
  duration: number;
  startTime: number;
  endTime: number;
  transcript: string;
}

export interface CurationInput {
  targetDuration: number; // seconds (e.g., 420 for 7 min)
  targetClipCount: { min: number; max: number }; // e.g., { min: 6, max: 8 }
  userInterests: string[];
  candidates: CandidateClip[];
}

export interface CurationOutput {
  selectedClipIds: string[];
  reasoning: string;
  estimatedDuration: number;
  topicCoverage: string[];
}

export const CURATION_SYSTEM_PROMPT = `You are an expert podcast curator. Your task is to select the best clips from multiple podcast episodes to create an engaging, diverse digest.

## Your Goal
From the provided candidate clips (already filtered for relevance), select the best 6-8 clips that together create a compelling digest of approximately 7 minutes.

## Selection Criteria (in order of priority)

1. **Depth & Substance**: Strongly prefer clips with thorough explanations, complete stories, and specific details over short soundbites or platitudes
2. **Relevance Score**: Among substantive clips, prefer those with higher scores
3. **Topic Diversity**: Don't select multiple clips covering the same topic - pick the deepest, most substantive one
4. **Source Diversity**: Include clips from different podcasts/episodes when possible
5. **Narrative Flow**: Arrange clips to create a logical progression of ideas
6. **Duration Target**: Total duration should be close to the target (6-8 minutes). Prefer fewer deep clips over many shallow ones.

## What Makes a GOOD Clip for Selection
- **Longer clips (90+ seconds)** that fully develop an idea
- Complete stories with setup, specifics, and payoff
- In-depth explanations with concrete examples
- Nuanced analysis that goes beyond surface-level takes
- Frameworks that are explained, not just named

## What to AVOID
- **Short platitudes or soundbites** (2-3 sentence generic advice like "distribution is everything")
- Surface-level observations anyone could make
- Clips that just name-drop concepts without explaining them
- Multiple clips about the same topic (pick only the most substantive one)
- Too many clips from a single episode (max 2-3 from same episode)
- Clips that would feel repetitive when listened back-to-back
- Generic business wisdom restated without new insight

## Output Format
Return a JSON object with:
- selectedClipIds: Array of clip IDs in the order they should appear in the digest
- reasoning: Brief explanation of your selection strategy (2-3 sentences)
- estimatedDuration: Total duration in seconds
- topicCoverage: Array of main topics covered by selected clips

Always return valid JSON.`;

/**
 * Build the user prompt with candidate clips
 */
export function buildCurationPrompt(input: CurationInput): string {
  const interestsSection =
    input.userInterests.length > 0
      ? `## User Interests
The listener is interested in: ${input.userInterests.join(", ")}

Prioritize clips that relate to these interests.

`
      : `## User Interests
No specific interests provided. Select the most universally interesting and valuable clips.

`;

  const candidatesText = input.candidates
    .map(
      (c, i) => `### Clip ${i + 1}: ${c.clipId}
- Podcast: ${c.podcastTitle}
- Episode: ${c.episodeTitle}
- Relevance Score: ${c.relevanceScore}/100
- Duration: ${c.duration.toFixed(1)} seconds
- Summary: ${c.summary}
- Transcript: "${c.transcript.slice(0, 600)}${c.transcript.length > 600 ? "..." : ""}"`
    )
    .join("\n\n");

  return `${interestsSection}## Target
- Duration: ${Math.round(input.targetDuration / 60)} minutes (${input.targetDuration} seconds)
- Clip count: ${input.targetClipCount.min}-${input.targetClipCount.max} clips

## Candidate Clips (${input.candidates.length} total)

${candidatesText}

Analyze these clips and return a JSON object with your selection. Remember to:
1. STRONGLY prefer clips with depth and substance over short soundbites
2. Look for complete explanations, full stories, and specific details
3. Avoid generic platitudes and surface-level takes (e.g., "distribution is key" with no elaboration)
4. Ensure topic diversity - pick the DEEPEST clip on each topic, not just the highest scored
5. Mix sources when possible
6. Create a logical flow
7. Stay close to the target duration - fewer deep clips is better than many shallow ones`;
}
