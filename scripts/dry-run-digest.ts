#!/usr/bin/env tsx
/**
 * Dry Run Digest Generator
 *
 * Preview the narrator script and clips WITHOUT generating audio.
 * Useful for refining prompts and reviewing content before TTS costs.
 *
 * Usage:
 *   npx tsx scripts/dry-run-digest.ts --digest-id <id> [options]
 *
 * Options:
 *   --digest-id <id>     The digest ID to preview
 *   --show-clips         Show full clip transcripts
 *   --show-tokens        Show token usage estimates
 *   --model <model>      Model to use (gpt-5-mini, gpt-4o, etc.)
 *   --save-script        Save script to file
 *   --compare-models     Run with multiple models and compare
 */

import { PrismaClient } from "@prisma/client";
import {
  FULL_SCRIPT_SYSTEM_PROMPT,
  buildFullScriptPrompt,
  type FullScriptInput,
  type NarratorScripts,
} from "../packages/workers/prompts/narrator-scripts";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:54328/postgres",
    },
  },
});

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function generateScript(
  clips: Array<{
    episodeTitle: string;
    summary: string;
    duration: number;
    podcastTitle: string;
    transcript?: string;
  }>,
  model: string = "gpt-5-mini"
): Promise<{ script: NarratorScripts; usage: OpenAIResponse["usage"] }> {
  const podcastTitle = clips.length > 0 ? clips[0].podcastTitle : "Multi-Podcast Digest";
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  const input: FullScriptInput = {
    podcastTitle,
    clips: clips.map((c) => ({
      podcastTitle: c.podcastTitle,
      episodeTitle: c.episodeTitle,
      summary: c.summary,
      keyInsight: c.summary || undefined,
      duration: c.duration,
    })),
    totalDuration,
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  console.log(`\n🤖 Calling ${model} for script generation...\n`);

  const startTime = Date.now();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: FULL_SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: buildFullScriptPrompt(input) },
      ],
      max_completion_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: OpenAIResponse = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No content in response");
  }

  // Parse JSON
  let jsonContent = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }

  const script: NarratorScripts = JSON.parse(jsonContent);

  const duration = Date.now() - startTime;

  console.log(`✅ Script generated in ${duration}ms`);
  console.log(`📊 Tokens: ${data.usage.prompt_tokens} in, ${data.usage.completion_tokens} out`);

  return { script, usage: data.usage };
}

function estimateCost(usage: OpenAIResponse["usage"], model: string): string {
  // Approximate costs per 1K tokens (as of 2025)
  const costs: Record<string, { in: number; out: number }> = {
    "gpt-5-mini": { in: 0.0005, out: 0.0015 },
    "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
    "gpt-4o": { in: 0.0025, out: 0.01 },
  };

  const cost = costs[model] || costs["gpt-5-mini"];
  const total =
    (usage.prompt_tokens / 1000) * cost.in +
    (usage.completion_tokens / 1000) * cost.out;

  return `$${total.toFixed(4)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const digestId = args.find((_, i) => args[i - 1] === "--digest-id");
  const showClips = args.includes("--show-clips");
  const showTokens = args.includes("--show-tokens");
  const model = args.find((_, i) => args[i - 1] === "--model") || "gpt-5-mini";
  const saveScript = args.includes("--save-script");

  if (!digestId) {
    console.log("Usage: npx tsx scripts/dry-run-digest.ts --digest-id <id> [options]");
    console.log("\nOptions:");
    console.log("  --digest-id <id>   Digest ID to preview (required)");
    console.log("  --show-clips       Show full clip transcripts");
    console.log("  --show-tokens      Show token usage");
    console.log("  --model <model>    Model to use (gpt-5-mini, gpt-4o, etc.)");
    console.log("  --save-script      Save script to file");
    process.exit(1);
  }

  console.log(`\n🎙️  Sifter Dry Run: Digest Preview\n`);
  console.log(`Digest ID: ${digestId}`);
  console.log(`Model: ${model}`);
  console.log(`Mode: Preview only (no audio)\n`);

  // Fetch digest with clips
  const digest = await prisma.digest.findUnique({
    where: { id: digestId },
    include: {
      clips: {
        include: {
          episode: {
            include: { podcast: true },
          },
        },
      },
    },
  });

  if (!digest) {
    console.error(`❌ Digest not found: ${digestId}`);
    process.exit(1);
  }

  console.log(`📊 Digest: ${digest.title || "Untitled"}`);
  console.log(`   Clips: ${digest.clips.length}`);
  console.log(`   Current Status: ${digest.status}\n`);

  // Show clips
  console.log(`🎬 CLIPS:\n`);
  digest.clips.forEach((clip, i) => {
    const duration = Math.round(clip.duration);
    console.log(`${i + 1}. "${clip.episode.title}" from ${clip.episode.podcast.title}`);
    console.log(`   Duration: ${duration}s | Relevance: ${clip.relevanceScore}/100`);
    console.log(`   Summary: ${clip.summary}`);
    if (showClips && clip.transcript) {
      const excerpt = clip.transcript.substring(0, 200);
      console.log(`   Transcript: ${excerpt}...`);
    }
    console.log();
  });

  // Generate or show existing script
  let script: NarratorScripts;
  let usage: OpenAIResponse["usage"] | null = null;

  if (digest.narratorScript) {
    console.log(`📜 Using existing narrator script from database\n`);
    // Parse if stored as JSON string
    const scriptData = typeof digest.narratorScript === 'string' 
      ? JSON.parse(digest.narratorScript) 
      : digest.narratorScript;
    script = scriptData as NarratorScripts;
  } else {
    console.log(`📝 Generating new narrator script...\n`);

    const clipData = digest.clips.map((clip) => ({
      episodeTitle: clip.episode.title,
      summary: clip.summary || "",
      duration: clip.duration,
      podcastTitle: clip.episode.podcast.title,
      transcript: clip.transcript || undefined,
    }));

    const result = await generateScript(clipData, model);
    script = result.script;
    usage = result.usage;
  }

  // Show script
  console.log(`\n🎤 NARRATOR SCRIPT:\n`);
  console.log(`═══════════════════════════════════════════════════\n`);

  console.log(`🎵 INTRO (${Math.round(script.intro.split(" ").length / 2)}s estimated):`);
  console.log(`   "${script.intro}"\n`);

  script.transitions.forEach((transition, i) => {
    const nextClip = digest.clips[i + 1];
    const duration = Math.round(transition.split(" ").length / 2);
    console.log(`🎵 TRANSITION ${i + 1} → Clip ${i + 2} (${duration}s estimated):`);
    console.log(`   "${transition}"`);
    if (nextClip) {
      console.log(`   (Next: "${nextClip.episode.title.substring(0, 40)}...")\n`);
    } else {
      console.log();
    }
  });

  const outroDuration = Math.round(script.outro.split(" ").length / 2);
  console.log(`🎵 OUTRO (${outroDuration}s estimated):`);
  console.log(`   "${script.outro}"\n`);

  console.log(`═══════════════════════════════════════════════════\n`);

  // Token/cost info
  if (showTokens && usage) {
    console.log(`📊 TOKEN USAGE:`);
    console.log(`   Prompt tokens: ${usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${usage.completion_tokens}`);
    console.log(`   Total tokens: ${usage.total_tokens}`);
    console.log(`   Estimated cost: ${estimateCost(usage, model)}\n`);
  }

  // Summary
  const totalDuration = digest.clips.reduce((sum, c) => sum + c.duration, 0);
  const scriptDuration =
    script.intro.split(" ").length / 2 +
    script.transitions.reduce((sum, t) => sum + t.split(" ").length / 2, 0) +
    script.outro.split(" ").length / 2;

  console.log(`📈 SUMMARY:`);
  console.log(`   Podcast clips: ${Math.round(totalDuration)}s`);
  console.log(`   Narrator audio: ~${Math.round(scriptDuration)}s`);
  console.log(`   Total digest: ~${Math.round(totalDuration + scriptDuration)}s (${Math.round((totalDuration + scriptDuration) / 60)} min)\n`);

  // Save to file if requested
  if (saveScript) {
    const outputPath = `/tmp/sifter/dry-run-${digestId}.json`;
    const output = {
      digestId,
      clips: digest.clips.map((c) => ({
        id: c.id,
        title: c.episode.title,
        podcast: c.episode.podcast.title,
        duration: c.duration,
        summary: c.summary,
        transcript: showClips ? c.transcript : undefined,
      })),
      script,
      usage,
      estimatedCost: usage ? estimateCost(usage, model) : null,
    };

    await import("node:fs").then((fs) => {
      fs.mkdirSync("/tmp/sifter", { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    });

    console.log(`💾 Script saved to: ${outputPath}\n`);
  }

  console.log(`✨ To generate audio, run:`);
  console.log(`   curl -X POST http://localhost:3010/api/digests/${digestId}/regenerate\n`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
