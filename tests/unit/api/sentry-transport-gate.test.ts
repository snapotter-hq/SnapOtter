/**
 * #1919: the analytics gate at Sentry's transport. Sessions, cron check-ins,
 * and the SDK's internal error events never pass through beforeSend or
 * beforeSendTransaction, so the transport is the only place an opt-out can
 * stop them. The first block checks the gate on its own; the second runs the
 * REAL @sentry/node SDK with instrument.ts's integrations and hooks and records
 * every envelope item type the gated transport lets through.
 */
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  gatePrimed,
  primeAnalyticsGate,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { buildSentryIntegrations } from "../../../apps/api/src/lib/sentry-integrations.js";
import {
  buildBeforeSend,
  buildBeforeSendTransaction,
} from "../../../apps/api/src/lib/sentry-scrub.js";
import { buildGatedTransport } from "../../../apps/api/src/lib/sentry-transport.js";

type Envelope = Parameters<ReturnType<Parameters<typeof buildGatedTransport>[1]>["send"]>[0];
type TransportOptions = Parameters<Parameters<typeof buildGatedTransport>[1]>[0];

const ENVELOPE = [{}, [[{ type: "session" }, {}]]] as unknown as Envelope;
const OPTIONS = { url: "https://o1.ingest.sentry.io/api/1/envelope/" } as TransportOptions;

describe("buildGatedTransport", () => {
  function setup(active: { on: boolean }) {
    const inner = {
      send: vi.fn(async () => ({ statusCode: 200 })),
      flush: vi.fn(async () => true),
    };
    const make = vi.fn(() => inner);
    const transport = buildGatedTransport(() => active.on, make)(OPTIONS);
    return { inner, make, transport };
  }

  it("hands the SDK's transport options to the inner transport unchanged", () => {
    const { make } = setup({ on: true });
    expect(make).toHaveBeenCalledWith(OPTIONS);
  });

  it("sends through the inner transport while the gate is on", async () => {
    const { inner, transport } = setup({ on: true });
    await expect(transport.send(ENVELOPE)).resolves.toEqual({ statusCode: 200 });
    expect(inner.send).toHaveBeenCalledWith(ENVELOPE);
  });

  it("drops every envelope while the gate is off, without touching the inner transport", async () => {
    const { inner, transport } = setup({ on: false });
    await expect(transport.send(ENVELOPE)).resolves.toEqual({});
    expect(inner.send).not.toHaveBeenCalled();
  });

  it("asks the gate on every send, so a mid-run opt-out stops the next envelope", async () => {
    const active = { on: true };
    const { inner, transport } = setup(active);
    await transport.send(ENVELOPE);
    active.on = false;
    await transport.send(ENVELOPE);
    active.on = true;
    await transport.send(ENVELOPE);
    expect(inner.send).toHaveBeenCalledTimes(2);
  });

  it("still flushes the inner transport, gate on or off", async () => {
    const { inner, transport } = setup({ on: false });
    await expect(transport.flush(250)).resolves.toBe(true);
    expect(inner.flush).toHaveBeenCalledWith(250);
  });
});

describe("the real SDK behind the gated transport (#1919)", () => {
  const itemTypes: string[] = [];
  // The same gate instrument.ts passes: primed and the setting on.
  const sentryActive = () => gatePrimed() && analyticsEnabled();

  async function setAnalytics(on: boolean) {
    __setReaderForTests(async () => on);
    await refreshAnalyticsGate();
  }

  // Every send path #1919 lists that skips both hooks.
  async function sendHooklessEnvelopes(): Promise<string[]> {
    await Sentry.flush(100);
    itemTypes.length = 0;
    // An internal SDK error event: _processEvent returns it before either hook.
    Sentry.captureEvent({ message: "integration failed" }, {
      data: { __sentry__: true },
    } as Parameters<typeof Sentry.captureEvent>[1]);
    // A cron check-in, as withMonitor sends one.
    Sentry.captureCheckIn(
      { monitorSlug: "system-session-purge", status: "ok" },
      { schedule: { type: "interval", value: 1, unit: "hour" } },
    );
    // What processSessionIntegration's beforeExit handler does on API stop.
    Sentry.startSession();
    Sentry.endSession();
    await Sentry.flush(500);
    return [...itemTypes];
  }

  beforeAll(async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // NODE_ENV=test lets the gate turn on
    __setReaderForTests(async () => true);
    await primeAnalyticsGate();
    Sentry.init({
      dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
      // Sessions are only sent with a release.
      release: "snapotter@test",
      integrations: buildSentryIntegrations(Sentry, false),
      sendClientReports: false,
      beforeSend: buildBeforeSend(sentryActive) as never,
      beforeSendTransaction: buildBeforeSendTransaction(sentryActive) as never,
      transport: buildGatedTransport(sentryActive, () => ({
        send: async (envelope) => {
          for (const [header] of envelope[1] as unknown as Array<[{ type: string }]>) {
            itemTypes.push(header.type);
          }
          return {};
        },
        flush: async () => true,
      })),
    });
  });

  afterAll(async () => {
    await Sentry.close(0);
    __resetGateForTests();
    delete process.env.ANALYTICS_BAKED_OVERRIDE;
  });

  it("sends the session, check-in, and internal event while analytics is on", async () => {
    // Proves each call below really reaches the transport, so the opted-out
    // case's empty list means the gate dropped them.
    await setAnalytics(true);
    const sent = await sendHooklessEnvelopes();
    expect(sent).toEqual(expect.arrayContaining(["event", "check_in", "session"]));
  });

  it("sends nothing at all once analytics is switched off", async () => {
    await setAnalytics(false);
    try {
      expect(await sendHooklessEnvelopes()).toEqual([]);
    } finally {
      await setAnalytics(true);
    }
  });
});
