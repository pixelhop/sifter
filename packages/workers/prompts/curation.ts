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

1. **Relevance Score**: Start with the highest-scoring clips
2. **Topic Diversity**: Don't select multiple clips covering the same topic - pick the best one for each topic
3. **Source Diversity**: Include clips from different podcasts/episodes when possible
4. **Narrative Flow**: Arrange clips to create a logical progression of ideas
5. **Duration Target**: Total duration should be close to the target (6-8 minutes)

## What to Avoid
- Multiple clips about the same topic (pick only the best one)
- Too many clips from a single episode (max 2-3 from same episode)
- Clips that would feel repetitive when listened back-to-back
- Exceeding the target duration significantly

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
- Transcript excerpt: "${c.transcript.slice(0, 300)}${c.transcript.length > 300 ? "..." : ""}"`
    )
    .join("\n\n");

  return `${interestsSection}## Target
- Duration: ${Math.round(input.targetDuration / 60)} minutes (${input.targetDuration} seconds)
- Clip count: ${input.targetClipCount.min}-${input.targetClipCount.max} clips

## Candidate Clips (${input.candidates.length} total)

${candidatesText}

Analyze these clips and return a JSON object with your selection. Remember to:
1. Prioritize high relevance scores
2. Ensure topic diversity
3. Mix sources when possible
4. Create a logical flow
5. Stay close to the target duration`;
}
