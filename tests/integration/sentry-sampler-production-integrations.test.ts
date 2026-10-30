/**
 * #4154: the production integration list (Redis dropped, tracing on) against
 * real Postgres, Redis, and an idle BullMQ worker. A pg query outside a
 * request has no parent span, and the SDK's pg instrumentation only records
 * under one, so none of this work may reach the sampler with a positive rate.
 */
import * as Sentry from "@sentry/node";
import { afterAll, describe, expect, it } from "vitest";
import { buildSentryIntegrations } from "../../apps/api/src/lib/sentry-integrations.js";
import {
  driveBackgroundWork,
  type SeenSpan,
  startSamplerProbe,
  stopSamplerProbe,
} from "../helpers/sentry-sampler-probe.js";

const seen: SeenSpan[] = startSamplerProbe(buildSentryIntegrations(Sentry, true, () => true));

afterAll(stopSamplerProbe);

describe("buildTracesSampler against the production integration list (#4154)", () => {
  it("never samples background db, Redis, or queue work", async () => {
    await driveBackgroundWork();

    expect(seen.filter((span) => span.rate !== 0).map((span) => span.name)).toEqual([]);
    // The list drops the default Redis integration, so no Redis span exists.
    expect(seen.filter((span) => span.name.startsWith("redis-"))).toEqual([]);
  });
});
