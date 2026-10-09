/**
 * Watches every way the REAL posthog-js can send (fetch, XMLHttpRequest,
 * navigator.sendBeacon) for the analytics opt-out egress tests (#2216).
 *
 * posthog-js is a singleton that vi.resetModules() doesn't replace, so a
 * second scenario in the same file would reuse the first one's config and
 * prove nothing. Each scenario lives in its own test file (vitest isolates
 * files) and calls these helpers once.
 */
import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

export const ON = {
  enabled: true,
  posthogApiKey: "phc_test_key",
  posthogHost: "https://ph.test",
  posthogProxyPath: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1,
  instanceId: "inst",
};
export const OFF = { ...ON, enabled: false };

/** Every request posthog-js made, with the transport and decoded body. */
export const sent: Array<{ via: string; url: string; body: string }> = [];

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

export function installTransportSpies(): void {
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
}

/** Requests to an endpoint path, e.g. "/e" (events) or "/flags". */
export function requestsTo(path: string) {
  return sent.filter((r) => new URL(r.url).pathname.replace(/\/$/, "") === path);
}

/** Longer than posthog-js's 3 s batch flush interval. */
export const pastFlush = () => new Promise((r) => setTimeout(r, 3500));

/** The page going away, which flushes posthog-js's queues by sendBeacon. */
export function leavePage(): void {
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("unload"));
}
