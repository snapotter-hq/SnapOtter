// tests/e2e-landing/worker.spec.ts
import { expect, test } from "@playwright/test";
// @ts-expect-error plain ESM asset, no types
import worker from "../../apps/landing/public/_worker.js";

/**
 * `astro preview` serves dist as flat files. It does not run `_worker.js`, so the
 * two behaviours only Cloudflare Pages provides (the /api/status probe and the
 * www to apex redirect) are invisible to every other spec in this directory: the
 * status indicator specs mock /api/status precisely because the real route is
 * absent under the harness.
 *
 * Driving the module directly is the coverage that gap needs. It is the same file
 * the edge loads, with `env.ASSETS` and global fetch stubbed, so a regression in
 * the worker fails here instead of first failing in production.
 */

type Handler = { fetch(request: Request, env: unknown): Promise<Response> };
const handler = worker as Handler;

const ASSET_BODY = "<html>asset</html>";
const env = {
  ASSETS: {
    fetch: async () =>
      new Response(ASSET_BODY, { status: 200, headers: { "Content-Type": "text/html" } }),
  },
};

/** Swap global fetch for the duration of one call so probes are deterministic. */
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const upstream = (status: number) => async () => new Response(null, { status });

test.describe("landing Cloudflare worker", () => {
  test("www redirects to the apex host, preserving the path", async () => {
    const res = await handler.fetch(
      new Request("https://www.snapotter.com/tools/image/resize/"),
      env,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://snapotter.com/tools/image/resize/");
  });

  test("/api/status reports operational when both siblings answer", async () => {
    const res = await withFetch(upstream(200) as unknown as typeof fetch, () =>
      handler.fetch(new Request("https://snapotter.com/api/status"), env),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "operational" });
    // A synthesized Response carries no _headers decoration, so it has to set
    // its own. A verdict that got indexed would be a search result of its own.
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  test("a 3xx from a sibling still counts as up", async () => {
    const res = await withFetch(upstream(302) as unknown as typeof fetch, () =>
      handler.fetch(new Request("https://snapotter.com/api/status"), env),
    );
    expect(await res.json()).toEqual({ status: "operational" });
  });

  test("one sibling down reports partial, both down reports down", async () => {
    const oneDown = (async (url: string | URL | Request) =>
      new Response(null, {
        status: String(url).includes("demo.") ? 503 : 200,
      })) as unknown as typeof fetch;

    const partial = await withFetch(oneDown, () =>
      handler.fetch(new Request("https://snapotter.com/api/status"), env),
    );
    expect(await partial.json()).toEqual({ status: "partial" });

    const both = await withFetch(upstream(503) as unknown as typeof fetch, () =>
      handler.fetch(new Request("https://snapotter.com/api/status"), env),
    );
    expect(await both.json()).toEqual({ status: "down" });
    // A false red pins in the browser across navigations, so it is rechecked sooner.
    expect(both.headers.get("Cache-Control")).toBe("public, max-age=15");
  });

  test("a throwing probe retries once before it reports the leg down", async () => {
    const calls: string[] = [];
    const flaky = (async (url: string | URL | Request) => {
      calls.push(String(url));
      // Fail the first attempt for each host, succeed on the retry.
      if (calls.filter((c) => c === String(url)).length === 1) throw new Error("network");
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const res = await withFetch(flaky, () =>
      handler.fetch(new Request("https://snapotter.com/api/status"), env),
    );
    expect(await res.json()).toEqual({ status: "operational" });
    expect(calls.length).toBe(4); // two hosts, two attempts each
  });

  test("every other path falls through to the static assets", async () => {
    const res = await handler.fetch(new Request("https://snapotter.com/faq/"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ASSET_BODY);
  });
});
