import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../apps/landing/public/_worker.js";

/**
 * The landing site's Cloudflare Pages worker. `_worker.js` is a dependency-free
 * ES module (Pages advanced mode forbids imports), so it can be exercised
 * directly with a stubbed global fetch and a fake ASSETS binding.
 */

const ENV = { ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } };

const DEMO = "https://demo.snapotter.com/";
const DOCS = "https://docs.snapotter.com/";

type ProbeCall = { url: string; init: RequestInit | undefined };

/**
 * Stub global fetch with a per-URL responder, returning the call log. The log
 * records the init argument alongside the URL so tests can assert on how a
 * probe was issued, not only where it was sent.
 */
function stubProbes(responder: (url: string) => Promise<Response>): ProbeCall[] {
  const calls: ProbeCall[] = [];
  vi.stubGlobal("fetch", async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    return responder(url);
  });
  return calls;
}

async function getStatus() {
  const res = await worker.fetch(new Request("https://snapotter.com/api/status"), ENV);
  return { res, body: (await res.json()) as { status: string } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  // `unstubAllGlobals` does not undo a `spyOn`, so restore separately.
  vi.restoreAllMocks();
});

describe("landing worker /api/status", () => {
  it("reports operational when both probed legs answer", async () => {
    stubProbes(async () => new Response(null, { status: 200 }));
    const { body } = await getStatus();
    expect(body.status).toBe("operational");
  });

  // Named for what it pins. The stub ignores `redirect: "manual"`, so this
  // cannot observe whether redirects are followed, only that a 301 reads as up.
  it("counts a 301 as up", async () => {
    stubProbes(async () => new Response(null, { status: 301 }));
    const { body } = await getStatus();
    expect(body.status).toBe("operational");
  });

  // Pins the up/down boundary at 400, not 500. A 404 on a sibling property is a
  // realistic bad-deploy signature, so it has to read as down rather than up.
  it("counts a 404 as down, not just 5xx", async () => {
    stubProbes(async (url) =>
      url === DEMO ? new Response(null, { status: 404 }) : new Response(null, { status: 200 }),
    );
    const { body } = await getStatus();
    expect(body.status).toBe("partial");
  });

  it("reports partial when exactly one leg is down", async () => {
    stubProbes(async (url) =>
      url === DEMO ? new Response(null, { status: 503 }) : new Response(null, { status: 200 }),
    );
    const { body } = await getStatus();
    expect(body.status).toBe("partial");
  });

  it("reports down when both probed legs are down", async () => {
    stubProbes(async () => new Response(null, { status: 503 }));
    const { res, body } = await getStatus();
    expect(body.status).toBe("down");
    // The badge reads the verdict from the body, so the transport stays 200
    // even when everything probed is down. Answering 503 here would break it.
    expect(res.status).toBe(200);
  });

  it("treats a thrown request (timeout, DNS) as down", async () => {
    stubProbes(async () => {
      throw new Error("timed out");
    });
    const { body } = await getStatus();
    expect(body.status).toBe("down");
  });

  it("retries a failed leg once before declaring it down", async () => {
    let demoAttempts = 0;
    const calls = stubProbes(async (url) => {
      if (url !== DEMO) return new Response(null, { status: 200 });
      demoAttempts += 1;
      if (demoAttempts === 1) throw new Error("transient blip");
      return new Response(null, { status: 200 });
    });
    const { body } = await getStatus();
    expect(body.status).toBe("operational");
    expect(calls.filter((c) => c.url === DEMO)).toHaveLength(2);
  });

  it("gives up after the single retry", async () => {
    const calls = stubProbes(async () => new Response(null, { status: 500 }));
    await getStatus();
    expect(calls.filter((c) => c.url === DOCS)).toHaveLength(2);
  });

  it("sets the caching and noindex headers on its own response", async () => {
    stubProbes(async () => new Response(null, { status: 200 }));
    const { res } = await getStatus();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  // A false green is cheap to sit on; a false red would pin in the browser
  // across every navigation for the full minute. Bad verdicts recheck sooner.
  it.each([
    { verdict: "partial", demo: 503, docs: 200 },
    { verdict: "down", demo: 503, docs: 503 },
  ])("caches a $verdict verdict for 15 seconds, not 60", async ({ verdict, demo, docs }) => {
    stubProbes(async (url) =>
      url === DEMO ? new Response(null, { status: demo }) : new Response(null, { status: docs }),
    );
    const { res, body } = await getStatus();
    expect(body.status).toBe(verdict);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=15");
  });

  // Without a bound signal a hung leg would stall the whole route, and the
  // footer request behind it, for as long as the edge allows. Asserting merely
  // that some signal arrived is not enough: a much longer timeout, or an
  // AbortController signal that never fires, would both slip through. The stub
  // makes the real deadline unobservable, so pin the budget at the constructor.
  it("bounds every probe with a 2 second abort signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const calls = stubProbes(async () => new Response(null, { status: 200 }));
    await getStatus();
    expect(calls).toHaveLength(2);
    for (const { init } of calls) {
      expect(init).toBeDefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(timeoutSpy).toHaveBeenCalledWith(2000);
    expect(timeoutSpy).toHaveBeenCalledTimes(2);
  });

  // The test above cannot catch a signal hoisted above the retry loop, because
  // both legs succeed on attempt 1 and the counts match either way. Force all
  // four attempts: a hoisted signal would build 2 signals for 4 fetches and
  // hand attempt 2 an already-fired one, deleting the retry.
  it("gives each attempt its own deadline, not the first attempt's leftovers", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const calls = stubProbes(async () => new Response(null, { status: 500 }));
    await getStatus();
    expect(calls).toHaveLength(4);
    expect(timeoutSpy).toHaveBeenCalledTimes(4);
    expect(new Set(calls.map((c) => c.init?.signal)).size).toBe(4);
  });

  it("probes only the two sibling properties, never snapotter.com itself", async () => {
    const calls = stubProbes(async () => new Response(null, { status: 200 }));
    await getStatus();
    expect(new Set(calls.map((c) => c.url))).toEqual(new Set([DEMO, DOCS]));
  });
});

describe("landing worker existing behavior", () => {
  it("still redirects www to the apex", async () => {
    const res = await worker.fetch(new Request("https://www.snapotter.com/faq"), ENV);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://snapotter.com/faq");
  });

  it("still serves assets for every other path", async () => {
    const res = await worker.fetch(new Request("https://snapotter.com/faq"), ENV);
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("asset");
  });
});
