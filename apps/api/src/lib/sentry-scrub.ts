/**
 * Sentry beforeSend for the API: allowlist-first scrubbing plus a per-process
 * event ceiling. Kept pure (factory + injected gate) so it is unit-testable
 * without initializing the SDK. See the telemetry overhaul spec for the rules.
 */
import { rebuildErrorValue } from "@snapotter/shared";

const CEILING_PER_HOUR = 20;
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

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
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

    event.message = undefined;
    event.logentry = undefined;
    event.server_name = undefined;
    event.request = undefined;
    event.extra = undefined;
    event.breadcrumbs = undefined;
    event.user = undefined;

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
            if (typeof frame.filename === "string") frame.filename = basename(frame.filename);
            frame.abs_path = undefined;
            frame.vars = undefined;
          }
        }
      }
    }
    return event;
  };
}
