import {
  defineEventHandler,
  createError,
  getRouterParam,
  getHeader,
  setResponseHeader,
  sendStream,
} from "h3";
import { usePrismaClient } from "../../../../utils/prisma";
import * as fs from "node:fs";
import * as path from "node:path";

// GET /api/digests/:id/audio
// Stream the digest audio file
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Digest ID is required",
    });
  }

  const authHeader = getHeader(event, "authorization");

  const prisma = usePrismaClient();

  const digest = await prisma.digest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      audioUrl: true,
      isPublic: true,
      duration: true,
    },
  });

  if (!digest) {
    throw createError({
      statusCode: 404,
      statusMessage: "Digest not found",
    });
  }

  // Check if digest is ready
  if (digest.status !== "ready") {
    throw createError({
      statusCode: 400,
      statusMessage: `Digest is not ready (status: ${digest.status})`,
    });
  }

  // Check ownership (or if public)
  const isOwner = authHeader
    ? digest.userId === authHeader.replace("Bearer ", "").trim()
    : false;

  if (!isOwner && !digest.isPublic) {
    throw createError({
      statusCode: 403,
      statusMessage: "You don't have access to this digest",
    });
  }

  if (!digest.audioUrl) {
    throw createError({
      statusCode: 404,
      statusMessage: "Audio not found",
    });
  }

  // For local files
  if (digest.audioUrl.startsWith("/audio/")) {
    const filePath = path.join("/tmp/sifter", digest.audioUrl.replace("/audio/", ""));

    if (!fs.existsSync(filePath)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Audio file not found",
      });
    }

    const stats = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    setResponseHeader(event, "Content-Type", "audio/mpeg");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setResponseHeader(event, "Content-Length", String(stats.size) as never);
    setResponseHeader(event, "Accept-Ranges", "bytes");
    setResponseHeader(event, "Cache-Control", "public, max-age=86400");

    return sendStream(event, stream);
  }

  // For external URLs (S3, CDN, etc.)
  // Return a redirect or proxy the request
  return {
    audioUrl: digest.audioUrl,
    duration: digest.duration,
  };
});
