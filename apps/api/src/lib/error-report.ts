/**
 * The single deliberate Sentry capture path for the API.
 *
 * Classes:
 *  - expected: user input / client aborts / cancels. Never sent.
 *  - operational: someone's environment is broken (db down, disk full).
 *    Sent once per signature per hour, level=warning, fingerprinted per class.
 *  - bug: our fault. Sent up to 10 per signature per hour.
 *
 * State is per-process, so a crash-looping instance always reports its first
 * event after each restart. The beforeSend ceiling (sentry-scrub.ts) is the
 * final backstop and also covers SDK-captured uncaught exceptions.
 */
import {
  connectivityClass,
  extractErrorCode,
  isClientAbort,
  isEnvironmentalDbError,
  isSafeMessageError,
  isToolInputError,
} from "@snapotter/shared";
import { analyticsEnabled } from "./analytics-gate.js";

export type ErrorClass = "expected" | "operational" | "bug";

const HOUR_MS = 3600_000;
const LIMITS: Record<Exclude<ErrorClass, "expected">, number> = { operational: 1, bug: 10 };
const OPERATIONAL_CODES = new Set(["ENOSPC", "EACCES", "EROFS", "EMFILE", "ENFILE"]);

export interface ReportContext {
  source: "http" | "worker" | "cron" | "boot";
  toolId?: string;
  pool?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  subsystem?: string;
  /** Safe input format (file extension) for triage; never the filename. */
  inputFormat?: string;
  /** BullMQ job id, so the event cross-references the jobs DB row and logs. */
  jobId?: string;
  /** Tool settings; a vetted (PII-safe) projection is attached for bug events. */
  settings?: unknown;
}

export function classifyError(err: unknown, source?: ReportContext["source"]): ErrorClass {
  if (isToolInputError(err)) return "expected";
  const e = err as { name?: string; message?: string; code?: string } | null;
  // InputValidationError (apps/api/src/modality/contract.ts) is a 400 the user
  // caused with a bad file/args. Tools throw it from processV2 inside the worker
  // (e.g. sprite-sheet), so it is expected wherever it surfaces, not only http.
  if (e?.name === "InputValidationError") return "expected";
  if (e && typeof e.message === "string" && /^(Canceled$|Timed out after )/.test(e.message)) {
    return "expected";
  }
  // The next two shortcuts only make sense at the HTTP boundary (undefined
  // keeps the http-ish default for direct calls). Off the request path a bare
  // ECONNRESET is an upstream socket loss, not a client abort, and a ZodError
  // means schema drift: settings were already validated at the boundary, so a
  // worker-side parse failure is our bug.
  if (source === "http" || source === undefined) {
    if (isClientAbort(err)) return "expected";
    // ZodError = settings validation. Settings are validated at the boundary, so
    // a worker-side ZodError is schema drift (our bug); only expected on http.
    if (e?.name === "ZodError") return "expected";
  }
  // BullMQ raises UnrecoverableError from its own worker run loop when a job
  // loses its lock (a stall), e.g. a heavy upscale under CPU/memory pressure.
  // We never throw it ourselves, so it always means the instance could not keep
  // the job's lock alive: an environmental strain, not a defect in our code.
  // Operational (one warning/hour) instead of bug spam (NODE-27).
  if (e?.name === "UnrecoverableError") return "operational";
  if (isSafeMessageError(err)) return err.kind === "bug" ? "bug" : "operational";
  if (connectivityClass(err)) return "operational";
  if (isEnvironmentalDbError(err)) return "operational";
  if (e?.code && OPERATIONAL_CODES.has(e.code)) return "operational";
  return "bug";
}

const seen = new Map<string, { count: number; windowStart: number }>();

export function shouldReport(
  cls: Exclude<ErrorClass, "expected">,
  signature: string,
  now = Date.now(),
): boolean {
  const key = `${cls}:${signature}`;
  const entry = seen.get(key);
  if (!entry || now - entry.windowStart > HOUR_MS) {
    seen.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= LIMITS[cls];
}

export function resetThrottleForTests(): void {
  seen.clear();
}

export function errorSignature(err: unknown): string {
  const e = err as { name?: string; code?: string; stack?: string } | null;
  const name = e?.name ?? "Unknown";
  const code = e?.code ?? "-";
  let frame = "-";
  if (typeof e?.stack === "string") {
    const line = e.stack.split("\n").find((l) => l.includes("/apps/") || l.includes("/packages/"));
    const m = line?.match(/([^/\\]+\.[cm]?[jt]sx?):(\d+)/);
    if (m) frame = `${m[1]}:${m[2]}`;
  }
  return `${name}:${code}:${frame}`;
}

/**
 * The lowercase file extension as a safe, non-PII tag value, or undefined. The
 * filename itself can carry user data, but a short alphanumeric extension (jpg,
 * png, pdf, mp4) is a safe triage signal for which input format failed.
 */
export function safeFormatTag(filename?: string): string | undefined {
  if (!filename) return undefined;
  const m = filename.match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : undefined;
}

// Setting keys whose values can carry user data (filenames, free text, secrets)
// even when short, and which must never reach the Sentry `tool` context.
const UNSAFE_SETTING_KEY =
  /pass|secret|token|credential|auth|file|name|path|url|email|user|title|text|label|query|prompt|message|caption|content|watermark/i;
const SAFE_ENUM_VALUE = /^[A-Za-z0-9_.-]{1,32}$/;

/**
 * A privacy-safe projection of tool settings for the Sentry `tool` context, so
 * a bug-class event carries the knobs that triggered it (format, quality, mode,
 * ...) without ever including filenames, free text, or secrets. Keeps only
 * numbers, booleans, and short enum-like strings under non-sensitive keys;
 * drops objects, arrays, and long strings entirely. Returns undefined when
 * nothing safe survives.
 */
export function vetSettings(
  settings: unknown,
): Record<string, string | number | boolean> | undefined {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(settings as Record<string, unknown>)) {
    if (UNSAFE_SETTING_KEY.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE_ENUM_VALUE.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Fire-and-forget; never throws, never blocks. */
export async function reportError(err: unknown, ctx: ReportContext): Promise<void> {
  try {
    if (!analyticsEnabled()) return;
    const cls = classifyError(err, ctx.source);
    if (cls === "expected") return;
    if (!shouldReport(cls, errorSignature(err))) return;

    const Sentry = await import("@sentry/node");
    const net = connectivityClass(err);
    Sentry.withScope((scope) => {
      scope.setLevel(cls === "operational" ? "warning" : "error");
      scope.setTag("source", ctx.source);
      scope.setTag("error_class", cls);
      const code = extractErrorCode(err);
      if (code) scope.setTag("error_code", code);
      if (ctx.inputFormat) scope.setTag("input_format", ctx.inputFormat);
      if (ctx.toolId) scope.setTag("tool_id", ctx.toolId);
      if (ctx.pool) scope.setTag("pool", ctx.pool);
      if (ctx.route) scope.setTag("route", ctx.route);
      if (ctx.method) scope.setTag("method", ctx.method);
      if (ctx.statusCode) scope.setTag("status_code", String(ctx.statusCode));
      if (ctx.subsystem) scope.setTag("subsystem", ctx.subsystem);
      if (ctx.jobId) scope.setTag("job_id", ctx.jobId);
      if (net) {
        scope.setFingerprint(["connectivity", net]);
      } else if (cls === "operational") {
        // Collapse an operational class (bad DB creds, full disk, ...) into a
        // single issue keyed on its code, instead of fragmenting into a
        // separate issue per call site/stack frame (the pg-auth flood showed up
        // as 5 issues). bug-class errors keep default per-frame grouping, where
        // distinct frames usually are distinct bugs.
        scope.setFingerprint(["operational", code ?? (err as { name?: string }).name ?? "op"]);
      }
      if (cls === "bug" && ctx.settings !== undefined) {
        // Attach the knobs that triggered a bug (format, quality, mode, ...) so
        // it is reproducible, without leaking filenames, free text, or secrets.
        const vetted = vetSettings(ctx.settings);
        if (vetted) scope.setContext("tool", vetted);
      }
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    });
  } catch {
    // telemetry must never throw
  }
}

/**
 * Set the anonymized instance id as a GLOBAL Sentry tag so every event (errors
 * and SDK-captured uncaught exceptions) carries it. Lets triage tell "one
 * broken install" from "the whole fleet" and cross-references a Sentry event to
 * that instance's PostHog stream (same instance_id). Called once at boot.
 */
export async function setSentryInstanceTag(instanceId: string): Promise<void> {
  try {
    if (!instanceId) return;
    const Sentry = await import("@sentry/node");
    Sentry.getGlobalScope().setTag("instance_id", instanceId);
  } catch {
    // telemetry must never throw
  }
}
