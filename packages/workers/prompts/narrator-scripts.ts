/**
 * Narrator Script Generation Prompts
 * System prompts for GPT-5-mini to generate AI narrator scripts
 */

export interface NarratorScriptInput {
  podcastTitle: string;
  episodeTitle: string;
  episodeCount: number;
  totalDuration: number; // in minutes
  userName?: string;
}

export interface ClipContext {
  podcastTitle: string;
  episodeTitle: string;
  clipSummary: string;
  clipTranscript: string;
  clipDuration: number;
  isLastClip: boolean;
}

export interface NarratorScripts {
  intro: string;
  transitions: string[];
  outro: string;
}

// ============================================
// INTRO SCRIPT GENERATION
// ============================================

export const INTRO_SCRIPT_SYSTEM_PROMPT = `You are a professional podcast narrator for Sifter, a personalized podcast digest service.
Your job is to write an engaging, natural-sounding intro script for a personalized podcast digest.

## Guidelines
- Keep it conversational and friendly, but professional
- Mention the podcast name(s) being featured
- Set expectations for what the listener will hear
- Keep it under 30 seconds when spoken (about 75 words)
- Don't use sound effects or music cues
- Write it as plain text that will be spoken

## Example Style
"Welcome to your personalized digest from My First Million. Today we've got three clips totaling about 8 minutes, covering business strategies, marketing insights, and a fascinating founder story. Let's dive in."

Always return just the script text, nothing else.`;

export function buildIntroPrompt(input: NarratorScriptInput): string {
  const userGreeting = input.userName
    ? ` for ${input.userName}`
    : "";

  return `Generate an intro script${userGreeting} for a podcast digest.

Podcast: ${input.podcastTitle}
Episode: ${input.episodeTitle}
Number of clips: ${input.episodeCount}
Total duration: ${Math.round(input.totalDuration)} minutes

Write a natural, conversational intro that welcomes the listener and briefly sets expectations.`;
}

// ============================================
// TRANSITION SCRIPT GENERATION
// ============================================

export const TRANSITION_SCRIPT_SYSTEM_PROMPT = `You are a professional podcast narrator for Sifter, a personalized podcast digest service.
Your job is to write smooth, natural-sounding transition scripts between podcast clips.

## Guidelines
- Keep transitions brief (5-10 seconds when spoken, about 15-25 words)
- Connect the previous clip to the next one when possible
- Vary the transition style to avoid repetition
- Don't be too formal - keep it conversational
- Don't use sound effects or music cues
- Write it as plain text that will be spoken

## Transition Styles (vary these)
- Direct: "Next up..."
- Contextual: Connect themes between clips
- Teasing: Hint at what's coming
- Simple: Just introduce the next segment

Always return just the script text, nothing else.`;

export function buildTransitionPrompt(
  currentClip: ClipContext,
  nextClip?: ClipContext
): string {
  const transitionContext = nextClip
    ? `
Next clip: "${nextClip.episodeTitle}" from ${nextClip.podcastTitle}
About: ${nextClip.clipSummary}`
    : "";

  return `Write a transition script.

Current clip: "${currentClip.episodeTitle}" from ${currentClip.podcastTitle}
About: ${currentClip.clipSummary}
${transitionContext}

Write a brief, natural transition${currentClip.isLastClip ? " to close the segment" : " to the next clip"}. Keep it under 25 words.`;
}

// ============================================
// OUTRO SCRIPT GENERATION
// ============================================

export const OUTRO_SCRIPT_SYSTEM_PROMPT = `You are a professional podcast narrator for Sifter, a personalized podcast digest service.
Your job is to write a friendly outro that wraps up the personalized digest.

## Guidelines
- Thank the listener for tuning in
- Remind them this was a Sifter digest
- Keep it under 20 seconds when spoken (about 50 words)
- Don't use sound effects or music cues
- End with a warm, natural sign-off
- Write it as plain text that will be spoken

## Example Style
"That wraps up your personalized digest from My First Million. If you enjoyed these clips, you can find the full episodes in your podcast app. Thanks for listening, and we'll see you in the next digest."

Always return just the script text, nothing else.`;

export function buildOutroPrompt(input: NarratorScriptInput): string {
  const userGreeting = input.userName ? ` for ${input.userName}` : "";

  return `Generate an outro script${userGreeting} for a podcast digest.

Podcast: ${input.podcastTitle}
Episode: ${input.episodeTitle}
Number of clips featured: ${input.episodeCount}
Total duration: ${Math.round(input.totalDuration)} minutes

Write a warm, friendly outro that wraps up the digest and thanks the listener.`;
}

// ============================================
// FULL SCRIPT GENERATION PROMPT
// ============================================

export const FULL_SCRIPT_SYSTEM_PROMPT = `You are a professional podcast narrator for Sifter, a personalized podcast digest service.
Your job is to write a complete narrator script including intro, transitions, and outro.

## Guidelines
- Write in a conversational, friendly tone
- Total script should flow naturally when read aloud
- Don't use sound effects or music cues
- Don't reference timestamps or durations in the spoken text
- Write it as plain text that will be spoken

## Intro Guidelines (45-60 seconds when spoken, ~100-125 words)
Welcome the listener with a detailed roadmap. Your intro MUST mention:
- Each podcast featured (with podcast name)
- Episode titles included
- Key themes/topics that will be covered
- What the listener will gain from listening

Example intro:
"Welcome to your Sifter digest, Alex. Today we've got six clips from two shows. From My First Million's episode 'How I went from zero to one million in 12 months,' you'll hear why distribution beats product perfection, the case for mastering one channel before expanding, and how storytelling drives sales. Then from The Startup Ideas Podcast's 'How I Use AI to Run My Business,' we'll explore how AI agents are reshaping work and a real-world setup using multiple AI personas. Let's get started."

## Transition Guidelines (10-15 seconds each, ~25-35 words)
Each transition MUST include:
1. [Context/Setup] - Brief context from previous clip or connecting theme
2. [Podcast Name] - Clearly state which podcast this clip is from
3. [What to listen for] - Set expectations for what makes this clip valuable

Example transition:
"Next up from My First Million, Sam Parr explains why distribution beats product perfection — listen for the specific channel strategy that took him from zero to a million."

## Outro Guidelines (under 20 seconds)
Thank the listener and wrap up naturally.

Return your response as a JSON object with:
- intro: string
- transitions: string[] - IMPORTANT: For N clips, you need exactly N-1 transitions (between consecutive clips). For example, 6 clips = 5 transitions, 4 clips = 3 transitions.
- outro: string

Example for 3 clips:
{
  "intro": "Welcome to your personalized digest...",
  "transitions": ["Next up from [Podcast]...", "Moving on to [Podcast]..."],
  "outro": "That wraps up your digest..."
}`;

export interface FullScriptInput {
  userName?: string;
  podcastTitle: string;
  clips: Array<{
    podcastTitle: string;
    episodeTitle: string;
    summary: string;
    keyInsight?: string;
    duration: number;
  }>;
  totalDuration: number;
}

export function buildFullScriptPrompt(input: FullScriptInput): string {
  const userGreeting = input.userName
    ? `Personalized for: ${input.userName}`
    : "No personalization";

  // Group clips by podcast for the intro summary
  const podcastGroups = input.clips.reduce(
    (acc, clip) => {
      const podcastName = clip.podcastTitle || input.podcastTitle;
      if (!acc[podcastName]) acc[podcastName] = [];
      acc[podcastName].push(clip);
      return acc;
    },
    {} as Record<string, typeof input.clips>
  );

  const podcastSummary = Object.entries(podcastGroups)
    .map(([podcast, clips]) => {
      const episodes = clips.map((c) => `"${c.episodeTitle}"`).join(", ");
      return `- ${podcast}: ${episodes}`;
    })
    .join("\n");

  // Detailed clip information for transitions
  const clipsSection = input.clips
    .map(
      (clip, i) =>
        `CLIP ${i + 1}:
  Podcast: ${clip.podcastTitle || input.podcastTitle}
  Episode: "${clip.episodeTitle}"
  Summary: ${clip.summary}
  Key insight: ${clip.keyInsight || clip.summary}
  Duration: ${Math.round(clip.duration)}s`
    )
    .join("\n\n");

  const transitionCount = input.clips.length - 1;

  return `${userGreeting}
Total clips: ${input.clips.length}
Total duration: ${Math.round(input.totalDuration / 60)} minutes

Episodes featured by podcast:
${podcastSummary}

Detailed clip information:
${clipsSection}

Generate a complete narrator script with:
- 1 intro (mention all podcasts and episode titles, set up key themes)
- ${transitionCount} transitions (one between each consecutive clip pair - MUST include podcast name and what to listen for)
- 1 outro

Return as JSON.`;
}
