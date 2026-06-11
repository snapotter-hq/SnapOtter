/**
 * System job dispatcher (stub).
 *
 * The system pool handles non-tool jobs like cron sweeps and retention.
 * Task 10 fills in the implementations.
 */
import type { Job } from "bullmq";
import type { ToolJobResult } from "./types.js";

export async function runSystemJob(job: Job): Promise<ToolJobResult> {
  throw new Error(`Unknown system job: ${job.name}`);
}
