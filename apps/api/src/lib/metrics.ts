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

export const requestDuration = new Histogram({
  name: "snapotter_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["route_group", "status_class"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const authAttempts = new Counter({
  name: "snapotter_auth_attempts_total",
  help: "Authentication attempts",
  labelNames: ["method", "result"] as const,
  registers: [registry],
});

// One increment per /ingest forward that failed to reach PostHog (issue #788).
// `kind` is the closed set from classifyPostHogUpstreamError, so cardinality
// stays bounded. A nonzero rate here means browser analytics is being dropped
// between this instance and PostHog (egress firewalled, DNS broken, PostHog down).
// Scope caveats: failures after the upstream started responding (mid-body death,
// undici body timeout) surface on the response stream, not reply-from's onError,
// and a connect failure racing a still-streaming request body can be settled by
// the request-stream error path first, which skips onError. Both undercount
// slightly; treat this as a floor, not an exact ledger.
export const posthogProxyUpstreamErrors = new Counter({
  name: "snapotter_posthog_proxy_upstream_errors_total",
  help: "PostHog /ingest proxy forwards that failed to reach the upstream, by failure kind",
  labelNames: ["kind"] as const,
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
