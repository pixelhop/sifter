import { defineEventHandler, createError, getHeader, readBody } from "h3";
import { usePrismaClient } from "../../../utils/prisma";
import { queueOrchestratorJob } from "../../../utils/queues";

// POST /api/digests/generate
// Single endpoint to generate a complete digest end-to-end.
//
// Auth: Bearer <userId>
// Body: { frequency?: "daily" | "weekly" }
//
// This queues an orchestrator job that:
// 1. Finds recent episodes from user subscriptions
// 2. Transcribes any that need it
// 3. Analyzes episodes with user interests
// 4. Runs curation to select best 6-8 clips
// 5. Generates narrator script, TTS audio, and stitches final digest
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization");
  if (!authHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authorization required",
    });
  }

  const userId = authHeader.replace("Bearer ", "").trim();

  const prisma = usePrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, frequency: true },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid user",
    });
  }

  const body = await readBody(event).catch(() => ({}));
  const frequency = body?.frequency || user.frequency || "daily";

  if (frequency !== "daily" && frequency !== "weekly") {
    throw createError({
      statusCode: 400,
      statusMessage: "frequency must be 'daily' or 'weekly'",
    });
  }

  const result = await queueOrchestratorJob({
    userId,
    frequency,
  });

  if (!result) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to queue orchestrator job. Redis may not be configured.",
    });
  }

  return {
    status: "queued",
    jobId: result.jobId,
    frequency,
    message: `Digest generation queued. The orchestrator will transcribe, analyze, curate, and generate audio automatically.`,
  };
});
