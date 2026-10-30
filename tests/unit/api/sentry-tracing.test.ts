import { describe, expect, it } from "vitest";
import { buildTracesSampler } from "../../../apps/api/src/lib/sentry-tracing.js";

const sampler = buildTracesSampler(0.05);

describe("buildTracesSampler (the July-incident guard)", () => {
  it("zeroes standalone redis root transactions (BullMQ blocking polls)", () => {
    expect(sampler({ name: "BRPOPLPUSH", attributes: { "db.system": "redis" } })).toBe(0);
  });

  it("zeroes the Redis root spans @sentry/node 10.66 actually sends (#4154)", () => {
    // Captured from the real SDK with its default Redis integration, see
    // tests/integration/sentry-sampler-default-integrations.test.ts. They carry
    // db.system.name, not db.system, and no messaging.system.
    const origin = "auto.db.redis.diagnostic_channel";
    const spans = [
      { name: "redis-connect", op: "db.redis.connect" },
      { name: "redis-bzpopmin", op: "db.redis" },
      { name: "redis-eval", op: "db.redis" },
    ];
    for (const { name, op } of spans) {
      const attributes = {
        "sentry.origin": origin,
        "sentry.op": op,
        "db.system.name": "redis",
        "server.address": "localhost",
        "server.port": 6379,
      };
      expect(sampler({ name, attributes })).toBe(0);
    }
  });

  it("zeroes a Redis span on db.system.name alone, even under a sampled parent", () => {
    // Without the branch the span would follow its parent's decision (1).
    expect(
      sampler({
        name: "redis-bzpopmin",
        attributes: { "db.system.name": "redis" },
        inheritOrSampleWith: () => 1,
      }),
    ).toBe(0);
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

  it("samples an inbound request carrying the http.method key the SDK sends", () => {
    // Attributes an incoming Fastify request carries at sampling time on
    // @sentry/node 10.66 (captured from the real SDK, #1897). The sampler used to
    // look only for http.request.method, so these fell through to a 0 rate.
    const realServerSpan = {
      "sentry.op": "http.server",
      "sentry.origin": "auto.http.otel.http",
      "http.url": "http://127.0.0.1:51714/api/auth/login?token=qtok-5d1e8b",
      "http.method": "POST",
      "http.target": "/api/auth/login?token=qtok-5d1e8b",
      "http.host": "127.0.0.1:51714",
      "http.client_ip": "203.0.113.7",
      "http.scheme": "http",
      "http.flavor": "1.1",
    };
    expect(sampler({ name: "POST /api/auth/login", attributes: realServerSpan })).toBe(0.05);
  });

  it("does not sample an outgoing client call that also carries http.method", () => {
    expect(
      sampler({
        name: "POST hooks.slack.com",
        attributes: { "sentry.op": "http.client", "http.method": "POST" },
      }),
    ).toBe(0);
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
