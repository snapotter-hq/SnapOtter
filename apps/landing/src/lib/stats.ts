// Shared, build-time stats for the landing page (GitHub stars + image pulls).
// The landing site ships zero client JS, so these are fetched in Astro
// frontmatter at build time and refreshed by a scheduled rebuild. Both
// fetchers degrade to a maintained constant if the upstream API is unreachable
// (or rate-limited), so a build never ships an empty number.

// ghcr.io exposes no public pull-count API, so the GitHub Container Registry
// portion is a manually maintained estimate. Update it as it grows.
const GHCR_ESTIMATE = 36_000;

// Fallbacks used when an upstream fetch fails. Keep roughly current so a
// degraded build still shows a believable figure.
const STAR_FALLBACK = 1720;
const DOCKER_FALLBACK = 104_000;

const GITHUB_REPO = "snapotter-hq/SnapOtter";
const DOCKERHUB_REPO = "snapotter/snapotter";

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
 * GitHub star count, fetched at build time. Sends an Authorization header when
 * GITHUB_TOKEN is set (CI), lifting the unauthenticated 60 req/hr limit that
 * otherwise pins the count to the fallback. Returns STAR_FALLBACK on failure.
 */
export async function getStarCount(): Promise<number> {
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
    }
  } catch {
    // Network/JSON failure: fall through to the fallback below.
  }
  return STAR_FALLBACK;
}

/**
 * Total image pulls = live Docker Hub pull_count + the GHCR estimate.
 * Returns the raw total and a display string. Docker Hub degrades to
 * DOCKER_FALLBACK if the API is unreachable.
 */
export async function getImagePulls(): Promise<{ total: number; display: string }> {
  let dockerPulls = DOCKER_FALLBACK;
  try {
    const res = await fetch(`https://hub.docker.com/v2/repositories/${DOCKERHUB_REPO}/`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.pull_count === "number" && data.pull_count > 0) {
        dockerPulls = data.pull_count;
      }
    }
  } catch {
    // Network/JSON failure: keep the Docker fallback.
  }
  const total = dockerPulls + GHCR_ESTIMATE;
  return { total, display: formatPulls(total) };
}
