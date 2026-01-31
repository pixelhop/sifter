/**
 * Clip Selection Prompt
 * System prompt for GPT-4 to analyze podcast transcripts and extract relevant clips
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ClipSelectionInput {
  episodeTitle: string;
  podcastTitle: string;
  transcript: {
    text: string;
    segments: TranscriptSegment[];
    duration?: number;
  };
  userInterests: string[];
}

export interface SelectedClip {
  startTime: number;
  endTime: number;
  transcript: string;
  relevanceScore: number;
  reasoning: string;
  summary: string;
}

export interface ClipSelectionOutput {
  clips: SelectedClip[];
}

export const CLIP_SELECTION_SYSTEM_PROMPT = `You are an expert podcast curator. Your task is to analyze podcast transcripts and identify the most valuable, interesting, and relevant clips for a listener.

## Your Goal
Extract 3-5 high-quality clips from the provided transcript that would be most interesting and relevant to the listener based on their interests.

## Clip Requirements
- Each clip should be 30-120 seconds long (use the segment timestamps to calculate duration)
- Clips should be self-contained: they should make sense without additional context
- Clips should capture complete thoughts or stories, not cut off mid-sentence
- Avoid ads, sponsor reads, and promotional content
- Avoid generic intros, outros, and "housekeeping" segments
- Avoid repetitive or filler content

## What Makes a Good Clip
- Insights, unique perspectives, or "aha moments"
- Interesting stories, anecdotes, or examples
- Actionable advice or practical tips
- Thought-provoking ideas or contrarian takes
- Emotional or impactful moments
- Expert knowledge or insider information

## Relevance Scoring (0-100)
Score each clip based on how relevant it is to the user's interests:
- 90-100: Directly addresses one or more user interests with valuable content
- 70-89: Related to user interests with good insights
- 50-69: Generally interesting, tangentially related to interests
- 30-49: Interesting content but not related to stated interests
- 0-29: Generic or low-value content (avoid selecting these)

## Output Format
Return a JSON object with a "clips" array. Each clip should have:
- startTime: Start timestamp in seconds (from the transcript segments)
- endTime: End timestamp in seconds (from the transcript segments)
- transcript: The exact text of the clip (concatenate relevant segment texts)
- relevanceScore: 0-100 score based on relevance to user interests
- reasoning: Brief explanation of why this clip was selected (1-2 sentences)
- summary: Brief summary of what the clip is about (1 sentence)

## Important Notes
- Use the exact timestamps from the transcript segments
- Ensure clips don't overlap
- Order clips by their relevance score (highest first)
- If the transcript is short or lacks quality content, return fewer clips
- Always return valid JSON`;

/**
 * Build the user prompt with the actual transcript and context
 */
export function buildClipSelectionPrompt(input: ClipSelectionInput): string {
  const interestsSection =
    input.userInterests.length > 0
      ? `## User Interests
The listener is interested in: ${input.userInterests.join(", ")}

Prioritize clips that relate to these interests.

`
      : `## User Interests
No specific interests provided. Select the most universally interesting and valuable clips.

`;

  const segmentsText = input.transcript.segments
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
    .join("\n");

  return `${interestsSection}## Episode Information
Podcast: ${input.podcastTitle}
Episode: ${input.episodeTitle}
Duration: ${input.transcript.duration ? `${Math.round(input.transcript.duration / 60)} minutes` : "Unknown"}

## Transcript with Timestamps
${segmentsText}

Analyze this transcript and return a JSON object with the selected clips.`;
}
