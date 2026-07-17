// Build-time GitHub star count for the docs navbar. Fetched in Node during the
// VitePress build (never from the browser), so the docs site makes no per-page
// request to api.github.com. Mirrors the landing site's build-time getStarCount
// (apps/landing/src/lib/stats.ts): sends an Authorization header when
// GITHUB_TOKEN is set (CI) to lift the 60 req/hr unauthenticated limit, and
// degrades to a maintained constant if the API is unreachable or rate-limited,
// so a build never ships an empty count.
import { defineLoader } from "vitepress";

const GITHUB_REPO = "snapotter-hq/SnapOtter";

// Fallback used when the upstream fetch fails. Keep roughly current so a
// degraded build still shows a believable figure (matches STAR_FALLBACK in
// apps/landing/src/lib/stats.ts).
const STAR_FALLBACK = 1720;

export interface GitHubStarsData {
  /** Compact star count for display, e.g. "1.7k". */
  display: string;
}

declare const data: GitHubStarsData;

export { data };

/** Compact integer formatting: 1720 -> "1.7k", 2_300_000 -> "2.3M". */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toString();
}

async function fetchStarCount(): Promise<number> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SnapOtter-Docs",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const json = await res.json();
      if (typeof json.stargazers_count === "number") return json.stargazers_count;
    }
  } catch {
    // Network/JSON failure: fall through to the fallback below.
  }
  return STAR_FALLBACK;
}

export default defineLoader({
  async load(): Promise<GitHubStarsData> {
    return { display: formatCompact(await fetchStarCount()) };
  },
});
