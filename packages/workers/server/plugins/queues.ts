import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { H3Adapter } from "@bull-board/h3";
import { Queue } from "bullmq";
import { useQueue, useWorker } from "../utils/queues";
import transcriptionWorker from "../jobs/transcription/worker";
import analysisWorker from "../jobs/analysis/worker";
import curationWorker from "../jobs/curation/worker";
import digestWorker from "../jobs/digest/worker";

// Queue names
export const QUEUE_NAMES = {
  TRANSCRIPTION: "transcription",
  ANALYSIS: "analysis",
  CURATION: "curation",
  STITCHING: "stitching",
  DIGEST: "digest",
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

  // Set up curation queue
  const curationQueue = await useQueue(QUEUE_NAMES.CURATION);
  await useWorker(QUEUE_NAMES.CURATION, curationWorker);
  console.log(`Queue "${QUEUE_NAMES.CURATION}" initialized`);

  // Set up digest generation queue
  const digestQueue = await useQueue(QUEUE_NAMES.DIGEST);
  await useWorker(QUEUE_NAMES.DIGEST, digestWorker);
  console.log(`Queue "${QUEUE_NAMES.DIGEST}" initialized`);

  // Create the Bull Board monitor UI with all queues
  const bullQueues: Queue[] = [
    transcriptionQueue,
    analysisQueue,
    curationQueue,
    digestQueue,
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
