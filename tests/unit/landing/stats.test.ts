import { formatCompact, formatPulls } from "@landing/lib/stats";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getStarCount/getImagePulls memoize per module instance so a build fetches once
// rather than once per page. Tests therefore need a FRESH module each time, or
// the first test's cached result leaks into every later assertion.
async function freshStats() {
  vi.resetModules();
  return import("@landing/lib/stats");
}

// Match the exact host, not a substring. `url.includes("hub.docker.com")` would
// also match hub.docker.com.evil.test, which is the incomplete-URL-sanitization
// pattern CodeQL flags, and it is worth not teaching that shape in test code.
function isDockerHub(url: string): boolean {
  return new URL(url).hostname === "hub.docker.com";
}

describe("formatCompact", () => {
  it("formats thousands with one decimal", () => {
    expect(formatCompact(1720)).toBe("1.7k");
  });

  it("drops a trailing .0 on whole thousands", () => {
    expect(formatCompact(1000)).toBe("1k");
    expect(formatCompact(12_000)).toBe("12k");
  });

  it("leaves sub-thousand counts untouched", () => {
    expect(formatCompact(999)).toBe("999");
  });

  it("formats millions with an M suffix", () => {
    expect(formatCompact(1_000_000)).toBe("1M");
    expect(formatCompact(2_300_000)).toBe("2.3M");
  });
});

describe("formatPulls", () => {
  it("rounds down to the nearest 10K below 1M", () => {
    expect(formatPulls(140_801)).toBe("140K+");
    expect(formatPulls(104_801)).toBe("100K+");
  });

  it("stays conservative just under a 10K boundary", () => {
    expect(formatPulls(99_999)).toBe("90K+");
  });

  it("switches to millions at 1M", () => {
    expect(formatPulls(1_000_000)).toBe("1M+");
    expect(formatPulls(999_999)).toBe("990K+");
  });

  it("rounds millions down to one decimal", () => {
    expect(formatPulls(1_250_000)).toBe("1.2M+");
  });
});

// These fetchers used to swallow every upstream failure without a word, which
// let the hardcoded fallbacks drift ~55% out of date unnoticed. The point of
// these tests is not the constants themselves (they move); it is that a
// degraded build stays conservative AND says so out loud.
describe("stat fetchers when upstream is unavailable", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back and warns when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("simulated outage");
      }),
    );

    const stats = await freshStats();
    const stars = await stats.getStarCount();
    const pulls = await stats.getImagePulls();

    expect(stars).toBeGreaterThan(0);
    expect(pulls.total).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(" ")).toContain("simulated outage");
  });

  it("falls back and warns on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );

    const stats = await freshStats();
    await stats.getStarCount();
    await stats.getImagePulls();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(" ")).toContain("HTTP 503");
  });

  it("warns when the response parses but omits the field it needs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );

    const stats = await freshStats();
    await stats.getStarCount();
    await stats.getImagePulls();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(" ")).toContain("missing");
  });

  it("uses live values and stays quiet when upstream responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        isDockerHub(url)
          ? { ok: true, status: 200, json: async () => ({ pull_count: 500_000 }) }
          : { ok: true, status: 200, json: async () => ({ stargazers_count: 4242 }) },
      ),
    );

    const stats = await freshStats();
    expect(await stats.getStarCount()).toBe(4242);
    // Live Docker Hub count plus the GHCR estimate, so assert the floor, not equality.
    expect((await stats.getImagePulls()).total).toBeGreaterThanOrEqual(500_000);
    expect(warn).not.toHaveBeenCalled();
  });

  // Regression guard. Navbar and TrustSignals render on every one of ~800 built
  // pages, so an un-memoized fetch meant ~800 unauthenticated GitHub calls per
  // build. GitHub 403s after 60, so early pages baked in the live count and
  // later ones baked in the fallback: one site, two different star numbers.
  it("fetches once per build no matter how many pages ask", async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      isDockerHub(url)
        ? { ok: true, status: 200, json: async () => ({ pull_count: 500_000 }) }
        : { ok: true, status: 200, json: async () => ({ stargazers_count: 4242 }) },
    );
    vi.stubGlobal("fetch", fetchSpy);
    const stats = await freshStats();

    // Simulate many pages rendering concurrently, as Astro does.
    const stars = await Promise.all(Array.from({ length: 50 }, () => stats.getStarCount()));
    const pulls = await Promise.all(Array.from({ length: 50 }, () => stats.getImagePulls()));

    expect(new Set(stars)).toEqual(new Set([4242]));
    expect(new Set(pulls.map((p) => p.display)).size).toBe(1);
    // One call for GitHub, one for Docker Hub. Not 100.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps the degraded figure conservative rather than inflated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );

    const { total, display } = await (await freshStats()).getImagePulls();
    // formatPulls rounds down and appends "+", so a stale build understates.
    expect(Number(display.replace(/[^\d.]/g, "")) * 1000).toBeLessThanOrEqual(total);
  });
});
