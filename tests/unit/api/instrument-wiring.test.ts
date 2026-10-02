/**
 * instrument.ts hands Sentry.init the #1880 integration list and both scrub
 * hooks. The request-capture harness rebuilds those options by hand, so this
 * is what fails if the wiring itself regresses (an inline integration array
 * back, the beforeSendTransaction line gone, or the transport gate dropped).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn((options: unknown) => ({ name: "Http", options })),
  requestDataIntegration: vi.fn((options: unknown) => ({ name: "RequestData", options })),
  nodeSend: vi.fn(async () => ({ statusCode: 200 })),
  nodeFlush: vi.fn(async () => true),
  makeNodeTransport: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: h.init,
  httpIntegration: h.httpIntegration,
  requestDataIntegration: h.requestDataIntegration,
  makeNodeTransport: h.makeNodeTransport,
}));

type InitOptions = {
  integrations: unknown;
  beforeSend: unknown;
  beforeSendTransaction: unknown;
  tracesSampler?: unknown;
  transport?: (options: unknown) => {
    send(envelope: unknown): PromiseLike<unknown>;
    flush(timeout?: number): PromiseLike<boolean>;
  };
};

async function loadInstrument(env: Record<string, string>): Promise<InitOptions> {
  vi.resetModules();
  h.init.mockClear();
  h.nodeSend.mockClear();
  h.makeNodeTransport.mockReset();
  h.makeNodeTransport.mockImplementation(() => ({ send: h.nodeSend, flush: h.nodeFlush }));
  vi.stubEnv("SNAPOTTER_SENTRY_DSN_OVERRIDE", "https://0123456789abcdef@o1.ingest.sentry.io/1");
  // Either kill switch would skip Sentry.init entirely.
  vi.stubEnv("SNAPOTTER_TELEMETRY", "");
  vi.stubEnv("ANALYTICS_ENABLED", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("../../../apps/api/src/instrument.js");
  expect(h.init).toHaveBeenCalledTimes(1);
  return h.init.mock.calls[0]?.[0] as InitOptions;
}

const OUR_HTTP = { trackIncomingRequestsAsSessions: false, maxIncomingRequestBodySize: "none" };
const OUR_REQUEST_DATA = {
  include: { cookies: false, data: false, query_string: false, ip: false },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("instrument.ts Sentry wiring (#1880)", () => {
  it("passes the no-body integrations and both scrub hooks with tracing off", async () => {
    const options = await loadInstrument({ SENTRY_TRACES_SAMPLE_RATE: "0" });
    expect(options.integrations).toEqual([
      { name: "Http", options: OUR_HTTP },
      { name: "RequestData", options: OUR_REQUEST_DATA },
    ]);
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeSendTransaction).toBeTypeOf("function");
    expect(options.tracesSampler).toBeUndefined();
  });

  it("keeps them, minus Redis, with tracing on", async () => {
    const options = await loadInstrument({ SENTRY_TRACES_SAMPLE_RATE: "0.5" });
    expect(options.integrations).toBeTypeOf("function");
    const resolve = options.integrations as (d: Array<{ name: string }>) => unknown;
    expect(resolve([{ name: "Redis" }, { name: "Postgres" }])).toEqual([
      { name: "Postgres" },
      { name: "Http", options: OUR_HTTP },
      { name: "RequestData", options: OUR_REQUEST_DATA },
    ]);
    expect(options.beforeSendTransaction).toBeTypeOf("function");
    expect(options.tracesSampler).toBeTypeOf("function");
  });

  it("hands both hooks the analytics gate, so an opted-out instance sends neither (#1898)", async () => {
    // NODE_ENV=test lets this force the baked analytics flag on.
    const options = await loadInstrument({
      SENTRY_TRACES_SAMPLE_RATE: "1",
      ANALYTICS_BAKED_OVERRIDE: "on",
    });
    type Hook = (event: Record<string, unknown>, hint?: unknown) => unknown;
    const sendError = () => (options.beforeSend as Hook)({ message: "boom" }, {});
    const sendTransaction = () =>
      (options.beforeSendTransaction as Hook)({
        transaction: "GET /api/v1/settings",
        contexts: { trace: { op: "http.server" } },
      });
    // Same module graph instrument.ts just loaded, so this is the gate it reads.
    const gate = await import("../../../apps/api/src/lib/analytics-gate.js");
    try {
      // Boot window: the setting has never been read.
      expect(sendError()).toBeNull();
      expect(sendTransaction()).toBeNull();

      gate.__setReaderForTests(async () => false);
      await gate.refreshAnalyticsGate();
      expect(sendError()).toBeNull();
      expect(sendTransaction()).toBeNull();

      gate.__setReaderForTests(async () => true);
      await gate.refreshAnalyticsGate();
      expect(sendError()).not.toBeNull();
      expect(sendTransaction()).not.toBeNull();
    } finally {
      gate.__resetGateForTests();
    }
  });

  it("sends every envelope through the node transport behind the analytics gate (#1919)", async () => {
    const options = await loadInstrument({
      SENTRY_TRACES_SAMPLE_RATE: "0",
      ANALYTICS_BAKED_OVERRIDE: "on",
    });
    expect(options.transport).toBeTypeOf("function");
    const transportOptions = { url: "https://o1.ingest.sentry.io/api/1/envelope/" };
    const transport = options.transport?.(transportOptions);
    expect(h.makeNodeTransport).toHaveBeenCalledWith(transportOptions);
    // A session envelope, which neither beforeSend hook ever sees.
    const envelope = [{}, [[{ type: "session" }, {}]]];
    const gate = await import("../../../apps/api/src/lib/analytics-gate.js");
    try {
      // Boot window: the setting has never been read.
      await expect(transport?.send(envelope)).resolves.toEqual({});
      expect(h.nodeSend).not.toHaveBeenCalled();

      gate.__setReaderForTests(async () => false);
      await gate.refreshAnalyticsGate();
      await transport?.send(envelope);
      expect(h.nodeSend).not.toHaveBeenCalled();

      gate.__setReaderForTests(async () => true);
      await gate.refreshAnalyticsGate();
      await expect(transport?.send(envelope)).resolves.toEqual({ statusCode: 200 });
      expect(h.nodeSend).toHaveBeenCalledWith(envelope);
    } finally {
      gate.__resetGateForTests();
    }
  });
});
