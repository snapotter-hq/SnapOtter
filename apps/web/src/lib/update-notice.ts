import { isNewerVersion, type LatestRelease, parseLatestRelease } from "@snapotter/shared";
import { apiGet } from "./api";

const DISMISSED_KEY = "snapotter.updateNotice.dismissedVersion";

/** Dismissal is per version: a later release shows the notice again. */
export function isUpdateNoticeDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === version;
  } catch {
    return false;
  }
}

export function dismissUpdateNotice(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // Blocked storage: the notice comes back next load, which is harmless.
  }
}

// One request per page load; the API caches the PostHog answer for hours.
let pending: Promise<LatestRelease | null> | null = null;

/**
 * The release to announce, or null. Re-validates what the API returns and
 * checks it really is newer than `currentVersion`, so a stale or odd answer
 * never shows.
 */
export function fetchNewerRelease(currentVersion: string): Promise<LatestRelease | null> {
  pending ??= apiGet<{ latest: unknown }>("/v1/admin/latest-release")
    .then((data) => parseLatestRelease(data?.latest))
    .catch(() => null);
  return pending.then((release) =>
    release && isNewerVersion(release.version, currentVersion) ? release : null,
  );
}

/** Test seam: forget the per-load request. */
export function resetUpdateNoticeRequest(): void {
  pending = null;
}
