import { afterAll, beforeEach, describe, expect, it } from "vitest";

describe("analytics env var validation", () => {
  const originalEnv = { ...process.env };

  // Keys that the Zod schema cares about -- we clear them before each test
  // so defaults kick in unless explicitly set.
  const analyticsKeys = [
    "ANALYTICS_ENABLED",
    "ANALYTICS_SAMPLE_RATE",
    "POSTHOG_API_KEY",
    "POSTHOG_HOST",
    "SENTRY_DSN",
  ];

  beforeEach(() => {
    for (const key of analyticsKeys) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // ── ANALYTICS_ENABLED ───────────────────────────────────────────────────

  it("ANALYTICS_ENABLED defaults to false", async () => {
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.ANALYTICS_ENABLED).toBe(false);
  });

  it("ANALYTICS_ENABLED='false' transforms to boolean false", async () => {
    process.env.ANALYTICS_ENABLED = "false";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().ANALYTICS_ENABLED).toBe(false);
  });

  it("ANALYTICS_ENABLED='true' transforms to boolean true", async () => {
    process.env.ANALYTICS_ENABLED = "true";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().ANALYTICS_ENABLED).toBe(true);
  });

  it("ANALYTICS_ENABLED rejects non-enum values", async () => {
    process.env.ANALYTICS_ENABLED = "yes";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  // ── ANALYTICS_SAMPLE_RATE ──────────────────────────────────────────────

  it("ANALYTICS_SAMPLE_RATE defaults to 1.0", async () => {
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.ANALYTICS_SAMPLE_RATE).toBe(1.0);
  });

  it("ANALYTICS_SAMPLE_RATE=0.5 parses correctly", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "0.5";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().ANALYTICS_SAMPLE_RATE).toBe(0.5);
  });

  it("ANALYTICS_SAMPLE_RATE=0 is valid (no sampling)", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "0";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().ANALYTICS_SAMPLE_RATE).toBe(0);
  });

  it("ANALYTICS_SAMPLE_RATE=1 is valid (full sampling)", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "1";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().ANALYTICS_SAMPLE_RATE).toBe(1);
  });

  it("ANALYTICS_SAMPLE_RATE > 1 fails validation", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "1.5";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("ANALYTICS_SAMPLE_RATE < 0 fails validation", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "-0.1";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("ANALYTICS_SAMPLE_RATE=2 fails validation", async () => {
    process.env.ANALYTICS_SAMPLE_RATE = "2";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  // ── POSTHOG_API_KEY ────────────────────────────────────────────────────

  it("POSTHOG_API_KEY defaults to the baked-in key", async () => {
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.POSTHOG_API_KEY).toBe("phc_CVHjGivwWVzh76M5EjijTwP5LpiqWie3EbCzXU7w2Smy");
  });

  it("POSTHOG_API_KEY can be overridden with a custom value", async () => {
    process.env.POSTHOG_API_KEY = "phc_custom_key_123";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().POSTHOG_API_KEY).toBe("phc_custom_key_123");
  });

  it("POSTHOG_API_KEY can be set to empty string", async () => {
    process.env.POSTHOG_API_KEY = "";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().POSTHOG_API_KEY).toBe("");
  });

  // ── POSTHOG_HOST ───────────────────────────────────────────────────────

  it("POSTHOG_HOST defaults to the PostHog US endpoint", async () => {
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });

  it("POSTHOG_HOST can be overridden", async () => {
    process.env.POSTHOG_HOST = "https://eu.posthog.com";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().POSTHOG_HOST).toBe("https://eu.posthog.com");
  });

  // ── SENTRY_DSN ─────────────────────────────────────────────────────────

  it("SENTRY_DSN defaults to the baked-in DSN", async () => {
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.SENTRY_DSN).toBe(
      "https://2fd53fc3b3fdc59d02cac044a4f90b71@o4511263372738560.ingest.us.sentry.io/4511264620085248",
    );
  });

  it("SENTRY_DSN can be overridden with a custom value", async () => {
    process.env.SENTRY_DSN = "https://custom@sentry.io/999";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().SENTRY_DSN).toBe("https://custom@sentry.io/999");
  });

  it("SENTRY_DSN can be set to empty string to disable", async () => {
    process.env.SENTRY_DSN = "";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().SENTRY_DSN).toBe("");
  });
});
