import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { H3Adapter } from "@bull-board/h3";
import { Queue } from "bullmq";
import { useQueue, useWorker } from "../utils/queues";
import exampleJobWorker from "../jobs/example/worker";

export default defineNitroPlugin(async (nitroApp) => {
  const serverAdapter = new H3Adapter();
  serverAdapter.setBasePath("/admin/queues");
  serverAdapter.setStaticPath("/admin/queues", "./admin/queues");

  const exampleQueue = await useQueue("example-jobs");
  await useWorker("example-jobs", exampleJobWorker);
  await exampleQueue?.add(
    "example-jobs",
    { message: "Hello from the worker service 👋" },
    {
      jobId: "example-jobs-heartbeat",
      repeat: { every: 60_000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );

  // create the bull board monitor UI
  const bullQueues: Queue[] = [];
  if (exampleQueue) {
    bullQueues.push(exampleQueue);
  }

  createBullBoard({
    queues: bullQueues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  nitroApp.router.use(
    "/admin/queues/**",
    serverAdapter.registerHandlers().handler,
  );
  nitroApp.router.use(
    "/admin/queues",
    serverAdapter.registerHandlers().handler,
  );
});
