/**
 * With tracing on, Sentry's own Fastify integration also captures a thrown
 * 5xx, so one failure reached Sentry twice: once classified and throttled by
 * reportError, once raw from the integration (#1645).
 */
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  gatePrimed,
  primeAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { resetThrottleForTests } from "../../../apps/api/src/lib/error-report.js";
import { buildSentryIntegrations } from "../../../apps/api/src/lib/sentry-integrations.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";

type Payload = { exception?: { values?: Array<{ mechanism?: { type?: string } }> } };
const events: Payload[] = [];
let app: ReturnType<typeof Fastify>;
let base: string;

beforeAll(async () => {
  process.env.ANALYTICS_BAKED_OVERRIDE = "on";
  process.env.SNAPOTTER_SENTRY_DIAGNOSTIC = "1";
  __setReaderForTests(async () => true);
  await primeAnalyticsGate();
  const active = () => gatePrimed() && analyticsEnabled();
  Sentry.init({
    dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
    integrations: buildSentryIntegrations(Sentry, true, active),
    tracesSampleRate: 1,
    sendClientReports: false,
    transport: () => ({
      send: async (envelope) => {
        for (const [header, payload] of envelope[1] as unknown as Array<
          [{ type: string }, Payload]
        >) {
          if (header.type === "event") events.push(JSON.parse(JSON.stringify(payload)));
        }
        return {} as never;
      },
      flush: async () => true,
    }),
  });
  app = Fastify();
  registerErrorHandler(app);
  app.get("/boom/:status", async (request) => {
    const status = Number((request.params as { status: string }).status);
    throw Object.assign(new Error("storage unavailable"), { statusCode: status });
  });
  base = await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app?.close();
  await Sentry.close(0);
  __resetGateForTests();
  delete process.env.ANALYTICS_BAKED_OVERRIDE;
  delete process.env.SNAPOTTER_SENTRY_DIAGNOSTIC;
});

describe("a thrown 5xx with tracing on (#1645)", () => {
  it.each([500, 503])("reaches Sentry once for a %i", async (status) => {
    resetThrottleForTests();
    events.length = 0;
    const res = await fetch(`${base}/boom/${status}`);
    expect(res.status).toBe(status);
    for (let i = 0; i < 20 && events.length === 0; i++) await Sentry.flush(100);
    // Give a second, late capture the same chance to arrive.
    await Sentry.flush(300);
    const mechanisms = events.flatMap((e) => e.exception?.values?.map((v) => v.mechanism?.type));
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms).not.toContain("auto.function.fastify");
  });
});
