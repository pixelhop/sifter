import { Job } from "bullmq";

/**
 * A utility function to log messages to the console and the job log
 * @param job
 * @returns
 */
export function useJobLogger(job: Job) {
  return {
    log: (message: string) => {
      console.log(message);
      return job.log(message);
    },
    warn: (message: string) => {
      console.warn(message);
      return job.log(message);
    },
    error: (message: string) => {
      console.error(message);
      return job.log(message);
    },
  };
}
