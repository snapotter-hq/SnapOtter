// Shared, build-time stats for the landing page (GitHub stars + image pulls).
// The landing site ships zero client JS, so these are fetched in Astro
// frontmatter at build time and refreshed by a scheduled rebuild. Both
// fetchers degrade to a maintained constant if the upstream API is unreachable
// (or rate-limited), so a build never ships an empty number.

// ghcr.io exposes no pull-count API (`gh api orgs/snapotter-hq/packages/
// container/snapotter` 404s), but the count IS visible on the package page at
// github.com/orgs/snapotter-hq/packages. So this is read off by hand and cannot
// be fetched at build time like the Docker Hub figure below.
//
// OBSERVED 2026-08-18: 122,000. A previous value sat at 36,000 long enough to
// understate the real number by more than half, so re-read the package page
// whenever you touch this file and update the date with it.
const GHCR_ESTIMATE = 122_000;

// Fallbacks for when an upstream fetch fails. These are a safety net, not a
// source of truth: a successful build overwrites them with live values, and the
// scheduled rebuild keeps that fresh. Because formatPulls rounds DOWN and adds
// "+", a stale constant understates rather than overstates, so a degraded build
// is never a false claim, just a quieter one.
//
// REFRESHED 2026-08-18 against the live APIs. They had drifted badly once
// before (104K against a real 232K, understating pulls by ~55%), because a
// failed fetch degraded silently and nothing ever surfaced the gap. `warnStale`
// below now puts it in the build log. Re-check these whenever you touch this
// file.
const STAR_FALLBACK = 2_210; // live 2026-08-18: 2,217
const DOCKER_FALLBACK = 353_000; // live 2026-08-18: 353,906

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
 * Total image pulls = live Docker Hub pull_count + the GHCR estimate.
 * Returns the raw total and a display string. Docker Hub degrades to
 * DOCKER_FALLBACK if the API is unreachable.
 */
export function getImagePulls(): Promise<{ total: number; display: string }> {
  imagePullsPromise ??= fetchImagePulls();
  return imagePullsPromise;
}

async function fetchImagePulls(): Promise<{ total: number; display: string }> {
  let dockerPulls = DOCKER_FALLBACK;
  try {
    const res = await fetch(`https://hub.docker.com/v2/repositories/${DOCKERHUB_REPO}/`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.pull_count === "number" && data.pull_count > 0) {
        dockerPulls = data.pull_count;
      } else {
        warnStale("Docker Hub pulls", "response missing pull_count", DOCKER_FALLBACK);
      }
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
  const total = dockerPulls + GHCR_ESTIMATE;
  return { total, display: formatPulls(total) };
}
