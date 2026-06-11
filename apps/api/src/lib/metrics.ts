/**
 * Prometheus metrics registry and helpers.
 *
 * Exposes counters for finished jobs, a histogram for job duration,
 * and a metricsText() function that appends live queue-depth gauges
 * from BullMQ before returning the scrape payload.
 */
import { Counter, collectDefaultMetrics, Histogram, Registry } from "prom-client";
import { perPoolCounts } from "../jobs/queues.js";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const jobsTotal = new Counter({
  name: "snapotter_jobs_total",
  help: "Jobs finished by pool and status",
  labelNames: ["pool", "status"] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: "snapotter_job_duration_seconds",
  help: "Job processing duration",
  labelNames: ["pool"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 15, 60, 300, 1800],
  registers: [registry],
});

export async function metricsText(): Promise<string> {
  const counts = await perPoolCounts();
  const lines: string[] = [
    "# HELP snapotter_queue_jobs Current queue depth by pool and state",
    "# TYPE snapotter_queue_jobs gauge",
  ];
  for (const [pool, c] of Object.entries(counts)) {
    lines.push(`snapotter_queue_jobs{pool="${pool}",state="active"} ${c.active}`);
    lines.push(`snapotter_queue_jobs{pool="${pool}",state="waiting"} ${c.waiting}`);
  }
  return `${await registry.metrics()}\n${lines.join("\n")}\n`;
}
