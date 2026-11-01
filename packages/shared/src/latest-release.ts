/**
 * The newest published release, as announced to running instances.
 *
 * The announcement is the payload of the PostHog feature flag
 * `LATEST_RELEASE_FLAG`, read by the API through the posthog-node client it
 * already has. PostHog is one of the two permitted phone-home destinations, so
 * this adds no new egress, and an instance with analytics off never asks.
 */
export const LATEST_RELEASE_FLAG = "latest-release";

export interface LatestRelease {
  version: string;
  url: string;
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Where a "What's new" link may point. The payload is remote input, so a
// compromised or mistyped flag must not be able to send admins anywhere else.
const RELEASE_URL_PREFIXES = [
  "https://github.com/snapotter-hq/SnapOtter/releases/",
  "https://snapotter.com/",
  "https://docs.snapotter.com/",
];

function parseVersion(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `candidate` is a strictly later X.Y.Z release than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Validate a flag payload. Anything malformed is ignored rather than shown. */
export function parseLatestRelease(raw: unknown): LatestRelease | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const { version, url } = value as Record<string, unknown>;
  if (typeof version !== "string" || !parseVersion(version)) return null;
  if (typeof url !== "string" || url.length > 300) return null;
  if (!RELEASE_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return null;
  return { version, url };
}
