import type { Job } from "bullmq";
import { useJobLogger } from "../../utils/jobs";
import { sleep } from "../../utils/sleep";

export interface ExampleJobData {
  message?: string;
}

export default async function exampleJobWorker(
  job: Job<ExampleJobData>,
) {
  const logger = useJobLogger(job);
  const payload = job.data.message ?? "No message provided";

  logger.log(`Processing example job: ${payload}`);
  await sleep(500);
  logger.log("Example job completed");

  return {
    processedAt: new Date().toISOString(),
    payload,
  };
}

