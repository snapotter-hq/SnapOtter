/**
 * Sentry beforeSend for the web app. Same allowlist-first stance as the API
 * scrubber (apps/api/src/lib/sentry-scrub.ts), adapted for browsers: native
 * error messages are usually safe and highly diagnostic, so they pass through
 * with url/path redaction; anything else falls back to type-only. Frame paths
 * keep the host-less pathname so debug-id source maps still resolve.
 */
import { rebuildErrorValue } from "@snapotter/shared";

export const IGNORE_ERRORS: (string | RegExp)[] = [
  /^AbortError/,
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  /^ResizeObserver loop/,
  "The operation was aborted.",
];

export const DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-web-extension:\/\//,
];

const NATIVE_ERRORS = new Set([
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "DOMException",
  "SecurityError",
  "NotSupportedError",
  "QuotaExceededError",
  "AbortError",
]);

const CEILING_PER_HOUR = 20;
const HOUR_MS = 3600_000;

// BLOB_RE must be applied before URL_RE: "blob:http://..." would otherwise
// partially match URL_RE and leave a dangling "blob:" prefix behind.
const URL_RE = /https?:\/\/[^\s"')]+/g;
const BLOB_RE = /blob:[^\s"')]+/g;
const PATH_RE = /(?:\/Users|\/home|[A-Za-z]:\\)[^\s"')]*/g;

/** Redacted native-error message, or null when the name is not allowlisted. */
export function scrubBrowserMessage(name: string, message: string): string | null {
  if (!NATIVE_ERRORS.has(name)) return null;
  return message.replace(BLOB_RE, "<blob>").replace(URL_RE, "<url>").replace(PATH_RE, "<path>");
}

const TAG_ALLOWLIST = new Set(["route", "tool_id", "locale", "error_class"]);

// Sentry event/hint are typed loosely on purpose: this module must not import
// @sentry/react (analytics.ts loads the SDK lazily and passes events through).
type AnyEvent = Record<string, unknown>;
type AnyHint = { originalException?: unknown };

/** Narrow to a plain mutable object, or null for anything else (fail-closed). */
function asObj(value: unknown): AnyEvent | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyEvent)
    : null;
}

export function buildWebBeforeSend(isActive: () => boolean) {
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

    event.message = undefined;
    event.logentry = undefined;
    event.request = undefined;
    event.extra = undefined;
    event.breadcrumbs = undefined;
    event.user = undefined;

    // React's componentStack is component names only; every other context goes.
    const react = asObj(event.contexts)?.react;
    event.contexts = react ? { react } : undefined;

    const tags = asObj(event.tags);
    if (tags) {
      for (const key of Object.keys(tags)) {
        if (!TAG_ALLOWLIST.has(key)) delete tags[key];
      }
    }

    const orig = hint?.originalException;
    let rebuilt = rebuildErrorValue(orig);
    if (rebuilt === null) {
      const err = asObj(orig);
      const name = err?.name;
      const message = err?.message;
      if (typeof name === "string" && typeof message === "string") {
        rebuilt = scrubBrowserMessage(name, message);
      }
    }

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
            if (frame.filename) frame.filename = scrubFramePath(String(frame.filename));
            if (frame.abs_path) frame.abs_path = scrubFramePath(String(frame.abs_path));
            frame.vars = undefined;
          }
        }
      }
    }

    // Keep debug_meta image paths consistent with the scrubbed frames so
    // debug-id source-map matching still resolves, minus the hostname.
    const images = asObj(event.debug_meta)?.images;
    if (Array.isArray(images)) {
      for (const entry of images) {
        const img = asObj(entry);
        if (img?.code_file) img.code_file = scrubFramePath(String(img.code_file));
      }
    }
    return event;
  };
}

// App bundle frames are http(s) URLs: keep the host-less pathname so Sentry can
// match the frame to its uploaded source map, but drop the instance hostname
// (not anonymous). Filesystem-style paths collapse to the basename so a local
// path or username can never leave the browser.
function scrubFramePath(p: string): string {
  const url = p.match(/^https?:\/\/[^/]+(\/[^?#]*)?/i);
  if (url) return url[1] ?? "/";
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}
