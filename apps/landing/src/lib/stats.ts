// Shared, build-time stats for the landing page (GitHub stars + image pulls).
// The landing site has no framework runtime, so these are fetched in Astro
// frontmatter at build time and refreshed by a scheduled rebuild. Both
// fetchers degrade to a maintained constant if the upstream API is unreachable
// (or rate-limited), so a build never ships an empty number.

// ghcr.io exposes no pull-count API. The REST packages endpoint does answer
// for this account (under /users, not the /orgs path an earlier comment here
// blamed for the 404: snapotter-hq is a user), but the response carries no
// download field at all. The total exists only on the package page, so it is
// parsed out of that markup at build time by parseGhcrDownloads below.
//
// This was a hand-copied constant until 2026-09-12, and it drifted every time:
// 36,000 against a real number more than twice that, then 122,000 against
// 176,180. A scheduled rebuild cannot refresh a number no build ever reads.
const GHCR_PACKAGE_URL =
  "https://github.com/users/snapotter-hq/packages/container/package/snapotter";
const GHCR_FALLBACK = 176_000; // live 2026-09-12: 176,180

// Fallbacks for when an upstream fetch fails. These are a safety net, not a
// source of truth: a successful build overwrites them with live values, and the
// scheduled rebuild keeps that fresh. Because formatPulls rounds DOWN and adds
// "+", a stale constant understates rather than overstates, so a degraded build
// is never a false claim, just a quieter one.
//
// REFRESHED 2026-09-12 against the live APIs. They had drifted badly once
// before (104K against a real 232K, understating pulls by ~55%), because a
// failed fetch degraded silently and nothing ever surfaced the gap. `warnStale`
// below now puts it in the build log. Re-check these whenever you touch this
// file.
const STAR_FALLBACK = 2_630; // live 2026-09-12: 2,636
const DOCKER_FALLBACK = 486_000; // live 2026-09-12: 486,567

const GITHUB_REPO = "snapotter-hq/SnapOtter";
const DOCKERHUB_REPO = "snapotter/snapotter";

/**
 * Announce that a build is shipping a hardcoded constant instead of a live
 * figure. The fetches used to swallow every failure, so a rate-limited or down
 * upstream produced a quietly wrong number with nothing in the log to show for
 * it. That is how the fallbacks drifted ~55% out of date unnoticed.
 */
function warnStale(source: string, reason: string, value: number): void {
  console.warn(
    `[stats] ${source} unavailable (${reason}); falling back to the hardcoded ${value.toLocaleString()}. ` +
      "This figure is probably stale; refresh the constant in apps/landing/src/lib/stats.ts.",
  );
}

/** Compact integer formatting: 1720 -> "1.7k", 2_300_000 -> "2.3M". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toString();
}

/**
 * Image-pull formatting, rounded DOWN so the figure stays conservative:
 * nearest 10K below 1M (140_801 -> "140K+"), nearest 0.1M at/above 1M
 * (1_250_000 -> "1.2M+").
 */
export function formatPulls(total: number): string {
  if (total >= 1_000_000) return `${Math.floor(total / 100_000) / 10}M+`;
  return `${Math.floor(total / 10_000) * 10}K+`;
}

/**
 * Pull the exact GHCR download total out of the package page.
 *
 * The page renders the rounded figure as text ("176K") and keeps the real
 * number in the heading's title attribute, so the match is anchored on the
 * "Total downloads" label rather than on the markup around it: the Issues
 * counter directly above uses the identical `<h3 title="...">` shape, and a
 * looser pattern reports the issue count as downloads.
 *
 * Returns undefined rather than a guess when the label, the heading, or the
 * title attribute is missing, which is what a GitHub redesign looks like from
 * here. The caller then falls back to the constant and says so in the log.
 */
export function parseGhcrDownloads(html: string): number | undefined {
  const match = html.match(/Total downloads<\/span>\s*<h3[^>]*\stitle="(\d+)"/);
  if (!match) return undefined;
  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

// Both stats are read from Astro frontmatter, and Navbar/TrustSignals render on
// every page, so an un-memoized fetch fires once PER PAGE: ~800 GitHub calls per
// full build. That blows through the unauthenticated 60 req/hr limit almost
// immediately, and GitHub starts returning 403, so early pages got the live
// count while every later page silently baked in the fallback and the site
// shipped two different star numbers. Caching the promise (not the value) means
// concurrent page renders share one in-flight request per build.
let starCountPromise: Promise<number> | undefined;
let imagePullsPromise: Promise<{ total: number; display: string }> | undefined;

/**
 * GitHub star count, fetched once per build. Sends an Authorization header when
 * GITHUB_TOKEN is set (CI), lifting the unauthenticated 60 req/hr limit that
 * otherwise pins the count to the fallback. Returns STAR_FALLBACK on failure.
 */
export function getStarCount(): Promise<number> {
  starCountPromise ??= fetchStarCount();
  return starCountPromise;
}

async function fetchStarCount(): Promise<number> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SnapOtter-Landing",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.stargazers_count === "number") return data.stargazers_count;
      warnStale("GitHub stars", "response missing stargazers_count", STAR_FALLBACK);
    } else {
      warnStale("GitHub stars", `HTTP ${res.status}`, STAR_FALLBACK);
    }
  } catch (err) {
    warnStale("GitHub stars", err instanceof Error ? err.message : "fetch threw", STAR_FALLBACK);
  }
  return STAR_FALLBACK;
}

/**
 * Total image pulls across both registries, fetched once per build. Each half
 * degrades to its own constant if that upstream is unreachable, so a partial
 * outage costs one registry's freshness rather than the whole figure.
 */
export function getImagePulls(): Promise<{ total: number; display: string }> {
  imagePullsPromise ??= fetchImagePulls();
  return imagePullsPromise;
}

async function fetchImagePulls(): Promise<{ total: number; display: string }> {
  // One registry being down must not cost the other its live number.
  const [dockerPulls, ghcrPulls] = await Promise.all([fetchDockerPulls(), fetchGhcrPulls()]);
  const total = dockerPulls + ghcrPulls;
  return { total, display: formatPulls(total) };
}

async function fetchDockerPulls(): Promise<number> {
  try {
    const res = await fetch(`https://hub.docker.com/v2/repositories/${DOCKERHUB_REPO}/`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.pull_count === "number" && data.pull_count > 0) return data.pull_count;
      warnStale("Docker Hub pulls", "response missing pull_count", DOCKER_FALLBACK);
    } else {
      warnStale("Docker Hub pulls", `HTTP ${res.status}`, DOCKER_FALLBACK);
    }
  } catch (err) {
    warnStale(
      "Docker Hub pulls",
      err instanceof Error ? err.message : "fetch threw",
      DOCKER_FALLBACK,
    );
  }
  return DOCKER_FALLBACK;
}

async function fetchGhcrPulls(): Promise<number> {
  try {
    const res = await fetch(GHCR_PACKAGE_URL, { headers: { "User-Agent": "SnapOtter-Landing" } });
    if (res.ok) {
      const total = parseGhcrDownloads(await res.text());
      if (total !== undefined) return total;
      warnStale("GHCR downloads", "response missing the Total downloads figure", GHCR_FALLBACK);
    } else {
      warnStale("GHCR downloads", `HTTP ${res.status}`, GHCR_FALLBACK);
    }
  } catch (err) {
    warnStale("GHCR downloads", err instanceof Error ? err.message : "fetch threw", GHCR_FALLBACK);
  }
  return GHCR_FALLBACK;
}
