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
      if (ctx.toolId) scope.setTag("tool_id", ctx.toolId);
      if (ctx.pool) scope.setTag("pool", ctx.pool);
      if (ctx.route) scope.setTag("route", ctx.route);
      if (ctx.method) scope.setTag("method", ctx.method);
      if (ctx.statusCode) scope.setTag("status_code", String(ctx.statusCode));
      if (ctx.subsystem) scope.setTag("subsystem", ctx.subsystem);
      if (net) scope.setFingerprint(["connectivity", net]);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    });
  } catch {
    // telemetry must never throw
  }
}
