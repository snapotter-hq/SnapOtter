import { formatCompact, formatPulls, parseGhcrDownloads } from "@landing/lib/stats";
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

function isGhcrPage(url: string): boolean {
  return new URL(url).hostname === "github.com";
}

// Trimmed from the live package page. The Issues counter really does sit
// directly above the downloads block with the same <h3 title="..."> shape, so
// it belongs in the fixture: a regex that just looks for the nearest title
// attribute silently reports 193 downloads and nothing ever notices.
const GHCR_PAGE_FIXTURE = `
  <div class="lh-condensed d-flex flex-column flex-items-baseline tmp-pr-1">
    <span class="d-block color-fg-muted text-small mb-1">Issues</span>
    <h3 title="193">193</h3>
  </div>
  <div class="container-lg tmp-my-3 d-flex clearfix">
    <div class="lh-condensed d-flex flex-column flex-items-baseline tmp-pr-1">
      <span class="d-block color-fg-muted text-small tmp-mb-1">Total downloads</span>
      <h3 title="176180">176K</h3>
    </div>
  </div>
`;

/** An upstream stub that answers all three fetchers with live-looking data. */
function okResponse(url: string) {
  if (isGhcrPage(url)) {
    return { ok: true, status: 200, text: async () => GHCR_PAGE_FIXTURE };
  }
  if (isDockerHub(url)) {
    return { ok: true, status: 200, json: async () => ({ pull_count: 500_000 }) };
  }
  return { ok: true, status: 200, json: async () => ({ stargazers_count: 4242 }) };
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
    expect(warn).toHaveBeenCalledTimes(3);
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

    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(" ")).toContain("HTTP 503");
  });

  it("warns when the response parses but omits the field it needs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })),
    );

    const stats = await freshStats();
    await stats.getStarCount();
    await stats.getImagePulls();

    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(" ")).toContain("missing");
  });

  it("uses live values and stays quiet when upstream responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => okResponse(url)),
    );

    const stats = await freshStats();
    expect(await stats.getStarCount()).toBe(4242);
    // Both registries live now, so the total is exact: 500,000 + 176,180.
    expect((await stats.getImagePulls()).total).toBe(676_180);
    expect(warn).not.toHaveBeenCalled();
  });

  // Regression guard. Navbar and TrustSignals render on every one of ~800 built
  // pages, so an un-memoized fetch meant ~800 unauthenticated GitHub calls per
  // build. GitHub 403s after 60, so early pages baked in the live count and
  // later ones baked in the fallback: one site, two different star numbers.
  it("fetches once per build no matter how many pages ask", async () => {
    const fetchSpy = vi.fn(async (url: string) => okResponse(url));
    vi.stubGlobal("fetch", fetchSpy);
    const stats = await freshStats();

    // Simulate many pages rendering concurrently, as Astro does.
    const stars = await Promise.all(Array.from({ length: 50 }, () => stats.getStarCount()));
    const pulls = await Promise.all(Array.from({ length: 50 }, () => stats.getImagePulls()));

    expect(new Set(stars)).toEqual(new Set([4242]));
    expect(new Set(pulls.map((p) => p.display)).size).toBe(1);
    // One call each for stars, Docker Hub, and the GHCR page. Not 150.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
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

// ghcr.io has no pull-count API: the REST packages endpoint answers for this
// account (under /users, not /orgs, which is what the old comment got wrong)
// but carries no download field at all. The figure exists only on the package
// page, so it gets parsed out of the markup. It used to be copied in by hand,
// which is how it sat at 122,000 against a real 176,180 and at 36,000 before
// that, understating the headline stat by more than half.
describe("parseGhcrDownloads", () => {
  it("reads the exact total out of the package-page markup", () => {
    expect(parseGhcrDownloads(GHCR_PAGE_FIXTURE)).toBe(176_180);
  });

  it("ignores the other counters on the page", () => {
    // The Issues h3 (193) sits directly above the downloads h3 in the fixture.
    expect(parseGhcrDownloads(GHCR_PAGE_FIXTURE)).not.toBe(193);
  });

  it("gives up when the markup no longer carries the label", () => {
    expect(parseGhcrDownloads('<h3 title="176180">176K</h3>')).toBeUndefined();
  });

  it("gives up when the total is rendered without its title attribute", () => {
    const abbreviated = GHCR_PAGE_FIXTURE.replace(' title="176180"', "");
    // "176K" alone is not worth guessing at; the fallback constant is better.
    expect(parseGhcrDownloads(abbreviated)).toBeUndefined();
  });

  it("returns undefined for an error page rather than throwing", () => {
    expect(parseGhcrDownloads("")).toBeUndefined();
    expect(parseGhcrDownloads("<html><body>Not Found</body></html>")).toBeUndefined();
  });
});

describe("GHCR downloads when the package page changes shape", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // The whole risk of parsing HTML is that GitHub restyles the page and the
  // number quietly vanishes. That must degrade to the constant and say so,
  // never zero out the GHCR half of the headline figure.
  it("falls back to the constant and warns when the label is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        isGhcrPage(url)
          ? { ok: true, status: 200, text: async () => "<html>redesigned</html>" }
          : okResponse(url),
      ),
    );

    const { total } = await (await freshStats()).getImagePulls();

    expect(total).toBeGreaterThan(500_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join(" ")).toContain("GHCR");
  });

  it("keeps the Docker Hub half live when only the GHCR page is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        isGhcrPage(url) ? { ok: false, status: 500, text: async () => "" } : okResponse(url),
      ),
    );

    const { total } = await (await freshStats()).getImagePulls();

    // 500,000 live from Docker Hub, plus whatever the GHCR constant is.
    expect(total).toBeGreaterThan(500_000);
  });
});
