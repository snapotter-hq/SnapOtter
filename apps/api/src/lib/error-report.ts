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
import { analyticsEnabled, sentryDiagnostic } from "./analytics-gate.js";
import { isBinarySpawnFailure } from "./binary-overrides.js";

export type ErrorClass = "expected" | "operational" | "bug";

const HOUR_MS = 3600_000;
const LIMITS: Record<Exclude<ErrorClass, "expected">, number> = { operational: 1, bug: 10 };
export const STORAGE_FULL_CODES = new Set(["ENOSPC", "EDQUOT"]);
export const STORAGE_NOT_WRITABLE_CODES = new Set(["EACCES", "EPERM", "EROFS"]);
const OPERATIONAL_CODES = new Set([
  ...STORAGE_FULL_CODES,
  ...STORAGE_NOT_WRITABLE_CODES,
  "EMFILE",
  "ENFILE",
]);

// EPERM from process.kill or signals can be a bug; only count it on fs syscalls.
const FS_SYSCALLS = new Set([
  "open",
  "write",
  "mkdir",
  "rename",
  "unlink",
  "rmdir",
  "copyfile",
  "chmod",
  "fchmod",
  "chown",
  "fchown",
  "lchown",
  "stat",
  "lstat",
  "fstat",
  "statfs",
  "utime",
  "futime",
  "lutime",
  "fsync",
  "fdatasync",
  "opendir",
  "scandir",
  "read",
  "readlink",
  "link",
  "symlink",
  "realpath",
  "mkdtemp",
  "close",
]);

/**
 * True for a node errno that means the host's environment is broken (disk
 * full, permission denied, read-only fs, out of descriptors), which
 * classifyError reports as operational. Wrappers that would otherwise recast
 * an error as a bug check this first, so the errno keeps its class (#1450).
 */
export function isOperationalErrno(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !OPERATIONAL_CODES.has(code)) return false;
  if (code === "EPERM") {
    const syscall = (err as { syscall?: unknown } | null)?.syscall;
    if (typeof syscall !== "string" || !FS_SYSCALLS.has(syscall)) return false;
  }
  return true;
}

export interface ReportContext {
  source: "http" | "worker" | "cron" | "boot" | "ai-install";
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
  /**
   * Time from enqueue to the start of the job's latest attempt (BullMQ
   * processedOn minus timestamp). That is job age, not pure queue wait: it
   * includes earlier attempts and their backoff, and for a flow parent its
   * children's run time. Tagged as a coarse bucket (#1414).
   */
  jobAgeMs?: number;
}

/**
 * A low-cardinality bucket for a job's age, so Sentry can tell an input old
 * enough for the storage sweep from one that went missing right after upload.
 * Values avoid `<`/`>` so they search as plain strings. Undefined for a
 * missing, negative (clock skew), or non-finite age.
 */
export function jobAgeBucket(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 10_000) return "lt_10s";
  if (ms < 3_600_000) return "lt_1h";
  if (ms < 86_400_000) return "lt_24h";
  return "gte_24h";
}

/**
 * The worker wraps non-retryable failures (validation errors, ToolInputError,
 * INPUT_MISSING) in an UnrecoverableError with the real Error on `cause` so
 * BullMQ skips the pool's second attempt (#1176). BullMQ's own lock-loss
 * UnrecoverableError carries no `cause`, so unwrapping only when `cause` is an
 * Error preserves both paths.
 */
function unwrapUnrecoverable(err: unknown): unknown {
  const e = err as { name?: unknown; cause?: unknown } | null;
  return e?.name === "UnrecoverableError" && e.cause instanceof Error ? e.cause : err;
}

function isBullMqStallError(e: { name?: unknown; message?: unknown } | null): boolean {
  return (
    e?.name === "UnrecoverableError" ||
    (typeof e?.message === "string" &&
      /^(Missing lock for job |job (stalled|started) more than allowable limit)/.test(e.message))
  );
}

const REDIS_CLIENT_ERROR_MESSAGE =
  /^(Connection is closed\.?|Command timed out|Stream isn't writeable|Socket timeout\.|Ready check failed:|closing queue$)/i;

/**
 * Tag a plain Error reconstructed by BullMQ's `Job.waitUntilFinished` from a
 * `QueueEvents` `failed:<jobId>` event (`new Error(args.failedReason || args)`).
 *
 * The worker's `failed` listener already receives the original un-stripped
 * error (`SafeError`, `InputValidationError`, `ToolInputError`, or a real bug
 * with its stack and tool context) and passes it to `reportError` with
 * `source: "worker"`. When a route rethrows the `waitForJob` rejection so
 * `error-handler.ts` answers 500 (because `schema.jobs.error` is null or
 * unreadable), the stripped `Error` would otherwise classify as an HTTP `"bug"`
 * (#3791). Direct Redis/client errors (`connectivityClass`, `ReplyError`,
 * coded errnos, codeless ioredis connection/timeout errors) and BullMQ
 * stall/lock-loss errors (`isBullMqStallError`) stay untagged so
 * `error-handler.ts` still reports them.
 */
export function markQueueEventsJobFailure<T>(err: T): T {
  if (!(err instanceof Error) || err.name !== "Error") return markUpstreamError(err);
  if (isSafeMessageError(err) || isToolInputError(err)) return err;
  const e = err as Error & { code?: unknown; statusCode?: unknown; cause?: unknown };
  if (e.code !== undefined || e.statusCode !== undefined || e.cause !== undefined) {
    return markUpstreamError(err);
  }
  if (isBullMqStallError(e) || REDIS_CLIENT_ERROR_MESSAGE.test(err.message)) {
    return err;
  }
  Object.defineProperty(err, "isQueueEventsJobFailure", {
    value: true,
    configurable: true,
  });
  return err;
}

export function isQueueEventsJobFailure(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { isQueueEventsJobFailure?: unknown }).isQueueEventsJobFailure === true
  );
}

/**
 * Tag a connectivity error (such as a Redis or Postgres `ECONNRESET`) that was
 * thrown from an upstream service while the incoming HTTP request stream is
 * still open, or inside `waitForJob`, so `classifyError(..., "http")` does not
 * mistake it for a browser disconnect (#3697).
 */
export function markUpstreamError<T>(err: T): T {
  const target = unwrapUnrecoverable(err);
  if (
    err instanceof Error &&
    !isQueueEventsJobFailure(err) &&
    !isQueueEventsJobFailure(target) &&
    connectivityClass(target) !== null
  ) {
    Object.defineProperty(err, "isUpstreamError", {
      value: true,
      configurable: true,
    });
    if (target instanceof Error && target !== err) {
      Object.defineProperty(target, "isUpstreamError", {
        value: true,
        configurable: true,
      });
    }
  }
  return err;
}

export function isUpstreamError(err: unknown): boolean {
  return err instanceof Error && (err as { isUpstreamError?: unknown }).isUpstreamError === true;
}

export function classifyError(rawErr: unknown, source?: ReportContext["source"]): ErrorClass {
  const err = unwrapUnrecoverable(rawErr);
  if (isToolInputError(err)) return "expected";
  const e = err as { name?: string; message?: string; code?: string } | null;
  // InputValidationError (apps/api/src/modality/contract.ts) is a 400 the user
  // caused with a bad file/args. Tools throw it from processV2 inside the worker
  // (e.g. sprite-sheet), so it is expected wherever it surfaces, not only http.
  // 5xx status codes (such as ENGINE_UNAVAILABLE 503) indicate server-side failure
  // and are operational faults, not expected user errors (#1330).
  if (e?.name === "InputValidationError") {
    return ((e as { statusCode?: number }).statusCode ?? 400) >= 500 ? "operational" : "expected";
  }
  if (e && typeof e.message === "string" && /^(Canceled$|Timed out after )/.test(e.message)) {
    return "expected";
  }
  // An authored SafeError has already been classified by its thrower; check it
  // before isClientAbort so an S3 connection reset (TimeoutError with
  // code="ECONNRESET") or an upstream "aborted"/"Premature close" wrapped in a
  // storage SafeError is not mistaken for the browser hanging up (#1643).
  if (isSafeMessageError(err)) return err.kind === "bug" ? "bug" : "operational";
  // The next shortcuts only make sense at the HTTP boundary (undefined keeps
  // the http-ish default for direct calls). Off the request path a bare
  // ECONNRESET is an upstream socket loss, not a client abort, and a ZodError
  // means schema drift: settings were already validated at the boundary, so a
  // worker-side parse failure is our bug.
  if (source === "http" || source === undefined) {
    if (isQueueEventsJobFailure(err)) return "expected";
    if (!isUpstreamError(rawErr) && !isUpstreamError(err) && isClientAbort(err)) {
      return "expected";
    }
    // ZodError = settings validation. Settings are validated at the boundary, so
    // a worker-side ZodError is schema drift (our bug); only expected on http.
    if (e?.name === "ZodError") return "expected";
  }
  // BullMQ raises UnrecoverableError from its own worker run loop when a job
  // loses its lock (a stall), e.g. a heavy upscale under CPU/memory pressure,
  // and QueueEvents reconstructs failedReason as a plain Error on the
  // waitForJob side (#3698). We never throw it ourselves, so it always means
  // the instance could not keep the job's lock alive: an environmental strain,
  // not a defect in our code. Operational (one warning/hour) instead of bug
  // spam (NODE-27).
  if (isBullMqStallError(e)) return "operational";
  if (connectivityClass(err)) return "operational";
  if (isEnvironmentalDbError(err)) return "operational";
  if (isOperationalErrno(err)) return "operational";
  if (isBinarySpawnFailure(err)) return "operational";
  if (
    e?.name === "ReplyError" &&
    typeof e.message === "string" &&
    /^(OOM|READONLY|MISCONF|NOREPLICAS)\b/.test(e.message)
  ) {
    return "operational";
  }
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

export function errorSignature(rawErr: unknown): string {
  const err = unwrapUnrecoverable(rawErr);
  const e = err as {
    name?: string;
    message?: string;
    code?: string;
    stack?: string;
    cause?: unknown;
  } | null;
  const name = isBullMqStallError(e) ? "UnrecoverableError" : (e?.name ?? "Unknown");
  const code = e?.code ?? "-";
  // A wrapper built in one place (engineUnavailable) carries the same name,
  // code, and frame whatever went wrong underneath, so without its cause a
  // missing decoder and one running out of memory would share one throttle
  // slot (#1628). Errors with no named cause keep their signature unchanged.
  const causeName = (e?.cause as { name?: unknown } | null | undefined)?.name;
  const cause = typeof causeName === "string" ? `:${causeName}` : "";
  let frame = "-";
  if (typeof e?.stack === "string") {
    const line = e.stack.split("\n").find((l) => l.includes("/apps/") || l.includes("/packages/"));
    const m = line?.slice(0, 300).match(/([^/\\\s():]+):(\d+)/);
    if (m) frame = `${m[1]}:${m[2]}`;
  }
  return `${name}:${code}:${frame}${cause}`;
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
export async function reportError(rawErr: unknown, ctx: ReportContext): Promise<void> {
  try {
    if (!analyticsEnabled()) return;
    const err = unwrapUnrecoverable(rawErr);
    const cls = classifyError(rawErr, ctx.source);
    if (cls === "expected") return;
    if (!sentryDiagnostic() && !shouldReport(cls, errorSignature(err))) return;

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
      const jobAge = jobAgeBucket(ctx.jobAgeMs);
      if (jobAge) scope.setTag("job_age", jobAge);
      // An operational SafeError that names its own fault (OIDC_DISCOVERY_FAILED,
      // storage-unavailable, ...) groups under that code even when a network
      // failure sits underneath. Otherwise "SSO is down" shares one issue with
      // every other outbound outage, and resolving that issue mutes it (#1907).
      // extractErrorCode returns a non-bug SafeError's own code (1 to 40 chars)
      // ahead of the chain, so `code === err.code` means it has a usable one.
      const ownCode = cls === "operational" && isSafeMessageError(err) && code === err.code;
      if (net && !ownCode) {
        scope.setFingerprint(["connectivity", net]);
      } else if (cls === "operational") {
        // Collapse an operational class (bad DB creds, full disk, ...) into a
        // single issue keyed on its code, instead of fragmenting into a
        // separate issue per call site/stack frame (the pg-auth flood showed up
        // as 5 issues). bug-class errors keep default per-frame grouping, where
        // distinct frames usually are distinct bugs.
        const stallOrName = isBullMqStallError(err as { name?: unknown; message?: unknown } | null)
          ? "UnrecoverableError"
          : (err as { name?: string }).name;
        scope.setFingerprint(["operational", code ?? stallOrName ?? "op"]);
      }
      if (cls === "bug" && ctx.settings !== undefined) {
        // Attach the knobs that triggered a bug (format, quality, mode, ...) so
        // it is reproducible, without leaking filenames, free text, or secrets.
        const vetted = vetSettings(ctx.settings);
        if (vetted) scope.setContext("tool", vetted);
      }
      const py = err as { pythonType?: string; pythonFrames?: unknown };
      if (Array.isArray(py.pythonFrames) && py.pythonFrames.length) {
        // Flatten each frame to a short string. An array of frame OBJECTS sits
        // deeper than Sentry's default normalizeDepth (3), so the SDK truncates
        // each to "[Object]" before beforeSend runs and the context is lost.
        // Strings are primitives and survive normalization at any depth.
        const frames = py.pythonFrames
          .map((f) => {
            const o = (f ?? {}) as { file?: unknown; line?: unknown; func?: unknown };
            return `${String(o.file)}:${String(o.line)} ${String(o.func)}`;
          })
          .slice(0, 20);
        scope.setContext("python", { type: py.pythonType, frames });
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
