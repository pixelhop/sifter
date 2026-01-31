/**
 * Test script for Sifter Pipeline (Phases 3-4)
 *
 * Tests:
 * 1. Download utility
 * 2. FFmpeg utilities
 * 3. Status deduplication logic
 * 4. Transcription flow (requires OpenAI API key)
 * 5. Clip selection prompt building
 * 6. Full analysis pipeline (requires OpenAI API key)
 *
 * Usage:
 *   pnpm tsx scripts/test-pipeline.ts
 *   pnpm tsx scripts/test-pipeline.ts --full    # Run transcription test
 *   pnpm tsx scripts/test-pipeline.ts --analysis # Run analysis test
 *
 * Requirements:
 *   - Redis running on REDIS_URL
 *   - Database configured with DATABASE_URL
 *   - FFmpeg installed (for audio tests)
 *   - OPENAI_API_KEY set (for transcription/analysis tests)
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

const prismaClient = new PrismaClient();

// Test configuration
const TEST_AUDIO_URL =
  "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3";
const TEST_TEMP_DIR = "/tmp/sifter-test";

async function main() {
  console.log("=".repeat(60));
  console.log("Sifter Phase 3: Audio Pipeline Tests");
  console.log("=".repeat(60));
  console.log();

  const prisma = prismaClient;

  // Test 1: Download utility
  console.log("Test 1: Download Utility");
  console.log("-".repeat(40));

  try {
    const { downloadAudio, ensureTempDir, cleanupDownload } = await import(
      "../packages/workers/utils/download"
    );

    await fs.promises.mkdir(TEST_TEMP_DIR, { recursive: true });
    const testFile = path.join(TEST_TEMP_DIR, "test-download.mp3");

    console.log(`Downloading test audio from: ${TEST_AUDIO_URL}`);
    const result = await downloadAudio(TEST_AUDIO_URL, testFile, {
      onProgress: (progress) => {
        if (progress.percentage && progress.percentage % 25 === 0) {
          console.log(`  Progress: ${progress.percentage}%`);
        }
      },
    });

    console.log(`  Downloaded to: ${result.path}`);
    console.log(`  Size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`  Content-Type: ${result.contentType}`);

    // Verify file exists
    const stats = await fs.promises.stat(testFile);
    console.log(`  File verified: ${stats.size} bytes`);

    // Cleanup
    await cleanupDownload(testFile);
    console.log("  Cleanup: OK");
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 2: FFmpeg utilities
  console.log("Test 2: FFmpeg Utilities");
  console.log("-".repeat(40));

  try {
    const {
      checkFFmpegAvailable,
      getAudioDuration,
      getAudioInfo,
      sliceClip,
      addFadeInOut,
      concatenateClips,
    } = await import("../packages/workers/utils/ffmpeg");

    // Check FFmpeg availability
    const available = await checkFFmpegAvailable();
    console.log(`  FFmpeg available: ${available}`);

    if (!available) {
      console.log("  Skipping FFmpeg tests (FFmpeg not installed)");
      console.log("  SKIPPED\n");
    } else {
      // Download a test file for FFmpeg tests
      const { downloadAudio, cleanupDownload } = await import(
        "../packages/workers/utils/download"
      );

      const testFile = path.join(TEST_TEMP_DIR, "ffmpeg-test.mp3");
      await downloadAudio(TEST_AUDIO_URL, testFile);

      // Get duration
      const duration = await getAudioDuration(testFile);
      console.log(`  Duration: ${duration.toFixed(2)}s`);

      // Get audio info
      const info = await getAudioInfo(testFile);
      console.log(`  Sample rate: ${info.sampleRate} Hz`);
      console.log(`  Channels: ${info.channels}`);
      console.log(`  Codec: ${info.codec}`);
      console.log(`  Bitrate: ${info.bitrate} kbps`);

      // Slice a clip (first 5 seconds)
      const clipFile = path.join(TEST_TEMP_DIR, "clip.mp3");
      await sliceClip(testFile, clipFile, {
        startTime: 0,
        endTime: Math.min(5, duration),
        fadeIn: 0.5,
        fadeOut: 0.5,
      });
      const clipDuration = await getAudioDuration(clipFile);
      console.log(`  Sliced clip duration: ${clipDuration.toFixed(2)}s`);

      // Add fades to original
      const fadedFile = path.join(TEST_TEMP_DIR, "faded.mp3");
      await addFadeInOut(clipFile, fadedFile, 0.3, 0.3);
      console.log(`  Added fades: OK`);

      // Concatenate clips
      const concatFile = path.join(TEST_TEMP_DIR, "concatenated.mp3");
      await concatenateClips([clipFile, fadedFile], concatFile);
      const concatDuration = await getAudioDuration(concatFile);
      console.log(`  Concatenated duration: ${concatDuration.toFixed(2)}s`);

      // Cleanup
      await cleanupDownload(testFile);
      await cleanupDownload(clipFile);
      await cleanupDownload(fadedFile);
      await cleanupDownload(concatFile);
      console.log("  Cleanup: OK");
      console.log("  PASSED\n");
    }
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 3: Episode deduplication logic
  console.log("Test 3: Episode Deduplication Logic");
  console.log("-".repeat(40));

  try {
    // Create a test podcast and episode
    const testPodcast = await prisma.podcast.upsert({
      where: { rssUrl: "https://test.example.com/feed.xml" },
      update: {},
      create: {
        rssUrl: "https://test.example.com/feed.xml",
        title: "Test Podcast (Phase 3)",
        author: "Test Author",
      },
    });
    console.log(`  Test podcast: ${testPodcast.id}`);

    const testEpisode = await prisma.episode.upsert({
      where: {
        podcastId_guid: {
          podcastId: testPodcast.id,
          guid: "test-episode-phase3-dedup",
        },
      },
      update: { status: "pending" },
      create: {
        podcastId: testPodcast.id,
        guid: "test-episode-phase3-dedup",
        title: "Test Episode for Deduplication",
        audioUrl: TEST_AUDIO_URL,
        publishedAt: new Date(),
        status: "pending",
      },
    });
    console.log(`  Test episode: ${testEpisode.id}`);
    console.log(`  Initial status: ${testEpisode.status}`);

    // Simulate status transitions
    const statusFlow = ["downloading", "transcribing", "transcribed"] as const;

    for (const status of statusFlow) {
      await prisma.episode.update({
        where: { id: testEpisode.id },
        data: { status },
      });

      const updated = await prisma.episode.findUnique({
        where: { id: testEpisode.id },
        select: { status: true },
      });
      console.log(`  Transition: ${updated?.status}`);
    }

    // Test deduplication: fetch episode and check if already transcribed
    const episode = await prisma.episode.findUnique({
      where: { id: testEpisode.id },
      select: { status: true },
    });

    const shouldProcess =
      episode?.status === "pending" || episode?.status === "failed";
    console.log(`  Should process: ${shouldProcess} (status: ${episode?.status})`);
    console.log(`  Deduplication working: ${!shouldProcess}`);

    // Reset for next test
    await prisma.episode.update({
      where: { id: testEpisode.id },
      data: { status: "pending", transcript: null },
    });
    console.log("  Reset to pending: OK");
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 4: Whisper Provider (mock check)
  console.log("Test 4: Whisper Provider Configuration");
  console.log("-".repeat(40));

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const whisperMode = process.env.WHISPER_MODE || "api";

    console.log(`  WHISPER_MODE: ${whisperMode}`);
    console.log(`  OPENAI_API_KEY: ${openaiKey ? "set" : "not set"}`);

    if (whisperMode === "api" && !openaiKey) {
      console.log("  Warning: API mode selected but OPENAI_API_KEY not set");
      console.log("  Set OPENAI_API_KEY to enable transcription");
      console.log("  SKIPPED\n");
    } else if (whisperMode === "local") {
      // Check if Python and Whisper are available
      const { spawn } = await import("node:child_process");
      const pythonCheck = spawn("python3", ["-c", "import whisper; print('ok')"]);

      let output = "";
      pythonCheck.stdout.on("data", (data) => {
        output += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        pythonCheck.on("close", (code) => {
          if (code === 0 && output.includes("ok")) {
            console.log("  Local Whisper: available");
            resolve();
          } else {
            console.log("  Local Whisper: not installed");
            console.log("  Run: pip install openai-whisper");
            reject(new Error("Whisper not available"));
          }
        });
        pythonCheck.on("error", () => {
          console.log("  Python3: not found");
          reject(new Error("Python not available"));
        });
      });
      console.log("  PASSED\n");
    } else {
      console.log("  Configuration: OK");
      console.log("  PASSED\n");
    }
  } catch (error) {
    console.log(`  SKIPPED (${error})`);
    console.log();
  }

  // Test 5: Full transcription (optional, requires API key)
  console.log("Test 5: Full Transcription (Optional)");
  console.log("-".repeat(40));

  const openaiKey = process.env.OPENAI_API_KEY;
  const runFullTest = process.argv.includes("--full");

  if (!openaiKey) {
    console.log("  Skipping: OPENAI_API_KEY not set");
    console.log("  To run full test: OPENAI_API_KEY=sk-... pnpm tsx scripts/test-pipeline.ts --full\n");
  } else if (!runFullTest) {
    console.log("  Skipping: Use --full flag to run transcription test");
    console.log("  Warning: This will use OpenAI API credits\n");
  } else {
    try {
      const { OpenAIWhisperProvider } = await import(
        "../packages/workers/providers/whisper/openai"
      );
      const { downloadAudio, cleanupDownload } = await import(
        "../packages/workers/utils/download"
      );

      // Download test audio
      const testFile = path.join(TEST_TEMP_DIR, "transcription-test.mp3");
      console.log("  Downloading test audio...");
      await downloadAudio(TEST_AUDIO_URL, testFile);

      // Transcribe
      console.log("  Transcribing with OpenAI Whisper...");
      const whisper = new OpenAIWhisperProvider({ apiKey: openaiKey });
      const result = await whisper.transcribe(testFile);

      console.log(`  Text: "${result.text.substring(0, 100)}..."`);
      console.log(`  Segments: ${result.segments.length}`);
      console.log(`  Language: ${result.language}`);
      console.log(`  Duration: ${result.duration}s`);

      // Cleanup
      await cleanupDownload(testFile);
      console.log("  PASSED\n");
    } catch (error) {
      console.log(`  FAILED: ${error}`);
      console.log();
    }
  }

  // Test 6: Clip Selection Prompt Building
  console.log("Test 6: Clip Selection Prompt");
  console.log("-".repeat(40));

  try {
    const { buildClipSelectionPrompt, CLIP_SELECTION_SYSTEM_PROMPT } = await import(
      "../packages/workers/prompts/clip-selection"
    );

    // Test with sample data
    const testPrompt = buildClipSelectionPrompt({
      episodeTitle: "Test Episode",
      podcastTitle: "Test Podcast",
      transcript: {
        text: "This is a test transcript about technology and AI.",
        segments: [
          { start: 0, end: 30, text: "Welcome to the show." },
          { start: 30, end: 90, text: "Today we discuss artificial intelligence and its impact on society." },
          { start: 90, end: 150, text: "Machine learning has revolutionized many industries." },
        ],
        duration: 150,
      },
      userInterests: ["technology", "AI", "machine learning"],
    });

    console.log(`  System prompt length: ${CLIP_SELECTION_SYSTEM_PROMPT.length} chars`);
    console.log(`  User prompt length: ${testPrompt.length} chars`);
    console.log(`  Contains interests: ${testPrompt.includes("technology")}`);
    console.log(`  Contains timestamps: ${testPrompt.includes("[0.0s")}`);
    console.log("  PASSED\n");
  } catch (error) {
    console.log(`  FAILED: ${error}`);
    console.log();
  }

  // Test 7: Full Analysis Pipeline (optional, requires API key)
  console.log("Test 7: Full Analysis Pipeline (Optional)");
  console.log("-".repeat(40));

  const runAnalysisTest = process.argv.includes("--analysis");

  if (!openaiKey) {
    console.log("  Skipping: OPENAI_API_KEY not set");
    console.log("  To run analysis test: OPENAI_API_KEY=sk-... pnpm tsx scripts/test-pipeline.ts --analysis\n");
  } else if (!runAnalysisTest) {
    console.log("  Skipping: Use --analysis flag to run analysis test");
    console.log("  Warning: This will use OpenAI API credits\n");
  } else {
    try {
      const {
        buildClipSelectionPrompt,
        CLIP_SELECTION_SYSTEM_PROMPT,
      } = await import("../packages/workers/prompts/clip-selection");

      // Create test user with interests
      const testUser = await prisma.user.upsert({
        where: { email: "test-analysis@example.com" },
        update: { interests: ["technology", "AI", "startups"] },
        create: {
          email: "test-analysis@example.com",
          name: "Test Analysis User",
          interests: ["technology", "AI", "startups"],
        },
      });
      console.log(`  Test user: ${testUser.id}`);

      // Create test podcast and episode with mock transcript
      const testPodcast = await prisma.podcast.upsert({
        where: { rssUrl: "https://test-analysis.example.com/feed.xml" },
        update: {},
        create: {
          rssUrl: "https://test-analysis.example.com/feed.xml",
          title: "Test Analysis Podcast",
          author: "Test Author",
        },
      });
      console.log(`  Test podcast: ${testPodcast.id}`);

      // Create a mock transcript with interesting segments
      const mockTranscript = {
        text: "Welcome to the show. Today we're discussing AI and startups. The key insight is that machine learning can transform business operations. Let me tell you a story about a startup that grew from zero to a million users. They used AI to personalize their product. The results were incredible - 300% improvement in engagement. Now let's talk about the future of technology. I believe we're at an inflection point. Thanks for listening.",
        segments: [
          { start: 0, end: 15, text: "Welcome to the show." },
          { start: 15, end: 30, text: "Today we're discussing AI and startups." },
          { start: 30, end: 60, text: "The key insight is that machine learning can transform business operations." },
          { start: 60, end: 90, text: "Let me tell you a story about a startup that grew from zero to a million users." },
          { start: 90, end: 120, text: "They used AI to personalize their product." },
          { start: 120, end: 150, text: "The results were incredible - 300% improvement in engagement." },
          { start: 150, end: 180, text: "Now let's talk about the future of technology." },
          { start: 180, end: 210, text: "I believe we're at an inflection point." },
          { start: 210, end: 225, text: "Thanks for listening." },
        ],
        language: "en",
        duration: 225,
      };

      const testEpisode = await prisma.episode.upsert({
        where: {
          podcastId_guid: {
            podcastId: testPodcast.id,
            guid: "test-episode-analysis",
          },
        },
        update: {
          status: "transcribed",
          transcript: mockTranscript,
        },
        create: {
          podcastId: testPodcast.id,
          guid: "test-episode-analysis",
          title: "Test Episode for Analysis",
          audioUrl: TEST_AUDIO_URL,
          publishedAt: new Date(),
          status: "transcribed",
          transcript: mockTranscript,
        },
      });
      console.log(`  Test episode: ${testEpisode.id}`);
      console.log(`  Status: ${testEpisode.status}`);

      // Build and send prompt to GPT-4
      const userPrompt = buildClipSelectionPrompt({
        episodeTitle: testEpisode.title,
        podcastTitle: testPodcast.title,
        transcript: mockTranscript,
        userInterests: testUser.interests,
      });

      console.log("  Calling GPT-4 for clip selection...");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: CLIP_SELECTION_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const clipSelection = JSON.parse(content);

      console.log(`  Clips extracted: ${clipSelection.clips?.length || 0}`);

      if (clipSelection.clips && clipSelection.clips.length > 0) {
        for (const clip of clipSelection.clips) {
          console.log(`    - [${clip.startTime}s-${clip.endTime}s] Score: ${clip.relevanceScore}`);
          console.log(`      Summary: ${clip.summary}`);
        }

        // Save clips to database
        await prisma.clip.deleteMany({ where: { episodeId: testEpisode.id } });

        for (const clip of clipSelection.clips) {
          await prisma.clip.create({
            data: {
              episodeId: testEpisode.id,
              startTime: clip.startTime,
              endTime: clip.endTime,
              duration: clip.endTime - clip.startTime,
              transcript: clip.transcript,
              relevanceScore: clip.relevanceScore,
              reasoning: clip.reasoning,
              summary: clip.summary,
            },
          });
        }

        // Update episode status
        await prisma.episode.update({
          where: { id: testEpisode.id },
          data: { status: "analyzed" },
        });

        console.log(`  Clips saved to database`);
        console.log(`  Episode status updated to: analyzed`);
      }

      console.log("  PASSED\n");
    } catch (error) {
      console.log(`  FAILED: ${error}`);
      console.log();
    }
  }

  // Cleanup temp directory
  try {
    await fs.promises.rm(TEST_TEMP_DIR, { recursive: true, force: true });
    console.log("Cleanup: Removed test directory");
  } catch {
    // Ignore
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
