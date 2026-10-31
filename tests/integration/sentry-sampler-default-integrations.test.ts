/**
 * #4154: the incident configuration. With the SDK's default integrations (the
 * Redis one included) every Redis command, BullMQ's blocking poll among them,
 * becomes a standalone root span. This records what the real SDK sends for
 * those spans and checks the production sampler zeroes every one, so the
 * hand-written attributes in sentry-tracing.test.ts cannot drift from reality
 * unnoticed (#1897).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  driveBackgroundWork,
  type SeenSpan,
  startSamplerProbe,
  stopSamplerProbe,
} from "../helpers/sentry-sampler-probe.js";

const seen: SeenSpan[] = startSamplerProbe((defaults) => defaults);

afterAll(stopSamplerProbe);

describe("buildTracesSampler against default SDK integrations (#4154)", () => {
  it("zeroes every standalone Redis and BullMQ poll root span the SDK creates", async () => {
    await driveBackgroundWork();

    const poll = seen.find((span) => span.name === "redis-bzpopmin");
    expect(poll, "the BullMQ blocking poll should reach the sampler").toBeDefined();
    // What the SDK sends today: the op prefix and the new semantic-convention
    // key, with neither the legacy db.system nor a messaging.system.
    expect(poll?.attributes["sentry.op"]).toBe("db.redis");
    expect(poll?.attributes["db.system.name"]).toBe("redis");
    expect(poll?.attributes["db.system"]).toBeUndefined();
    expect(poll?.attributes["messaging.system"]).toBeUndefined();

    const sampled = seen.filter((span) => span.rate !== 0).map((span) => span.name);
    expect(sampled).toEqual([]);
  });
});
