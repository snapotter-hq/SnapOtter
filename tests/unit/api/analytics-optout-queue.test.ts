import http from "node:http";
import type { AddressInfo } from "node:net";
import { PostHog } from "posthog-node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import {
  __getClientForTests,
  discardQueuedTelemetry,
  initAnalytics,
  shutdownAnalytics,
  trackEvent,
} from "../../../apps/api/src/lib/analytics.js";

// The real posthog-node client, created by initAnalytics, sends to a local HTTP
// server. Nothing can leave the machine, and the test covers the production
// wiring from boot to opt-out (#4269).

const bakedConfig = vi.hoisted(() => ({
  enabled: true,
  posthogApiKey: "phc_test_optout",
  posthogHost: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1.0,
}));

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, ANALYTICS_BAKED: bakedConfig };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) },
  pool: {},
  closeDb: async () => {},
  schema: { settings: { key: "key" } },
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let server: http.Server;
let postCount = 0;

const origNodeEnv = process.env.NODE_ENV;
const origOverride = process.env.ANALYTICS_BAKED_OVERRIDE;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    postCount += 1;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"status":1}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  bakedConfig.posthogHost = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await shutdownAnalytics();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.env.NODE_ENV = origNodeEnv;
  if (origOverride === undefined) delete process.env.ANALYTICS_BAKED_OVERRIDE;
  else process.env.ANALYTICS_BAKED_OVERRIDE = origOverride;
});

beforeEach(async () => {
  postCount = 0;
  __resetGateForTests();
  process.env.NODE_ENV = "test";
  process.env.ANALYTICS_BAKED_OVERRIDE = "on";
  await shutdownAnalytics();
});

// The string value matches PostHogPersistedProperty.Queue; the cast bridges the typed getter.
type PersistedKey = Parameters<PostHog["getPersistedProperty"]>[0];

/** The client initAnalytics created; a missing client is a test failure, not a crash. */
function activeClient(): PostHog {
  const client = __getClientForTests();
  if (!client) throw new Error("initAnalytics did not create a client");
  return client;
}

/** Boot the real client, then queue one event the way the boot census does. */
async function bootAndQueueOneEvent(): Promise<void> {
  __setReaderForTests(async () => true);
  await refreshAnalyticsGate();
  await initAnalytics();
  await trackEvent("instance_started", {}, "qa-distinct");
  await vi.waitFor(() => {
    const queued = activeClient().getPersistedProperty("queue" as PersistedKey);
    expect(Array.isArray(queued) ? queued.length : 0).toBe(1);
  });
}

describe("queued telemetry after opt-out (#4269)", () => {
  it("control: a queued event is sent when analytics stays on", async () => {
    await bootAndQueueOneEvent();
    await activeClient().flush();
    expect(postCount).toBeGreaterThan(0);
  });

  it("an event queued before opt-out is not sent after the admin turns analytics off", async () => {
    await bootAndQueueOneEvent();

    __setReaderForTests(async () => false);
    await refreshAnalyticsGate();
    await activeClient().flush();

    expect(postCount).toBe(0);
  });

  it("discardQueuedTelemetry is a no-op when analytics was never started", () => {
    expect(__getClientForTests()).toBeNull();
    expect(() => discardQueuedTelemetry()).not.toThrow();
  });
});
