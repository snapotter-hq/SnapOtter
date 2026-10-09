// @vitest-environment jsdom
//
// Runs the REAL posthog-js (no mock) and watches every way it can send:
// fetch, XMLHttpRequest and navigator.sendBeacon. An instance-wide opt-out
// must stop all egress (#423), including events PostHog already queued (#2216).
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  getClient: () => null,
  getIsolationScope: () => ({ clearBreadcrumbs: vi.fn() }),
  getCurrentScope: () => ({ clearBreadcrumbs: vi.fn() }),
  captureException: vi.fn(),
}));

const ON = {
  enabled: true,
  posthogApiKey: "phc_test_key",
  posthogHost: "https://ph.test",
  posthogProxyPath: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1,
  instanceId: "inst",
};

/** Every URL posthog-js tried to reach, with the transport it used. */
const sent: Array<{ via: string; url: string; body: string }> = [];

/** The request body as text: posthog-js gzips event batches. */
function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body instanceof Blob) return "[blob]";
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const bytes =
      body instanceof ArrayBuffer
        ? Buffer.from(body)
        : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    try {
      return gunzipSync(bytes).toString("utf8");
    } catch {
      return bytes.toString("utf8");
    }
  }
  return body == null ? "" : String(body);
}

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      sent.push({ via: "fetch", url: String(url), body: bodyText(init?.body) });
      return new Response("{}", { status: 200 });
    }),
  );
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (
    this: XMLHttpRequest,
    _method: string,
    url: string | URL,
  ) {
    (this as unknown as { __url: string }).__url = String(url);
  });
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    sent.push({
      via: "xhr",
      url: (this as unknown as { __url: string }).__url,
      body: bodyText(body),
    });
  });
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn((url: string, body?: BodyInit | null) => {
      sent.push({ via: "beacon", url, body: bodyText(body) });
      return true;
    }),
  });
});

/** This test's analytics module, opted out afterwards so the next test starts quiet. */
let current: { optOut: () => void } | null = null;

afterEach(() => {
  // posthog-js instances outlive vi.resetModules(); a live one from an earlier
  // test would answer a later test's pagehide with its own $pageleave.
  current?.optOut();
  current = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // jsdom without a storage backend
  }
});

/** Requests that carry events: posthog-js batches them to /e/. */
function eventRequests() {
  return sent.filter((r) => new URL(r.url).pathname.replace(/\/$/, "") === "/e");
}

/** Longer than posthog-js's 3 s batch flush interval. */
const pastFlush = () => new Promise((r) => setTimeout(r, 3500));

async function startedTab() {
  vi.resetModules();
  const mod = await import("../../../apps/web/src/lib/analytics");
  current = mod;
  await mod.applyInstanceAnalytics(ON);
  // Let the start's own events (the initial pageview) go out first.
  await pastFlush();
  sent.length = 0;
  return mod;
}

describe("real posthog-js after an analytics opt-out (#2216)", () => {
  it("sends events an enabled tab tracks (the harness sees the SDK)", async () => {
    const mod = await startedTab();
    mod.track("tool_opened", { tool_id: "resize" });
    await pastFlush();

    expect(eventRequests().length).toBeGreaterThan(0);
  }, 20_000);

  it("holds nothing captured before an opt-out to send after it", async () => {
    const mod = await startedTab();
    mod.track("tool_opened", { tool_id: "resize" });
    // A send already under way (posthog-js gzips the body asynchronously)
    // has left; what matters is nothing held back to go later.
    await new Promise((r) => setTimeout(r, 100));
    await mod.applyInstanceAnalytics({ ...ON, enabled: false });
    // Only what leaves after the opt-out counts.
    sent.length = 0;

    await pastFlush();
    // Leaving the page flushes whatever is queued by sendBeacon.
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("unload"));

    expect(eventRequests()).toEqual([]);
  }, 20_000);

  it("keeps PostHog's own events in even if opting it out throws", async () => {
    const mod = await startedTab();
    const posthogJs = (await import("posthog-js")).default;
    const proto = Object.getPrototypeOf(posthogJs) as { opt_out_capturing: () => void };
    vi.spyOn(proto, "opt_out_capturing").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await mod.applyInstanceAnalytics({ ...ON, enabled: false });
    sent.length = 0;
    // An SPA navigation makes posthog-js capture a $pageview on its own.
    window.history.pushState({}, "", "/image/resize");
    await pastFlush();
    window.dispatchEvent(new Event("pagehide"));

    expect(eventRequests()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("PostHog opt-out failed"),
      expect.anything(),
    );
  }, 20_000);
});
