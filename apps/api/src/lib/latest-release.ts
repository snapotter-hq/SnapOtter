import {
  APP_VERSION,
  isNewerVersion,
  LATEST_RELEASE_FLAG,
  type LatestRelease,
  parseLatestRelease,
} from "@snapotter/shared";
import { getFlagPayload } from "./analytics.js";
import { analyticsEnabled } from "./analytics-gate.js";

// Releases come out weeks apart, so one PostHog lookup per instance every few
// hours is plenty. A failed lookup is retried sooner, but not on every page load.
const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;

let cached: { value: LatestRelease | null; expiresAt: number } | null = null;
let inFlight: Promise<LatestRelease | null> | null = null;

async function lookup(): Promise<LatestRelease | null> {
  const raw = await getFlagPayload(LATEST_RELEASE_FLAG);
  const release = parseLatestRelease(raw);
  cached = {
    value: release,
    expiresAt: Date.now() + (raw === null ? FAILURE_TTL_MS : SUCCESS_TTL_MS),
  };
  return release;
}

/**
 * The newest release when it is later than this instance, otherwise null.
 * Analytics off means no lookup at all, and any cached answer is dropped so an
 * opt-out takes effect right away.
 */
export async function getNewerRelease(): Promise<LatestRelease | null> {
  if (!analyticsEnabled()) {
    cached = null;
    return null;
  }
  let release: LatestRelease | null;
  if (cached && cached.expiresAt > Date.now()) {
    release = cached.value;
  } else {
    inFlight ??= lookup().finally(() => {
      inFlight = null;
    });
    release = await inFlight;
  }
  return release && isNewerVersion(release.version, APP_VERSION) ? release : null;
}

/** Test seam: forget the cached answer. */
export function resetLatestReleaseCache(): void {
  cached = null;
  inFlight = null;
}
