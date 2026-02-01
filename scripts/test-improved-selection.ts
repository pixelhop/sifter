#!/usr/bin/env tsx
/**
 * Test Improved Clip Selection
 * Compares old vs new curation on same episodes
 */

import { PrismaClient } from "@prisma/client";
import { useLLMClient } from "../packages/workers/providers/llm";
import {
  CLIP_SELECTION_SYSTEM_PROMPT,
  buildClipSelectionPrompt,
} from "../packages/workers/prompts/clip-selection";
import {
  CURATION_SYSTEM_PROMPT,
  buildCurationPrompt,
} from "../packages/workers/prompts/curation";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:54328/postgres",
    },
  },
});

const EPISODE_IDS = [
  "b0d81006-5b93-4f9a-b7bd-6a02a9132e2d", // My First Million
  "2958a29d-dd25-49ab-9983-3077ebb50e3b", // Startup Ideas
];

async function analyzeEpisode(episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { podcast: true },
  });

  if (!episode?.transcript) {
    console.log(`No transcript for episode ${episodeId}`);
    return null;
  }

  console.log(`\n📻 Analyzing: ${episode.podcast.title} - "${episode.title}"`);

  // Parse transcript (assuming Whisper JSON format)
  let transcriptData;
  try {
    transcriptData = typeof episode.transcript === 'string' 
      ? JSON.parse(episode.transcript)
      : episode.transcript;
  } catch {
    console.log('  Transcript not in JSON format, using as plain text');
    transcriptData = { text: episode.transcript, segments: [] };
  }

  const llm = useLLMClient();
  const model = 'gpt-4o';

  const result = await llm.complete({
    model,
    messages: [
      { role: 'system', content: CLIP_SELECTION_SYSTEM_PROMPT },
      { role: 'user', content: buildClipSelectionPrompt({
        episodeTitle: episode.title,
        podcastTitle: episode.podcast.title,
        transcript: transcriptData,
        userInterests: ['startups', 'AI', 'business growth'],
      })},
    ],
    maxTokens: 2000,
  });

  let jsonContent = result.content;
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonContent = jsonMatch[1];
  const selection = JSON.parse(jsonContent);

  console.log(`  Selected ${selection.clips.length} clips:`);
  selection.clips.forEach((clip: any, i: number) => {
    const duration = Math.round(clip.endTime - clip.startTime);
    console.log(`    ${i + 1}. ${duration}s | Score: ${clip.relevanceScore} | ${clip.summary.substring(0, 60)}...`);
    console.log(`       Reasoning: ${clip.reasoning}`);
  });

  return selection;
}

async function main() {
  console.log('🧪 Testing Improved Clip Selection\n');
  console.log('Key changes:');
  console.log('- Prefer 90+ second clips with full idea development');
  console.log('- Penalize short platitudes (2-3 sentence generic advice)');
  console.log('- Reward concrete examples, case studies, nuance');
  console.log('');

  for (const episodeId of EPISODE_IDS) {
    await analyzeEpisode(episodeId);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
