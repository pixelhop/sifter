#!/usr/bin/env tsx
/**
 * Model Comparison Script
 *
 * Compares LLM outputs for clip selection and script generation
 * across different providers/models via OpenRouter.
 *
 * Usage:
 *   npx tsx scripts/compare-models.ts --digest-id <id> [options]
 *
 * Models tested:
 *   - GPT-4.5 Preview (openai/gpt-4.5-preview)
 *   - Gemini 2.0 Flash (google/gemini-2.0-flash-exp)
 *   - Kimi K2.5 (moonshotai/kimi-k2.5)
 *   - Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)
 */

import { PrismaClient } from "@prisma/client";
import {
  CLIP_SELECTION_SYSTEM_PROMPT,
  buildClipSelectionPrompt,
  type ClipSelectionOutput,
} from "../packages/workers/prompts/clip-selection";
import {
  FULL_SCRIPT_SYSTEM_PROMPT,
  buildFullScriptPrompt,
  type NarratorScripts,
} from "../packages/workers/prompts/narrator-scripts";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:54328/postgres",
    },
  },
});

// Model configurations
const MODELS = {
  "gpt-5.2": {
    name: "GPT-5.2",
    providerModel: "openai/gpt-5.2",
    description: "OpenAI's advanced reasoning and coding model",
  },
  "gemini-3-flash": {
    name: "Gemini 3 Flash Preview",
    providerModel: "google/gemini-3-flash-preview",
    description: "Google's latest fast multimodal model",
  },
  "kimi-k2.5": {
    name: "Kimi K2.5",
    providerModel: "moonshotai/kimi-k2.5",
    description: "Moonshot AI's long-context model",
  },
  "claude-sonnet-4.5": {
    name: "Claude Sonnet 4.5",
    providerModel: "anthropic/claude-sonnet-4.5",
    description: "Anthropic's most advanced Sonnet model for agents",
  },
};

type ModelKey = keyof typeof MODELS;

interface ComparisonResult {
  model: ModelKey;
  modelName: string;
  providerModel: string;
  clipSelection?: {
    clips: ClipSelectionOutput["clips"];
    usage: { prompt: number; completion: number; total: number };
    duration: number;
    error?: string;
  };
  scriptGeneration?: {
    script: NarratorScripts;
    usage: { prompt: number; completion: number; total: number };
    duration: number;
    error?: string;
  };
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens?: number
): Promise<{
  content: string;
  usage: { prompt: number; completion: number; total: number };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://sifter.app",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Sifter",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens || 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || "",
    usage: {
      prompt: data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
      total: data.usage?.total_tokens || 0,
    },
  };
}

async function testClipSelection(
  modelKey: ModelKey,
  episode: {
    title: string;
    podcastTitle: string;
    transcript: { text: string; segments: Array<{ start: number; end: number; text: string }>; duration?: number };
    userInterests: string[];
  }
): Promise<ComparisonResult["clipSelection"]> {
  console.log(`  Testing clip selection with ${MODELS[modelKey].name}...`);
  
  const startTime = Date.now();
  
  try {
    const promptInput = {
      episodeTitle: episode.title,
      podcastTitle: episode.podcastTitle,
      transcript: episode.transcript,
      userInterests: episode.userInterests,
    };

    const result = await callOpenRouter(
      MODELS[modelKey].providerModel,
      [
        { role: "system", content: CLIP_SELECTION_SYSTEM_PROMPT },
        { role: "user", content: buildClipSelectionPrompt(promptInput) },
      ],
      4000
    );

    // Parse JSON response
    let jsonContent = result.content;
    const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }

    const clips: ClipSelectionOutput = JSON.parse(jsonContent);

    return {
      clips: clips.clips,
      usage: result.usage,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      clips: [],
      usage: { prompt: 0, completion: 0, total: 0 },
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testScriptGeneration(
  modelKey: ModelKey,
  clips: Array<{ podcastTitle: string; episodeTitle: string; summary: string; keyInsight?: string; duration: number }>,
  podcastTitle: string,
  totalDuration: number
): Promise<ComparisonResult["scriptGeneration"]> {
  console.log(`  Testing script generation with ${MODELS[modelKey].name}...`);
  
  const startTime = Date.now();
  
  try {
    const input = {
      podcastTitle,
      clips,
      totalDuration,
    };

    const result = await callOpenRouter(
      MODELS[modelKey].providerModel,
      [
        { role: "system", content: FULL_SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: buildFullScriptPrompt(input) },
      ],
      2000
    );

    // Parse JSON response
    let jsonContent = result.content;
    const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }

    const script: NarratorScripts = JSON.parse(jsonContent);

    return {
      script,
      usage: result.usage,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      script: { intro: "", transitions: [], outro: "" },
      usage: { prompt: 0, completion: 0, total: 0 },
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatReport(results: ComparisonResult[]): string {
  let report = `# LLM Model Comparison Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;

  // Summary table
  report += `## Summary\n\n`;
  report += `| Model | Clip Selection | Script Gen | Total Tokens | Total Time |\n`;
  report += `|-------|----------------|------------|--------------|------------|\n`;
  
  for (const result of results) {
    const clipTokens = result.clipSelection?.usage.total || 0;
    const scriptTokens = result.scriptGeneration?.usage.total || 0;
    const totalTokens = clipTokens + scriptTokens;
    const clipTime = result.clipSelection?.duration || 0;
    const scriptTime = result.scriptGeneration?.duration || 0;
    const totalTime = ((clipTime + scriptTime) / 1000).toFixed(1);
    const clipStatus = result.clipSelection?.error ? "❌" : "✅";
    const scriptStatus = result.scriptGeneration?.error ? "❌" : "✅";
    
    report += `| ${MODELS[result.model].name} | ${clipStatus} | ${scriptStatus} | ${totalTokens.toLocaleString()} | ${totalTime}s |\n`;
  }

  report += `\n`;

  // Detailed results
  for (const result of results) {
    report += `## ${MODELS[result.model].name}\n\n`;
    report += `**Model ID:** \`${MODELS[result.model].providerModel}\`\n\n`;
    report += `**Description:** ${MODELS[result.model].description}\n\n`;

    // Clip Selection
    report += `### Clip Selection\n\n`;
    if (result.clipSelection?.error) {
      report += `❌ **Error:** ${result.clipSelection.error}\n\n`;
    } else if (result.clipSelection) {
      report += `- **Tokens:** ${result.clipSelection.usage.prompt} in / ${result.clipSelection.usage.completion} out (${result.clipSelection.usage.total} total)\n`;
      report += `- **Duration:** ${(result.clipSelection.duration / 1000).toFixed(1)}s\n`;
      report += `- **Clips found:** ${result.clipSelection.clips.length}\n\n`;
      
      report += `**Selected Clips:**\n\n`;
      for (const clip of result.clipSelection.clips.slice(0, 3)) {
        report += `- ${clip.startTime}s-${clip.endTime}s (score: ${clip.relevanceScore})\n`;
        report += `  ${clip.summary.substring(0, 100)}...\n\n`;
      }
    }

    // Script Generation
    report += `### Script Generation\n\n`;
    if (result.scriptGeneration?.error) {
      report += `❌ **Error:** ${result.scriptGeneration.error}\n\n`;
    } else if (result.scriptGeneration) {
      report += `- **Tokens:** ${result.scriptGeneration.usage.prompt} in / ${result.scriptGeneration.usage.completion} out (${result.scriptGeneration.usage.total} total)\n`;
      report += `- **Duration:** ${(result.scriptGeneration.duration / 1000).toFixed(1)}s\n\n`;
      
      report += `**Generated Script:**\n\n`;
      report += `*Intro:*\n`;
      report += `> ${result.scriptGeneration.script.intro}\n\n`;
      
      if (result.scriptGeneration.script.transitions.length > 0) {
        report += `*Transition 1:*\n`;
        report += `> ${result.scriptGeneration.script.transitions[0]}\n\n`;
      }
      
      report += `*Outro:*\n`;
      report += `> ${result.scriptGeneration.script.outro}\n\n`;
    }

    report += `---\n\n`;
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const digestId = args.find((_, i) => args[i - 1] === "--digest-id");
  const saveReport = args.includes("--save");

  if (!digestId) {
    console.log("Usage: npx tsx scripts/compare-models.ts --digest-id <id> [--save]");
    console.log("\nModels compared:");
    for (const [key, model] of Object.entries(MODELS)) {
      console.log(`  - ${model.name} (${model.providerModel})`);
    }
    process.exit(1);
  }

  console.log(`\n🧪 LLM Model Comparison\n`);
  console.log(`Digest: ${digestId}\n`);
  console.log(`Testing ${Object.keys(MODELS).length} models...\n`);

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

  if (!digest || digest.clips.length === 0) {
    console.error("❌ Digest not found or has no clips");
    process.exit(1);
  }

  // Use first clip's episode for clip selection test
  const firstClip = digest.clips[0];
  const transcript = firstClip.episode.transcript as {
    text: string;
    segments: Array<{ start: number; end: number; text: string }>;
    duration?: number;
  };

  const results: ComparisonResult[] = [];

  for (const modelKey of Object.keys(MODELS) as ModelKey[]) {
    console.log(`\n🤖 Testing ${MODELS[modelKey].name}...`);

    const result: ComparisonResult = {
      model: modelKey,
      modelName: MODELS[modelKey].name,
      providerModel: MODELS[modelKey].providerModel,
    };

    // Test clip selection
    result.clipSelection = await testClipSelection(modelKey, {
      title: firstClip.episode.title,
      podcastTitle: firstClip.episode.podcast.title,
      transcript,
      userInterests: ["startups", "business", "technology"],
    });

    // Test script generation with existing clips
    result.scriptGeneration = await testScriptGeneration(
      modelKey,
      digest.clips.map((c) => ({
        podcastTitle: c.episode.podcast.title,
        episodeTitle: c.episode.title,
        summary: c.summary || "",
        keyInsight: c.summary || undefined,
        duration: c.duration,
      })),
      firstClip.episode.podcast.title,
      digest.clips.reduce((sum, c) => sum + c.duration, 0)
    );

    results.push(result);
  }

  // Generate report
  console.log(`\n📊 Generating comparison report...\n`);
  const report = formatReport(results);

  // Display summary
  console.log(`## Quick Summary\n`);
  console.log(`| Model | Status | Tokens | Time |`);
  console.log(`|-------|--------|--------|------|`);
  for (const r of results) {
    const clipOk = r.clipSelection?.error ? "❌" : "✅";
    const scriptOk = r.scriptGeneration?.error ? "❌" : "✅";
    const totalTokens = (r.clipSelection?.usage.total || 0) + (r.scriptGeneration?.usage.total || 0);
    const totalTime = ((r.clipSelection?.duration || 0) + (r.scriptGeneration?.duration || 0)) / 1000;
    console.log(`| ${r.modelName} | ${clipOk}${scriptOk} | ${totalTokens.toLocaleString()} | ${totalTime.toFixed(1)}s |`);
  }

  // Save report if requested
  if (saveReport) {
    const reportPath = `/tmp/sifter/model-comparison-${digestId}.md`;
    await import("node:fs").then((fs) => {
      fs.mkdirSync("/tmp/sifter", { recursive: true });
      fs.writeFileSync(reportPath, report);
    });
    console.log(`\n💾 Full report saved to: ${reportPath}`);
  }

  console.log(`\n✨ Comparison complete!`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
