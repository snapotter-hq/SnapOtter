/**
 * System job dispatcher (stub).
 *
 * The system pool handles non-tool jobs like cron sweeps and retention.
 * Task 10 fills in the implementations.
 */
import type { Job } from "bullmq";

export async function runSystemJob(job: Job): Promise<unknown> {
  throw new Error(`Unknown system job: ${job.name}`);
}
