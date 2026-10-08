import type { FastifyBaseLogger, FastifyReply } from "fastify";
import type { InputValidationError } from "../modality/contract.js";
import { reportError } from "./error-report.js";

// A broken engine stays broken, but some faults come and go: an image decoder
// running out of memory is reported as the same ENGINE_UNAVAILABLE (#1577).
// Once per process hid every repeat of those, so a report lasts a window, and
// the cause's name is part of the key so one kind can't hide the other (#1628).
const REPORT_WINDOW_MS = 10 * 60_000;
const lastReported = new Map<string, number>();

function causeName(err: InputValidationError): string {
  const name = (err.cause as { name?: unknown } | undefined)?.name;
  return typeof name === "string" ? name : "";
}

/**
 * A 5xx InputValidationError (ENGINE_UNAVAILABLE when ffprobe or qpdf can't
 * start) is the operator's container, not the caller's file, and a route that
 * answers it directly never reaches the error handler that logs 5xx. Log and
 * report it here instead, once per code, cause and tool per ten minutes, so a
 * broken engine shows up without a line per upload (#1330, #1403) and an
 * intermittent one shows up each time it recurs (#1628). A 4xx is the caller's
 * fault and is ignored.
 */
export function reportEngineUnavailable(
  err: InputValidationError,
  toolId: string,
  log: Pick<FastifyBaseLogger, "warn">,
): void {
  if (err.statusCode < 500) return;
  const cause = causeName(err);
  const key = `${err.code ?? "unknown"}:${cause}:${toolId}`;
  const now = Date.now();
  const last = lastReported.get(key);
  // A clock stepped backwards gives a negative gap; treat it as expired rather
  // than muting reports for the size of the step.
  const elapsed = last === undefined ? Number.POSITIVE_INFINITY : now - last;
  if (elapsed >= 0 && elapsed < REPORT_WINDOW_MS) return;
  lastReported.set(key, now);
  log.warn(
    { code: err.code, cause: cause || undefined, toolId, err },
    "Tool engine unavailable during input preparation",
  );
  void reportError(err, { source: "http", toolId, statusCode: err.statusCode });
}

/**
 * Reply with an input handler's rejection. A 5xx one is also logged and
 * reported, once per code, cause and tool per window, which suits endpoints the browser fires on its own
 * (thumbnails, live previews) where a log line per request would bury the
 * signal (#1428).
 */
export function sendInputValidationError(
  reply: FastifyReply,
  err: InputValidationError,
  toolId: string,
  log: Pick<FastifyBaseLogger, "warn">,
) {
  reportEngineUnavailable(err, toolId, log);
  return reply.status(err.statusCode).send({
    error: err.message,
    ...(err.details !== undefined && { details: err.details }),
    ...(err.code !== undefined && { code: err.code }),
  });
}

/**
 * One file's failure as a batch weighs it: the message plus, when the failure
 * carried them, its HTTP status, code and operator hint. A pre-failure and a
 * worker-side failure both reduce to this, so they can be judged together.
 */
export interface BatchFault {
  error: string;
  statusCode?: number;
  code?: string;
  details?: string;
}

/**
 * The batch finalize's verdict when no file succeeded: the shared server
 * fault across the files that failed before the flow and the ones that
 * failed in it (#1627). The pre-failures come from the route through job
 * data; when that list doesn't account for every file that never reached
 * the flow (a job queued by an older build), or the child faults don't
 * account for every flow child, there's no verdict rather than one formed
 * without every file in view.
 */
export function allFailedFault(
  preFailureFaults: unknown,
  preFailedCount: number,
  childFaults: BatchFault[],
  flowChildCount: number,
): ReturnType<typeof sharedServerFault> {
  const pre = Array.isArray(preFailureFaults) ? (preFailureFaults as BatchFault[]) : [];
  if (pre.length !== preFailedCount || childFaults.length !== flowChildCount) return null;
  return sharedServerFault([...pre, ...childFaults]);
}

/** What a batch keeps about a file that failed input preparation, besides its message. */
export function preFailureFaultFields(err: InputValidationError): {
  statusCode: number;
  code?: string;
  details?: string;
} {
  return {
    statusCode: err.statusCode,
    ...(err.code && { code: err.code }),
    ...(err.details && { details: err.details }),
  };
}

/**
 * When every file in a batch failed input preparation with the same 5xx code
 * (ffprobe or qpdf that can't start), that is the batch's failure, not the
 * files': the reply carries its status, code, and operator hint instead of a
 * generic 422 (#1432). Anything mixed, or any 4xx, returns null.
 */
export function sharedServerFault(
  failures: BatchFault[],
): { statusCode: number; code: string; error: string; details?: string } | null {
  const first = failures[0];
  if (!first?.code || first.statusCode === undefined || first.statusCode < 500) return null;
  const same = failures.every((f) => f.code === first.code && f.statusCode === first.statusCode);
  if (!same) return null;
  return {
    statusCode: first.statusCode,
    code: first.code,
    error: first.error,
    ...(first.details && { details: first.details }),
  };
}
