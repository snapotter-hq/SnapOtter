/**
 * Sentry performance-tracing sampler for the API, kept pure (no @sentry/node
 * import) so it is unit-testable without the SDK.
 *
 * Tracing is OFF unless SENTRY_TRACES_SAMPLE_RATE is a positive number (see
 * instrument.ts). The July 2026 quota incident came from the default redis and
 * postgres integrations turning BullMQ blocking-poll commands and pg idle
 * connection pings into standalone root transactions the moment any sampler was
 * enabled. This sampler returns 0 for exactly those, three independent ways
 * (op prefix, db.system, messaging.system + name), so a poll storm can never
 * count against quota again, while real HTTP requests and named job executions
 * still sample.
 */
export interface SamplingContext {
  name?: string;
  attributes?: Record<string, unknown>;
  /** Sentry's helper: returns the parent's decision when there is one, else the fallback. */
  inheritOrSampleWith?: (fallback: number) => number;
}

export function buildTracesSampler(httpRate: number): (ctx: SamplingContext) => number {
  return (ctx: SamplingContext): number => {
    const attrs = ctx.attributes ?? {};
    const name = ctx.name ?? "";
    const inherit = (fallback: number): number =>
      typeof ctx.inheritOrSampleWith === "function" ? ctx.inheritOrSampleWith(fallback) : fallback;

    // Standalone db / redis root transactions (pg idle pings, BullMQ blocking
    // polls). The exact incident source: zero them outright.
    const op = String(attrs["sentry.op"] ?? "");
    if (op.startsWith("db")) return 0;
    if (attrs["db.system"] === "redis") return 0;

    // Any queue root span: only sample a real job execution we explicitly named
    // "job <name>" (see worker.ts); drop the continuous poll transactions.
    if (attrs["messaging.system"] !== undefined) {
      // Sample a real job execution (the worker's "job.process" span, or a
      // "job <name>" span); drop the continuous BullMQ poll transactions.
      const isJob = name === "job.process" || name.startsWith("job ");
      return isJob ? Math.min(httpRate, 0.2) : 0;
    }

    // Never sample infra endpoints, even though they are real HTTP.
    if (/\/(healthz|readyz|metrics)\b/.test(name)) return 0;

    // Real inbound HTTP: sample at the configured rate, honoring parent traces.
    if (attrs["http.request.method"] !== undefined) return inherit(httpRate);

    // Anything else: follow the parent decision, else drop.
    return inherit(0);
  };
}
