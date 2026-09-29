import type { FastifyBaseLogger } from "fastify";
import pino from "pino";

/**
 * `log.error({ err, ...fields }, message)`, keeping the error's whole cause
 * chain. pino's default `err` serializer folds a cause's message into the
 * top-level one and drops the rest, including every member of an
 * AggregateError cause. A failed OCR runtime handoff keeps the errors that say
 * what actually went wrong in exactly that shape (#1504).
 *
 * Callers log first thing in a catch, so a chain it can't walk falls back to
 * the default serializer rather than throwing. Every enumerable property of
 * every error in the chain is written, and `redact` only covers request
 * headers, so don't pass an error that carries credentials.
 */
export function logErrorWithCauses(
  log: FastifyBaseLogger,
  fields: { err: unknown } & Record<string, unknown>,
  message: string,
): void {
  try {
    log
      .child({}, { serializers: { err: pino.stdSerializers.errWithCause } })
      .error(fields, message);
  } catch (causeChainError) {
    // errWithCause tags each error it visits, so a frozen error in the chain
    // throws, and an AggregateError that lists itself never ends. The default
    // serializer only reads the chain, so fall back to it.
    log.error({ ...fields, causeChainError: String(causeChainError) }, message);
  }
}
