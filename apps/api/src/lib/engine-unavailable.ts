import type { FastifyBaseLogger, FastifyReply } from "fastify";
import type { InputValidationError } from "../modality/contract.js";
import { reportError } from "./error-report.js";

const reported = new Set<string>();

/**
 * A 5xx InputValidationError (ENGINE_UNAVAILABLE when ffprobe or qpdf can't
 * start) is the operator's container, not the caller's file, and a route that
 * answers it directly never reaches the error handler that logs 5xx. Log and
 * report it here instead, once per code and tool per process, so a broken
 * engine shows up without a line per upload (#1330, #1403). A 4xx is the
 * caller's fault and is ignored.
 */
export function reportEngineUnavailable(
  err: InputValidationError,
  toolId: string,
  log: Pick<FastifyBaseLogger, "warn">,
): void {
  if (err.statusCode < 500) return;
  const key = `${err.code ?? "unknown"}:${toolId}`;
  if (reported.has(key)) return;
  reported.add(key);
  log.warn({ code: err.code, toolId, err }, "Tool engine unavailable during input preparation");
  void reportError(err, { source: "http", toolId, statusCode: err.statusCode });
}

/**
 * Reply with an input handler's rejection. A 5xx one is also logged and
 * reported, once per tool, which suits endpoints the browser fires on its own
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
