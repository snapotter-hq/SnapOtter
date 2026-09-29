import type { FastifyBaseLogger } from "fastify";
import pino from "pino";

/**
 * `log.error({ err, ...fields }, message)`, keeping the error's whole cause
 * chain. pino's default `err` serializer folds a cause's message into the
 * top-level one and drops the rest, including every member of an
 * AggregateError cause. A failed OCR runtime handoff keeps the errors that say
 * what actually went wrong in exactly that shape (#1504).
 */
export function logErrorWithCauses(
  log: FastifyBaseLogger,
  fields: { err: unknown } & Record<string, unknown>,
  message: string,
): void {
  log.child({}, { serializers: { err: pino.stdSerializers.errWithCause } }).error(fields, message);
}
