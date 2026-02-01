/**
 * Test script for Sifter chunking and digest generation
 *
 * Usage:
 *   ELEVENLABS_API_KEY=xxx OPENAI_API_KEY=xxx DATABASE_URL=xxx npx tsx scripts/test-chunking.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

// Test configuration
const TEST_CONFIG = {
  // A sample podcast URL (My First Million or similar)
  sampleAudioUrl:
    "https://sphinx.acast.com/p/open/s/5e7f2ca127d7fd7a64aa3a6b/e/1234567890/media.mp3",
  // Alternatively use a local file for testing
  localTestFile: "/tmp/sifter/test_audio.mp3",
};

/**
 * Check if FFmpeg is available
 */
async function checkFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Create a dummy large MP3 file for testing
 */
async function createTestAudioFile(
  outputPath: string,
  durationMinutes: number
): Promise<string> {
  console.log(
    `Creating ${durationMinutes} minute test audio file at: ${outputPath}`
  );

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    // Generate a silent/sine wave MP3 file of specified duration
    const args = [
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=" + durationMinutes * 60,
      "-acodec",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-y",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);

    proc.stderr.on("data", (data) => {
      // FFmpeg outputs progress to stderr
      const line = data.toString();
      if (line.includes("time=")) {
        process.stdout.write(".");
      }
    });

    proc.on("close", (code) => {
      console.log(""); // New line after dots
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Import and test the chunking module
 */
async function testChunking() {
  console.log("\n=== Testing Audio Chunking ===\n");

  // Check FFmpeg
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.error("❌ FFmpeg not found. Please install FFmpeg first.");
    process.exit(1);
  }
  console.log("✅ FFmpeg is available");

  // Import chunking functions
  const {
    needsChunking,
    WHISPER_MAX_FILE_SIZE,
    prepareAudioForWhisper,
    splitAudioIntoChunks,
    getAudioInfo,
    getFileSize,
    cleanupChunks,
    mergeTranscriptChunks,
  } = await import("../packages/workers/utils/ffmpeg");

  console.log(`\n📊 Whisper API Limit: ${WHISPER_MAX_FILE_SIZE / 1024 / 1024} MB`);

  // Create test audio file (60 minutes to ensure chunking is needed)
  const testFile = "/tmp/sifter/test_60min.mp3";
  const chunkDir = "/tmp/sifter/test_chunks";

  try {
    await createTestAudioFile(testFile, 60);
    const fileSize = await getFileSize(testFile);
    console.log(
      `✅ Created test file: ${testFile} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
    );

    // Test chunking detection
    const needsChunk = await needsChunking(testFile);
    console.log(`\n📋 Chunking Detection:`);
    console.log(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Needs chunking: ${needsChunk ? "YES" : "NO"}`);
    console.log(`   Expected: YES (file > 25MB)`);
    console.log(`   ${needsChunk ? "✅ PASS" : "❌ FAIL"}`);

    if (needsChunk) {
      // Test chunking
      console.log(`\n🔧 Testing Audio Chunking:`);
      console.log(`   Output directory: ${chunkDir}`);

      const chunks = await splitAudioIntoChunks(testFile, chunkDir, {
        targetChunkDurationSeconds: 20 * 60, // 20 minute chunks
        overlapSeconds: 2,
      });

      console.log(`\n✅ Created ${chunks.length} chunks:`);
      let totalChunkSize = 0;
      for (const chunk of chunks) {
        const size = await getFileSize(chunk.path);
        totalChunkSize += size;
        const sizeMB = (size / 1024 / 1024).toFixed(2);
        console.log(
          `   Chunk ${chunk.index}: ${chunk.startTime}s-${chunk.endTime}s (${sizeMB} MB)`
        );

        // Verify chunk is under limit
        if (size > WHISPER_MAX_FILE_SIZE) {
          console.error(
            `   ❌ FAIL: Chunk ${chunk.index} exceeds 25MB limit!`
          );
        }
      }

      console.log(`\n📊 Chunk Summary:`);
      console.log(`   Total chunks: ${chunks.length}`);
      console.log(
        `   Total chunk size: ${(totalChunkSize / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(`   Original size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      // Cleanup chunks
      await cleanupChunks(chunks);
      console.log(`\n🧹 Cleaned up chunk files`);
    }

    // Cleanup test file
    await fs.promises.unlink(testFile).catch(() => {});
    console.log(`🧹 Cleaned up test file`);

    console.log("\n✅ Chunking tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Chunking test failed:", error);
    // Cleanup on error
    await fs.promises.unlink(testFile).catch(() => {});
    throw error;
  }
}

/**
 * Test transcript merging
 */
async function testTranscriptMerging() {
  console.log("\n=== Testing Transcript Merging ===\n");

  const { mergeTranscriptChunks } = await import(
    "../packages/workers/utils/ffmpeg"
  );

  // Simulate chunk transcripts
  const mockChunks = [
    {
      chunk: { index: 0, startTime: 0, endTime: 1200, path: "", duration: 1200 },
      transcript: {
        text: "This is the first chunk of the transcript.",
        segments: [
          { start: 0, end: 5, text: "This is the" },
          { start: 5, end: 10, text: "first chunk of" },
          { start: 10, end: 15, text: "the transcript." },
        ],
        duration: 1200,
      },
    },
    {
      chunk: { index: 1, startTime: 1200, endTime: 2400, path: "", duration: 1200 },
      transcript: {
        text: "This is the second chunk continuing the content.",
        segments: [
          { start: 0, end: 5, text: "This is the" },
          { start: 5, end: 10, text: "second chunk" },
          { start: 10, end: 15, text: "continuing the content." },
        ],
        duration: 1200,
      },
    },
  ];

  const merged = mergeTranscriptChunks(mockChunks, "en");

  console.log("📋 Merged Transcript Result:");
  console.log(`   Text: ${merged.text}`);
  console.log(`   Language: ${merged.language}`);
  console.log(`   Duration: ${merged.duration}s`);
  console.log(`   Segments: ${merged.segments.length}`);

  // Verify segment timestamps are adjusted
  console.log("\n📊 Segment Timestamps:");
  for (const seg of merged.segments) {
    console.log(`   [${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]: ${seg.text}`);
  }

  // Verify timestamps are properly offset
  const lastSegment = merged.segments[merged.segments.length - 1];
  if (lastSegment.end > 1200) {
    console.log("\n✅ PASS: Segment timestamps are properly offset");
  } else {
    console.log("\n❌ FAIL: Segment timestamps not properly offset");
  }

  console.log("\n✅ Transcript merging tests completed!");
}

/**
 * Test ElevenLabs TTS provider
 */
async function testTTSProvider() {
  console.log("\n=== Testing ElevenLabs TTS Provider ===\n");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log("⚠️ Skipping TTS test (ELEVENLABS_API_KEY not set)");
    return;
  }

  const { ElevenLabsProvider } = await import(
    "../packages/workers/providers/tts/elevenlabs"
  );

  const provider = new ElevenLabsProvider({ apiKey });
  console.log(`✅ Created TTS provider: ${provider.name}`);

  // Test voice list
  try {
    const voices = await provider.getVoices();
    console.log(`\n📢 Available Voices (${voices.length}):`);
    voices.slice(0, 5).forEach((v) => {
      console.log(`   - ${v.name} (${v.id})`);
    });
    if (voices.length > 5) {
      console.log(`   ... and ${voices.length - 5} more`);
    }
  } catch (error) {
    console.error("❌ Failed to fetch voices:", error);
  }

  // Test generation (short text to save credits)
  try {
    const testText = "Welcome to your personalized podcast digest.";
    const outputPath = "/tmp/sifter/test_tts.mp3";

    console.log(`\n🔊 Generating TTS audio...`);
    console.log(`   Text: "${testText}"`);
    console.log(`   Output: ${outputPath}`);

    const result = await provider.generate(testText, outputPath);

    console.log(`\n✅ TTS Generation Complete:`);
    console.log(`   Audio path: ${result.audioPath}`);
    console.log(`   Duration: ${result.duration}s`);
    console.log(`   Format: ${result.format}`);

    // Cleanup
    await fs.promises.unlink(outputPath).catch(() => {});
  } catch (error) {
    console.error("❌ TTS generation failed:", error);
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log("🧪 Sifter Implementation Tests");
  console.log("================================\n");

  try {
    await testChunking();
    await testTranscriptMerging();
    await testTTSProvider();

    console.log("\n================================");
    console.log("✅ All tests completed!");
  } catch (error) {
    console.error("\n================================");
    console.error("❌ Tests failed:", error);
    process.exit(1);
  }
}

main();
