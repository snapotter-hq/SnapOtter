/**
 * instrument.ts hands Sentry.init the #1880 integration list and both scrub
 * hooks. The request-capture harness rebuilds those options by hand, so this
 * is what fails if the wiring itself regresses (an inline integration array
 * back, or the beforeSendTransaction line gone).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn((options: unknown) => ({ name: "Http", options })),
  requestDataIntegration: vi.fn((options: unknown) => ({ name: "RequestData", options })),
}));

vi.mock("@sentry/node", () => ({
  init: h.init,
  httpIntegration: h.httpIntegration,
  requestDataIntegration: h.requestDataIntegration,
}));

type InitOptions = {
  integrations: unknown;
  beforeSend: unknown;
  beforeSendTransaction: unknown;
  tracesSampler?: unknown;
};

async function loadInstrument(env: Record<string, string>): Promise<InitOptions> {
  vi.resetModules();
  h.init.mockClear();
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
});
