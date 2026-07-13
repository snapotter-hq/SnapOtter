/**
 * Sentry beforeSend for the API: allowlist-first scrubbing plus a per-process
 * event ceiling. Kept pure (factory + injected gate) so it is unit-testable
 * without initializing the SDK. See the telemetry overhaul spec for the rules.
 */
import { rebuildErrorValue } from "@snapotter/shared";

// Per-process runaway guard, not a quota lever: under the sponsored plan we want
// real errors, but a single instance stuck in an error loop must not spam. Sentry
// de-dupes by fingerprint server-side, so 500 distinct events/hour is ample.
const CEILING_PER_HOUR = 500;
const HOUR_MS = 3600_000;

const TAG_ALLOWLIST = new Set([
  "source",
  "tool_id",
  "pool",
  "route",
  "method",
  "error_class",
  "error_code",
  "deploy_mode",
  "subsystem",
  "status_code",
]);

const URL_RE = /https?:\/\/[^\s"')]+/g;
const BLOB_RE = /blob:[^\s"')]+/g;
// Absolute paths under roots that can hold user files (uploads live in /data,
// /tmp) or dev machines (/Users, /home). Over-redaction of a benign path is fine.
const PATH_RE = /(?:\/(?:Users|home|root|data|tmp|var|app|opt|mnt|srv)|[A-Za-z]:\\)[^\s"')]*/g;

/** Redact urls, blob refs, and absolute paths from free text (breadcrumb messages). */
function scrubText(s: string): string {
  return s.replace(BLOB_RE, "<blob>").replace(URL_RE, "<url>").replace(PATH_RE, "<path>");
}

// Sentry event/hint are typed loosely on purpose: this module must not import
// @sentry/node (instrument.ts loads the SDK lazily and passes events through).
type AnyEvent = Record<string, unknown>;
type AnyHint = { originalException?: unknown };

/** Narrow to a plain mutable object, or null for anything else (fail-closed). */
function asObj(value: unknown): AnyEvent | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyEvent)
    : null;
}

// Keep the breadcrumb trail (the sequence of operations before the error) but
// strip content that can carry user data: redact urls/paths from the message and
// drop the structured `data` payload (http urls, query params) entirely.
function scrubBreadcrumb(entry: unknown): AnyEvent | null {
  const b = asObj(entry);
  if (!b) return null;
  const out: AnyEvent = {};
  for (const k of ["type", "category", "level", "timestamp"]) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  if (typeof b.message === "string") out.message = scrubText(b.message);
  return out;
}

/** Sanitize the breadcrumb list, tolerating both the array and {values} shapes. */
function scrubBreadcrumbs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubBreadcrumb).filter(Boolean);
  const wrapped = asObj(value);
  if (Array.isArray(wrapped?.values)) {
    return { values: wrapped.values.map(scrubBreadcrumb).filter(Boolean) };
  }
  return undefined;
}

export function buildBeforeSend(isActive: () => boolean) {
  let windowStart = 0;
  let sentInWindow = 0;

  return function beforeSend(event: AnyEvent, hint: AnyHint): AnyEvent | null {
    if (!isActive()) return null;

    const now = Date.now();
    if (now - windowStart > HOUR_MS) {
      windowStart = now;
      sentInWindow = 0;
    }
    if (++sentInWindow > CEILING_PER_HOUR) return null;

    // Dropped: these surfaces can carry user data or PII.
    event.message = undefined;
    event.logentry = undefined;
    event.server_name = undefined;
    event.request = undefined;
    event.extra = undefined;
    event.user = undefined;
    // Kept, sanitized: the operation trail leading up to the error.
    event.breadcrumbs = scrubBreadcrumbs(event.breadcrumbs);

    const ctx = asObj(event.contexts);
    const keep: AnyEvent = {};
    const os = asObj(ctx?.os);
    if (os?.name) keep.os = { name: os.name, version: os.version };
    const runtime = asObj(ctx?.runtime);
    if (runtime?.name) keep.runtime = { name: runtime.name, version: runtime.version };
    event.contexts = Object.keys(keep).length ? keep : undefined;

    const tags = asObj(event.tags);
    if (tags) {
      for (const key of Object.keys(tags)) {
        if (!TAG_ALLOWLIST.has(key)) delete tags[key];
      }
    }

    const rebuilt = rebuildErrorValue(hint?.originalException);
    const values = asObj(event.exception)?.values;
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        const ex = asObj(values[i]);
        if (!ex) continue;
        // The last entry is the original error; linked/outer wrappers get type-only.
        ex.value = i === values.length - 1 && rebuilt ? rebuilt : ex.type;
        const frames = asObj(ex.stacktrace)?.frames;
        if (Array.isArray(frames)) {
          for (const entry of frames) {
            const frame = asObj(entry);
            if (!frame) continue;
            // Keep filename + abs_path (open-source code paths, not user data);
            // drop only vars, which can hold user file contents or secrets.
            frame.vars = undefined;
          }
        }
      }
    }
    return event;
  };
}
