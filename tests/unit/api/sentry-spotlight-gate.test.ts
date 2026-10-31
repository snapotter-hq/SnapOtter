/**
 * #1966: with SENTRY_SPOTLIGHT set, the SDK's Spotlight integration copies
 * every envelope to the sidecar from the client's beforeEnvelope hook, which
 * fires before the transport, so the #1919 transport gate never sees that
 * copy. This runs the REAL @sentry/node SDK with instrument.ts's integration
 * list against a local sidecar and checks that the opt-out stops the copy too.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  gatePrimed,
  primeAnalyticsGate,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { buildSentryIntegrations } from "../../../apps/api/src/lib/sentry-integrations.js";
import { buildGatedTransport } from "../../../apps/api/src/lib/sentry-transport.js";

describe("Spotlight behind the analytics gate (#1966)", () => {
  const received: string[] = [];
  const sentryActive = () => gatePrimed() && analyticsEnabled();
  let sidecar: http.Server;

  async function setAnalytics(on: boolean) {
    __setReaderForTests(async () => on);
    await refreshAnalyticsGate();
  }

  // A cron check-in: one envelope, no hooks, tagged so the sidecar log says
  // which phase sent it.
  function sendCheckIn(slug: string) {
    Sentry.captureCheckIn({ monitorSlug: slug, status: "ok" });
  }

  async function waitForSidecar(slug: string) {
    const deadline = Date.now() + 5000;
    while (!received.some((body) => body.includes(slug))) {
      if (Date.now() > deadline) throw new Error(`sidecar never received ${slug}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  beforeAll(async () => {
    sidecar = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        received.push(body);
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => sidecar.listen(0, "127.0.0.1", r));
    const { port } = sidecar.address() as AddressInfo;
    // What an operator sets; Sentry.init reads it from the environment.
    process.env.SENTRY_SPOTLIGHT = `http://127.0.0.1:${port}/stream`;
    process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // NODE_ENV=test lets the gate turn on
    __setReaderForTests(async () => true);
    await primeAnalyticsGate();
    Sentry.init({
      dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
      integrations: buildSentryIntegrations(Sentry, false, sentryActive),
      sendClientReports: false,
      transport: buildGatedTransport(sentryActive, () => ({
        send: async () => ({}),
        flush: async () => true,
      })),
    });
  });

  afterAll(async () => {
    await Sentry.close(0);
    __resetGateForTests();
    delete process.env.SENTRY_SPOTLIGHT;
    delete process.env.ANALYTICS_BAKED_OVERRIDE;
    await new Promise((r) => sidecar.close(r));
  });

  it("still copies envelopes to the sidecar while analytics is on", async () => {
    await setAnalytics(true);
    sendCheckIn("spotlight-on");
    await waitForSidecar("spotlight-on");
  });

  it("sends the sidecar nothing once analytics is switched off", async () => {
    await setAnalytics(false);
    sendCheckIn("spotlight-off");
    await Sentry.flush(200);
    // Switch back on and wait for a later envelope, so an opted-out copy that
    // was going to arrive has had every chance to.
    await setAnalytics(true);
    sendCheckIn("spotlight-after");
    await waitForSidecar("spotlight-after");
    await new Promise((r) => setTimeout(r, 100));
    expect(received.filter((body) => body.includes("spotlight-off"))).toEqual([]);
  });
});
