/**
 * Sentry beforeSend for the API: allowlist-first scrubbing plus a per-process
 * event ceiling. Kept pure (factory + injected gate) so it is unit-testable
 * without initializing the SDK. See the telemetry overhaul spec for the rules.
 */
import { rebuildErrorValue, redactMessage } from "@snapotter/shared";

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
  "input_format",
  "job_id",
  "instance_id",
]);

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
  if (typeof b.message === "string") out.message = redactMessage(b.message);
  // For http breadcrumbs keep the non-PII status_code + method (the url is the
  // sensitive part, dropped with the rest of `data`): they answer "what request
  // failed right before the error".
  if (b.category === "http") {
    const data = asObj(b.data);
    const safe: AnyEvent = {};
    if (data?.status_code !== undefined) safe.status_code = data.status_code;
    if (typeof data?.method === "string") safe.method = data.method;
    if (Object.keys(safe).length) out.data = safe;
  }
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

// Request headers a diagnostic event may keep: they describe the request's
// shape, never who sent it. Everything else goes, Authorization, Cookie, and
// the forwarding headers that carry client IPs included (#1880).
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "content-length",
  "content-type",
  "user-agent",
]);

/** A url or path with its query string and fragment cut off (tokens live there). */
function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? "";
}

/**
 * The parts of `event.request` a diagnostic event keeps: method, url without
 * its query, and allowlisted headers. Never the body, cookies, query string,
 * or env, whatever the SDK attached (#1880).
 */
function scrubRequest(value: unknown): AnyEvent | undefined {
  const request = asObj(value);
  if (!request) return undefined;
  const out: AnyEvent = {};
  if (typeof request.method === "string") out.method = request.method;
  if (typeof request.url === "string") out.url = stripQuery(request.url);
  const headers = asObj(request.headers);
  if (headers) {
    const safe: AnyEvent = {};
    for (const [name, v] of Object.entries(headers)) {
      if (typeof v === "string" && SAFE_REQUEST_HEADERS.has(name.toLowerCase())) safe[name] = v;
    }
    if (Object.keys(safe).length) out.headers = safe;
  }
  return Object.keys(out).length ? out : undefined;
}

// Span and breadcrumb data keys whose value is a url or path that can carry a
// query string, and the keys that hold only a query string or fragment. The
// Referer can be a page url with a token still in it (/login?mfaToken=...).
const URL_DATA_KEYS = new Set([
  "url",
  "url.full",
  "url.path",
  "http.url",
  "http.target",
  "http.request.header.referer",
]);
const QUERY_DATA_KEY = /(^|\.)(query|fragment)$/;
// Headers the SDK may flatten into span attributes; already "[Filtered]" with
// sendDefaultPii off, dropped here so no SDK default change can put them back.
const SECRET_HEADER_DATA_KEY =
  /^http\.(request|response)\.header\.(authorization|proxy_authorization|cookie|set_cookie|x_forwarded_for|x_real_ip|forwarded|cf_connecting_ip|true_client_ip)/;
// The http server span records the caller's address under these, whatever
// sendDefaultPii says (http.client_ip is the first X-Forwarded-For hop).
const CLIENT_IP_DATA_KEYS = new Set([
  "http.client_ip",
  "net.peer.ip",
  "net.host.ip",
  "client.address",
  "network.peer.address",
  "network.local.address",
  "user.ip_address",
]);

/**
 * A copy of span or breadcrumb `data` without query strings, fragments,
 * request bodies, credential headers, or client IPs. Everything else is left
 * as is.
 */
function scrubUrlData(value: unknown): unknown {
  const data = asObj(value);
  if (!data) return value;
  const out: AnyEvent = {};
  for (const [key, v] of Object.entries(data)) {
    if (QUERY_DATA_KEY.test(key) || SECRET_HEADER_DATA_KEY.test(key)) continue;
    if (CLIENT_IP_DATA_KEYS.has(key)) continue;
    if (key === "http.request.body.data" || key === "http.response.body.data") continue;
    out[key] = URL_DATA_KEYS.has(key) && typeof v === "string" ? stripQuery(v) : v;
  }
  return out;
}

/** True for an http span op ("http.server", "http.client", ...). */
function isHttpOp(op: unknown): boolean {
  return typeof op === "string" && op.startsWith("http");
}

/** Diagnostic breadcrumbs keep their data, minus query strings and secrets. */
function scrubDiagnosticBreadcrumbs(value: unknown): unknown {
  const scrub = (entry: unknown) => {
    const b = asObj(entry);
    if (!b) return entry;
    return b.data === undefined ? b : { ...b, data: scrubUrlData(b.data) };
  };
  if (Array.isArray(value)) return value.map(scrub);
  const wrapped = asObj(value);
  if (Array.isArray(wrapped?.values)) return { ...wrapped, values: wrapped.values.map(scrub) };
  return value;
}

/**
 * A non-PII type name for grouping a stackless throw. Tolerates non-Error
 * thrown values (a rejected string or plain object), which is exactly the case
 * that reaches Sentry frameless.
 */
function errorName(err: unknown): string {
  if (err instanceof Error) return err.name || "Error";
  if (err === null) return "null";
  if (typeof err === "object") {
    const n = (err as { name?: unknown }).name;
    return typeof n === "string" && n ? n : "Object";
  }
  return typeof err;
}

/** The error `code` as a short safe string (e.g. ERR_FS_FILE_TOO_LARGE), or "-". */
function errorCode(err: unknown): string {
  const c = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return typeof c === "string" || typeof c === "number" ? String(c) : "-";
}

/**
 * FNV-1a 32-bit hex of the error's message (or a structural stand-in for a
 * non-Error). One-way: it separates distinct crashes for grouping without ever
 * putting the message (which can carry paths or PII) into the fingerprint.
 */
function errorDigest(err: unknown): string {
  let s = "";
  try {
    if (err instanceof Error) s = err.message || "";
    else if (typeof err === "string") s = err;
    else if (err && typeof err === "object") {
      const m = (err as { message?: unknown }).message;
      s =
        typeof m === "string"
          ? m
          : Object.keys(err as object)
              .sort()
              .join(",");
    } else s = String(err);
  } catch {
    s = "";
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Run a scrub and drop the event if it throws. When a beforeSend hook throws,
 * the SDK discards the event and reports the throw as a new internal event
 * that skips beforeSend entirely, request headers and all. Dropping is the
 * only safe answer.
 */
function failClosed<A extends unknown[]>(
  scrub: (event: AnyEvent, ...rest: A) => AnyEvent | null,
): (event: AnyEvent, ...rest: A) => AnyEvent | null {
  return (event, ...rest) => {
    try {
      return scrub(event, ...rest);
    } catch {
      return null;
    }
  };
}

export function buildBeforeSend(isActive: () => boolean, diagnostic = false) {
  let windowStart = 0;
  let sentInWindow = 0;

  return failClosed(function beforeSend(event: AnyEvent, hint: AnyHint): AnyEvent | null {
    if (!isActive()) return null;

    const now = Date.now();
    if (now - windowStart > HOUR_MS) {
      windowStart = now;
      sentInWindow = 0;
    }
    if (++sentInWindow > CEILING_PER_HOUR) return null;

    if (diagnostic) {
      // A consenting instance: keep the raw message and breadcrumb data, and
      // the request's method, path, and harmless headers. Still drop identity,
      // and anything that carries credentials or content: request bodies,
      // cookies, auth headers, and query strings never leave (#1880). Cap
      // message length via redactMessage raw mode.
      event.user = undefined;
      event.request = scrubRequest(event.request);
      if (event.breadcrumbs !== undefined) {
        event.breadcrumbs = scrubDiagnosticBreadcrumbs(event.breadcrumbs);
      }
      const values = asObj(event.exception)?.values;
      if (Array.isArray(values)) {
        for (const entry of values) {
          const ex = asObj(entry);
          if (ex && typeof ex.value === "string") ex.value = redactMessage(ex.value, { raw: true });
        }
      }
      return event;
    }

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
    // The `tool` context is set only by reportError from an already-vetted
    // settings projection; re-enforce primitives-only here as a final boundary.
    const tool = asObj(ctx?.tool);
    if (tool) {
      const safe: AnyEvent = {};
      for (const [k, v] of Object.entries(tool)) {
        if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
        else if (typeof v === "string" && v.length <= 32) safe[k] = v;
      }
      if (Object.keys(safe).length) keep.tool = safe;
    }
    const py = asObj(ctx?.python);
    if (py) {
      const type = typeof py.type === "string" ? py.type.slice(0, 64) : undefined;
      // Frames arrive as flat strings ("file.py:12 func"); reportError flattens
      // them so they survive Sentry's normalizeDepth. Keep strings only.
      const frames = Array.isArray(py.frames)
        ? py.frames
            .filter((f): f is string => typeof f === "string")
            .map((f) => f.slice(0, 200))
            .slice(0, 20)
        : [];
      if (frames.length) keep.python = { type, frames };
    }
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

    // Stackless uncaught errors (a non-Error throw/rejection, or a stripped
    // stack) arrive as a bare "Error" with no frames, so Sentry collapses every
    // distinct one into a single ungroupable issue (NODE-1Y). When there is
    // nothing to group on, derive a stable fingerprint from the ORIGINAL error's
    // safe identity: type name, code, and a one-way hash of the message (never
    // the message itself). Only frameless events, and never override a
    // fingerprint an upstream reporter set deliberately.
    if (Array.isArray(values) && values.length > 0 && !event.fingerprint) {
      const last = asObj(values[values.length - 1]);
      const frames = asObj(last?.stacktrace)?.frames;
      if (last && !(Array.isArray(frames) && frames.length > 0)) {
        const orig = hint?.originalException;
        const name = errorName(orig);
        event.fingerprint = ["uncaught", name, errorCode(orig), errorDigest(orig)];
        if (!asObj(event.tags)) event.tags = {};
        (event.tags as AnyEvent).error_name = name;
      }
    }
    return event;
  });
}

/**
 * Sentry beforeSendTransaction for the API. Transactions never pass through
 * beforeSend and only exist with SENTRY_TRACES_SAMPLE_RATE set. They answer to
 * the same analytics gate as error events, so an opted-out instance sends none
 * (#1898). The request gets the same rule as an error event (dropped, or
 * reduced to method, path, and harmless headers in diagnostic mode),
 * breadcrumbs get the same scrub as on an error event, and every span's data
 * loses query strings, bodies, and credential headers (#1880).
 */
export function buildBeforeSendTransaction(isActive: () => boolean, diagnostic = false) {
  return failClosed(function beforeSendTransaction(event: AnyEvent): AnyEvent | null {
    if (!isActive()) return null;
    event.request = diagnostic ? scrubRequest(event.request) : undefined;
    // A transaction carries the scope's breadcrumbs too.
    if (event.breadcrumbs !== undefined) {
      event.breadcrumbs = diagnostic
        ? scrubDiagnosticBreadcrumbs(event.breadcrumbs)
        : scrubBreadcrumbs(event.breadcrumbs);
    }
    const trace = asObj(asObj(event.contexts)?.trace);
    if (trace && trace.data !== undefined) trace.data = scrubUrlData(trace.data);
    // Only http names are "METHOD url"; a db span's "?" is a placeholder.
    if (typeof event.transaction === "string" && isHttpOp(trace?.op)) {
      event.transaction = stripQuery(event.transaction);
    }
    if (Array.isArray(event.spans)) {
      for (const entry of event.spans) {
        const span = asObj(entry);
        if (!span) continue;
        if (span.data !== undefined) span.data = scrubUrlData(span.data);
        if (typeof span.description === "string" && isHttpOp(span.op)) {
          span.description = stripQuery(span.description);
        }
      }
    }
    return event;
  });
}
