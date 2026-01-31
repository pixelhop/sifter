import { Job, Queue, Worker, QueueEvents } from "bullmq";
import { useRedis } from "./redis";

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();
const events = new Map<string, QueueEvents>();

export async function useQueue(name: string): Promise<Queue> {
  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const redis = await useRedis();
  const queue = new Queue(name, {
    connection: redis,
  });

  // Add event listeners for important queue events
  queue.on("error", (error) => {
    console.error(`Queue ${name} error:`, error);
  });

  queue.on("waiting", (job: Job) => {
    console.log(`Job ${job.id} is waiting in queue ${name}`);
  });

  queues.set(name, queue);

  return queue;
}

export async function useWorker<T>(
  name: string,
  handler: (job: Job<T>) => Promise<any>,
  failureHandler?: (job: Job<T>, error: Error) => void,
) : Promise<Worker> {
  if (workers.has(name)) {
    return workers.get(name)!;
  }

  const redis = await useRedis();
  const worker = new Worker(name, handler, {
    connection: redis,
  });

  // Add event listeners for important worker events
  worker.on("active", (job) => {
    console.log(`Worker ${name}: Job ${job.id} has started processing`);
  });

  worker.on("completed", (job) => {
    console.log(`Worker ${name}: Job ${job.id} has completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Worker ${name}: Job ${job?.id} has failed. Error:`, error);
    if (failureHandler && job) {
      failureHandler(job, error);
    }
  });

  worker.on("error", (error) => {
    console.error(`Worker ${name} error:`, error);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`Worker ${name}: Job ${jobId} has stalled`);
  });

  workers.set(name, worker);

  return worker;
}

export async function useQueueEvents(name: string): Promise<QueueEvents> {
  if (events.has(name)) {
    return events.get(name)!;
  }

  const redis = await useRedis();
  const queueEvents = new QueueEvents(name, {
    connection: redis,
  });

  events.set(name, queueEvents);

  return queueEvents;
}
