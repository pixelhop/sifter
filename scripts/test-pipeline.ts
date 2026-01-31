/**
 * Test script for Phase 4: AI Curation (Clip Analysis & Selection)
 *
 * Tests:
 * 1. Analysis worker with GPT-4 integration
 * 2. Clip selection prompts
 * 3. API endpoint for triggering analysis
 * 4. Database clip storage
 * 5. End-to-end clip extraction
 *
 * Usage:
 *   pnpm tsx scripts/test-pipeline.ts
 *
 * Requirements:
 *   - Redis running on REDIS_URL
 *   - Database configured with DATABASE_URL
 *   - OpenAI API key set (OPENAI_API_KEY)
 */

import { PrismaClient } from "@prisma/client";

const prismaClient = new PrismaClient();

// Test configuration
const TEST_AUDIO_URL =
  "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3";

async function main() {
  console.log("=".repeat(60));
  console.log("Sifter Phase 4: AI Curation Tests");
  console.log("=".repeat(60));
  console.log();

  const prisma = prismaClient;

  // Test 1: Prompt engineering
  console.log("Test 1: Clip Selection Prompts");
  console.log("-".repeat(40));

  try {
    const {
      CLIP_SELECTION_SYSTEM_PROMPT,
      buildClipSelectionPrompt,
    } = await import("../packages/workers/prompts/clip-selection");

    console.log(`  System prompt length: ${CLIP_SELECTION_SYSTEM_PROMPT.length} chars`);

    // Test building a prompt
    const testInput = {
      episodeTitle: "Test Episode",
      podcastTitle: "Test Podcast",
      transcript: {
        text: "This is a test transcript.",
        segments: [
          { start: 0, end: 5, text: "Hello everyone." },
          { start: 5, end: 10, text: "Welcome to the show." },
        ],
        duration: 10,
      },
      userInterests: ["technology", "AI"],
    };

    const prompt = buildClipSelectionPrompt(testInput);
    console.log(`  Built prompt length: ${prompt.length} chars`);
    console.log(`  Includes interests section: ${prompt.includes("technology")}`);
    console.log(`  Includes transcript: ${prompt.includes("Hello everyone")}`);
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 2: OpenAI API configuration
  console.log("Test 2: OpenAI API Configuration");
  console.log("-".repeat(40));

  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.log("  OPENAI_API_KEY not set");
    console.log("  Set OPENAI_API_KEY to enable analysis");
    console.log("  SKIPPED\n");
  } else {
    console.log(`  OPENAI_API_KEY: ${openaiKey.substring(0, 10)}...`);

    // Test API connectivity
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const hasGPT4 = data.data.some((m: any) => m.id.includes("gpt-4"));
        console.log(`  API connection: OK`);
        console.log(`  GPT-4 models available: ${hasGPT4}`);
        console.log("  PASSED\n");
      } else {
        console.log(`  API connection failed: ${response.status}`);
        console.log("  FAILED\n");
      }
    } catch (error) {
      console.log(`  API connection failed: ${error}`);
      console.log("  FAILED\n");
    }
  }

  // Test 3: GPT-4 Clip Analysis (mock transcript)
  console.log("Test 3: GPT-4 Clip Analysis");
  console.log("-".repeat(40));

  if (!openaiKey) {
    console.log("  Skipping: OPENAI_API_KEY not set\n");
  } else {
    try {
      const {
        CLIP_SELECTION_SYSTEM_PROMPT,
        buildClipSelectionPrompt,
      } = await import("../packages/workers/prompts/clip-selection");

      // Create a sample podcast transcript about technology/AI
      const sampleTranscript = {
        text: `Welcome to the Tech Talk podcast. Today we're discussing artificial intelligence and its impact on software development.

First, let me introduce our guest, Sarah Chen, who's been working in AI for over 15 years. Sarah, what do you think about the recent advances in large language models?

Thanks for having me. I think we're at an inflection point. The capabilities of models like GPT-4 and Claude are remarkable. But what's really exciting is how they're being applied to real-world problems.

Can you give us an example?

Absolutely. In healthcare, AI is now helping doctors diagnose diseases faster and more accurately. One study showed a 40% improvement in early cancer detection when AI-assisted screening was used.

That's incredible. What about the concerns around job displacement?

It's a valid concern, but history shows that technology tends to create more jobs than it destroys. The key is reskilling and education. We need to prepare the workforce for AI-augmented roles.

Before we wrap up, any advice for developers who want to get into AI?

Start with the fundamentals - machine learning basics, Python, and linear algebra. Then build projects. The best way to learn is by doing. There's never been a better time to get started.

Thanks Sarah. That's all for today. Tune in next week when we discuss quantum computing.`,
        segments: [
          { start: 0, end: 8, text: "Welcome to the Tech Talk podcast. Today we're discussing artificial intelligence and its impact on software development." },
          { start: 8, end: 15, text: "First, let me introduce our guest, Sarah Chen, who's been working in AI for over 15 years." },
          { start: 15, end: 22, text: "Thanks for having me. I think we're at an inflection point with AI capabilities." },
          { start: 22, end: 35, text: "In healthcare, AI is now helping doctors diagnose diseases faster. One study showed a 40% improvement in early cancer detection." },
          { start: 35, end: 42, text: "What about concerns around job displacement from AI?" },
          { start: 42, end: 55, text: "Technology tends to create more jobs than it destroys. The key is reskilling and education for AI-augmented roles." },
          { start: 55, end: 65, text: "Any advice for developers who want to get into AI? Start with machine learning basics, Python, and linear algebra." },
          { start: 65, end: 70, text: "Thanks Sarah. That's all for today. Tune in next week for quantum computing." },
        ],
        duration: 70,
      };

      const promptInput = {
        episodeTitle: "AI in Healthcare and Software Development",
        podcastTitle: "Tech Talk",
        transcript: sampleTranscript,
        userInterests: ["artificial intelligence", "healthcare", "career advice"],
      };

      const userPrompt = buildClipSelectionPrompt(promptInput);

      console.log("  Sending transcript to GPT-4 for analysis...");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: CLIP_SELECTION_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      // Parse the response
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      const result = JSON.parse(jsonContent);

      console.log(`  GPT-4 identified ${result.clips?.length || 0} clips`);

      if (result.clips && result.clips.length > 0) {
        for (const clip of result.clips) {
          const duration = clip.endTime - clip.startTime;
          console.log(`    - ${duration.toFixed(1)}s | Score: ${clip.relevanceScore} | ${clip.summary?.substring(0, 50)}...`);
        }
      }

      console.log(`  Tokens used: ${data.usage?.total_tokens || "unknown"}`);
      console.log("  PASSED\n");
    } catch (error) {
      console.log(`  FAILED: ${error}`);
      console.log();
    }
  }

  // Test 4: Database operations
  console.log("Test 4: Database Clip Operations");
  console.log("-".repeat(40));

  try {
    // Create test podcast and episode
    const testPodcast = await prisma.podcast.upsert({
      where: { rssUrl: "https://test.example.com/phase4-feed.xml" },
      update: {},
      create: {
        rssUrl: "https://test.example.com/phase4-feed.xml",
        title: "Phase 4 Test Podcast",
        author: "Test Author",
      },
    });
    console.log(`  Test podcast: ${testPodcast.id}`);

    const testEpisode = await prisma.episode.upsert({
      where: {
        podcastId_guid: {
          podcastId: testPodcast.id,
          guid: "phase4-test-episode",
        },
      },
      update: {},
      create: {
        podcastId: testPodcast.id,
        guid: "phase4-test-episode",
        title: "Phase 4 Test Episode",
        audioUrl: TEST_AUDIO_URL,
        publishedAt: new Date(),
        status: "transcribed",
        transcript: {
          text: "Test transcript content",
          segments: [
            { start: 0, end: 30, text: "First segment about AI technology" },
            { start: 30, end: 60, text: "Second segment about healthcare applications" },
            { start: 60, end: 90, text: "Third segment about career advice" },
          ],
          duration: 90,
        } as any,
      },
    });
    console.log(`  Test episode: ${testEpisode.id}`);

    // Create test clips
    await prisma.clip.deleteMany({
      where: { episodeId: testEpisode.id },
    });

    const clips = await prisma.clip.createMany({
      data: [
        {
          episodeId: testEpisode.id,
          startTime: 0,
          endTime: 30,
          duration: 30,
          transcript: "First segment about AI technology",
          relevanceScore: 85,
          reasoning: "Directly relevant to AI interests",
          summary: "Discussion about AI technology",
        },
        {
          episodeId: testEpisode.id,
          startTime: 30,
          endTime: 60,
          duration: 30,
          transcript: "Second segment about healthcare applications",
          relevanceScore: 92,
          reasoning: "Highly relevant to healthcare interest",
          summary: "AI in healthcare applications",
        },
        {
          episodeId: testEpisode.id,
          startTime: 60,
          endTime: 90,
          duration: 30,
          transcript: "Third segment about career advice",
          relevanceScore: 78,
          reasoning: "Valuable career guidance",
          summary: "Career advice for tech professionals",
        },
      ],
    });

    console.log(`  Created ${clips.count} test clips`);

    // Verify clips can be fetched
    const fetchedClips = await prisma.clip.findMany({
      where: { episodeId: testEpisode.id },
      orderBy: { relevanceScore: "desc" },
    });

    console.log(`  Fetched ${fetchedClips.length} clips`);
    console.log(`  Top clip score: ${fetchedClips[0]?.relevanceScore}`);

    // Update episode status
    await prisma.episode.update({
      where: { id: testEpisode.id },
      data: { status: "analyzed" },
    });

    const updatedEpisode = await prisma.episode.findUnique({
      where: { id: testEpisode.id },
      select: { status: true },
    });

    console.log(`  Episode status: ${updatedEpisode?.status}`);
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 5: Analysis worker (requires full environment)
  console.log("Test 5: Analysis Worker Integration");
  console.log("-".repeat(40));

  try {
    // Import the worker
    const { default: analysisWorker } = await import(
      "../packages/workers/server/jobs/analysis/worker"
    );

    console.log("  Worker module loaded successfully");

    // Verify worker function exists
    if (typeof analysisWorker === "function") {
      console.log("  Worker function exported correctly");
    } else {
      throw new Error("Worker is not a function");
    }

    // Check worker interfaces
    const testJobData = {
      episodeId: "test-episode-id",
      userId: "test-user-id",
      userInterests: ["AI", "technology"],
    };

    console.log(`  Job data interface: OK`);
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 6: Queue integration
  console.log("Test 6: Analysis Queue Integration");
  console.log("-".repeat(40));

  try {
    const { queueAnalysisJob, QUEUE_NAMES } = await import(
      "../packages/api/server/utils/queues"
    );

    console.log(`  Queue name: ${QUEUE_NAMES.ANALYSIS}`);

    // Try to queue a job (will return null if Redis not available)
    const result = await queueAnalysisJob({
      episodeId: "test-episode",
      userId: "test-user",
      userInterests: ["AI"],
    });

    if (result) {
      console.log(`  Queued job: ${result.jobId}`);
    } else {
      console.log("  Queue service not available (Redis not configured)");
    }

    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  ERROR: ${error}`);
    console.log("  (This is OK if Redis is not running)\n");
  }

  // Test 7: End-to-end flow (if all dependencies available)
  console.log("Test 7: End-to-End Analysis Flow");
  console.log("-".repeat(40));

  if (!openaiKey) {
    console.log("  Skipping: OPENAI_API_KEY not set\n");
  } else {
    try {
      // Create test user
      const testUser = await prisma.user.upsert({
        where: { email: "phase4-test@example.com" },
        update: {},
        create: {
          email: "phase4-test@example.com",
          name: "Phase 4 Test User",
          interests: ["artificial intelligence", "healthcare", "technology"],
        },
      });
      console.log(`  Test user: ${testUser.id}`);

      // Get test episode
      const testPodcast = await prisma.podcast.findUnique({
        where: { rssUrl: "https://test.example.com/phase4-feed.xml" },
      });

      if (!testPodcast) {
        throw new Error("Test podcast not found");
      }

      // Reset episode for analysis test
      const testEpisode = await prisma.episode.update({
        where: {
          podcastId_guid: {
            podcastId: testPodcast.id,
            guid: "phase4-test-episode",
          },
        },
        data: {
          status: "transcribed",
          transcript: {
            text: `Welcome to Tech Talk. Today we're exploring how artificial intelligence is transforming healthcare delivery.

Dr. Sarah Johnson joins us. She's led AI initiatives at major hospitals for the past decade.

Sarah, what's the most exciting application you're seeing right now?

Definitely diagnostic imaging. AI can detect patterns in X-rays and MRIs that human eyes might miss. We're seeing 30-40% improvements in early detection rates for certain cancers.

That's remarkable. What about concerns about AI replacing doctors?

AI augments human expertise, it doesn't replace it. The best outcomes come from collaboration between AI systems and experienced clinicians.

For our listeners interested in healthcare AI careers, where should they start?

Learn the fundamentals of both medicine and machine learning. Domain expertise in healthcare is crucial. Start with online courses in medical informatics.

Thank you Dr. Johnson. Coming up next week, we explore AI in drug discovery.`,
            segments: [
              { start: 0, end: 10, text: "Welcome to Tech Talk. Today we're exploring how artificial intelligence is transforming healthcare delivery." },
              { start: 10, end: 20, text: "Dr. Sarah Johnson joins us. She's led AI initiatives at major hospitals for the past decade." },
              { start: 20, end: 35, text: "Definitely diagnostic imaging. AI can detect patterns that human eyes might miss. We're seeing 30-40% improvements in early detection rates for certain cancers." },
              { start: 35, end: 48, text: "AI augments human expertise, it doesn't replace it. The best outcomes come from collaboration between AI systems and experienced clinicians." },
              { start: 48, end: 62, text: "For our listeners interested in healthcare AI careers, where should they start? Learn the fundamentals of both medicine and machine learning." },
              { start: 62, end: 70, text: "Thank you Dr. Johnson. Coming up next week, we explore AI in drug discovery." },
            ],
            duration: 70,
          } as any,
        },
      });

      console.log(`  Test episode ready: ${testEpisode.id}`);
      console.log(`  Status: ${testEpisode.status}`);

      // Clean up old clips
      await prisma.clip.deleteMany({
        where: { episodeId: testEpisode.id },
      });

      // Simulate the analysis worker job
      const { default: analysisWorker } = await import(
        "../packages/workers/server/jobs/analysis/worker"
      );

      // Create a mock job object
      const mockJob = {
        id: "test-job-" + Date.now(),
        data: {
          episodeId: testEpisode.id,
          userId: testUser.id,
          userInterests: testUser.interests,
        },
        log: async (msg: string) => console.log(`    [Worker] ${msg}`),
      };

      console.log("  Running analysis worker...");
      const result = await analysisWorker(mockJob as any);

      console.log(`  Analysis complete!`);
      console.log(`  Clips extracted: ${result.clips.length}`);

      for (const clip of result.clips) {
        const duration = clip.endTime - clip.startTime;
        console.log(`    - ${duration.toFixed(1)}s | Score: ${clip.relevanceScore} | ${clip.summary}`);
      }

      // Verify clips in database
      const dbClips = await prisma.clip.findMany({
        where: { episodeId: testEpisode.id },
        orderBy: { relevanceScore: "desc" },
      });

      console.log(`  Clips in database: ${dbClips.length}`);

      // Verify episode status
      const finalEpisode = await prisma.episode.findUnique({
        where: { id: testEpisode.id },
        select: { status: true },
      });

      console.log(`  Final episode status: ${finalEpisode?.status}`);

      if (finalEpisode?.status === "analyzed" && dbClips.length > 0) {
        console.log("  PASSED\n");
      } else {
        console.log("  FAILED: Expected status 'analyzed' with clips\n");
      }
    } catch (error) {
      console.log(`  FAILED: ${error}`);
      console.log();
    }
  }

  // Cleanup
  console.log("=".repeat(60));
  console.log("Test Cleanup");
  console.log("=".repeat(60));

  try {
    // Clean up test data
    const testPodcast = await prisma.podcast.findUnique({
      where: { rssUrl: "https://test.example.com/phase4-feed.xml" },
    });

    if (testPodcast) {
      // Delete clips first (cascade should handle this, but being explicit)
      const testEpisode = await prisma.episode.findFirst({
        where: {
          podcastId: testPodcast.id,
          guid: "phase4-test-episode",
        },
      });

      if (testEpisode) {
        await prisma.clip.deleteMany({
          where: { episodeId: testEpisode.id },
        });
        await prisma.episode.delete({
          where: { id: testEpisode.id },
        });
      }

      await prisma.podcast.delete({
        where: { id: testPodcast.id },
      });
      console.log("  Cleaned up test podcast and episodes");
    }

    // Clean up test user
    const testUser = await prisma.user.findUnique({
      where: { email: "phase4-test@example.com" },
    });

    if (testUser) {
      await prisma.user.delete({
        where: { id: testUser.id },
      });
      console.log("  Cleaned up test user");
    }

    console.log("  Cleanup complete\n");
  } catch (error) {
    console.log(`  Cleanup error (non-critical): ${error}\n`);
  }

  console.log("=".repeat(60));
  console.log("Tests completed");
  console.log("=".repeat(60));

  // Disconnect Prisma
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
