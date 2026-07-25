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

/** Stub global fetch with a per-URL responder, returning the call log. */
function stubProbes(responder: (url: string) => Promise<Response>): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
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
});

describe("landing worker /api/status", () => {
  it("reports operational when both probed legs answer", async () => {
    stubProbes(async () => new Response(null, { status: 200 }));
    const { body } = await getStatus();
    expect(body.status).toBe("operational");
  });

  it("counts a 3xx as up, since redirects are not followed", async () => {
    stubProbes(async () => new Response(null, { status: 301 }));
    const { body } = await getStatus();
    expect(body.status).toBe("operational");
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
    const { body } = await getStatus();
    expect(body.status).toBe("down");
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
    expect(calls.filter((u) => u === DEMO)).toHaveLength(2);
  });

  it("gives up after the single retry", async () => {
    const calls = stubProbes(async () => new Response(null, { status: 500 }));
    await getStatus();
    expect(calls.filter((u) => u === DOCS)).toHaveLength(2);
  });

  it("sets the caching and noindex headers on its own response", async () => {
    stubProbes(async () => new Response(null, { status: 200 }));
    const { res } = await getStatus();
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("probes only the two sibling properties, never snapotter.com itself", async () => {
    const calls = stubProbes(async () => new Response(null, { status: 200 }));
    await getStatus();
    expect(new Set(calls)).toEqual(new Set([DEMO, DOCS]));
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
