import { describe, expect, it } from "vitest";
import { buildTracesSampler } from "../../../apps/api/src/lib/sentry-tracing.js";

const sampler = buildTracesSampler(0.05);

describe("buildTracesSampler (the July-incident guard)", () => {
  it("zeroes standalone redis root transactions (BullMQ blocking polls)", () => {
    expect(sampler({ name: "BRPOPLPUSH", attributes: { "db.system": "redis" } })).toBe(0);
  });

  it("zeroes standalone db root transactions (pg idle pings) by op prefix", () => {
    expect(sampler({ name: "SELECT 1", attributes: { "sentry.op": "db.query" } })).toBe(0);
    expect(sampler({ name: "pg", attributes: { "sentry.op": "db.redis" } })).toBe(0);
  });

  it("drops queue poll transactions but samples real job executions", () => {
    expect(sampler({ name: "queue.poll", attributes: { "messaging.system": "bullmq" } })).toBe(0);
    expect(
      sampler({ name: "job.process", attributes: { "messaging.system": "bullmq" } }),
    ).toBeGreaterThan(0);
    expect(
      sampler({ name: "job resize", attributes: { "messaging.system": "bullmq" } }),
    ).toBeGreaterThan(0);
  });

  it("never samples infra endpoints even as HTTP", () => {
    expect(sampler({ name: "GET /healthz", attributes: { "http.request.method": "GET" } })).toBe(0);
    expect(sampler({ name: "GET /readyz", attributes: { "http.request.method": "GET" } })).toBe(0);
    expect(sampler({ name: "GET /metrics", attributes: { "http.request.method": "GET" } })).toBe(0);
  });

  it("samples real inbound HTTP at the configured rate", () => {
    expect(
      sampler({
        name: "POST /api/v1/tools/image/resize",
        attributes: { "http.request.method": "POST" },
      }),
    ).toBe(0.05);
  });

  it("respects an explicit parent sampling decision via inheritOrSampleWith", () => {
    expect(
      sampler({
        name: "GET /api/v1/x",
        attributes: { "http.request.method": "GET" },
        inheritOrSampleWith: () => 1,
      }),
    ).toBe(1);
  });

  it("drops anything unrecognized when there is no parent", () => {
    expect(sampler({ name: "mystery", attributes: {} })).toBe(0);
    expect(sampler({})).toBe(0);
  });
});
