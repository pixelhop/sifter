import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { H3Adapter } from "@bull-board/h3";
import { Queue } from "bullmq";
import { useQueue, useWorker } from "../utils/queues";
import transcriptionWorker from "../jobs/transcription/worker";
import analysisWorker from "../jobs/analysis/worker";
import stitchingWorker from "../jobs/stitching/worker";

// Queue names
export const QUEUE_NAMES = {
  TRANSCRIPTION: "transcription",
  ANALYSIS: "analysis",
  STITCHING: "stitching",
} as const;

export default defineNitroPlugin(async (nitroApp) => {
  const serverAdapter = new H3Adapter();
  serverAdapter.setBasePath("/admin/queues");
  serverAdapter.setStaticPath("/admin/queues", "./admin/queues");

  // Set up transcription queue
  const transcriptionQueue = await useQueue(QUEUE_NAMES.TRANSCRIPTION);
  await useWorker(QUEUE_NAMES.TRANSCRIPTION, transcriptionWorker);
  console.log(`Queue "${QUEUE_NAMES.TRANSCRIPTION}" initialized`);

  // Set up analysis queue
  const analysisQueue = await useQueue(QUEUE_NAMES.ANALYSIS);
  await useWorker(QUEUE_NAMES.ANALYSIS, analysisWorker);
  console.log(`Queue "${QUEUE_NAMES.ANALYSIS}" initialized`);

  // Set up stitching queue
  const stitchingQueue = await useQueue(QUEUE_NAMES.STITCHING);
  await useWorker(QUEUE_NAMES.STITCHING, stitchingWorker);
  console.log(`Queue "${QUEUE_NAMES.STITCHING}" initialized`);

  // Create the Bull Board monitor UI with all queues
  const bullQueues: Queue[] = [
    transcriptionQueue,
    analysisQueue,
    stitchingQueue,
  ];

  createBullBoard({
    queues: bullQueues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  nitroApp.router.use(
    "/admin/queues/**",
    serverAdapter.registerHandlers().handler
  );
  nitroApp.router.use(
    "/admin/queues",
    serverAdapter.registerHandlers().handler
  );

  console.log("Bull Board dashboard available at /admin/queues");
});
