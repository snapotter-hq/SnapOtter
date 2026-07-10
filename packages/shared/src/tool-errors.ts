/**
 * Error classes shared by api, web, and the engine packages.
 *
 * SafeError: an error whose message was AUTHORED BY US and is safe to send to
 * Sentry verbatim. RULE: the message must be a CONSTANT string; anything
 * variable (exit codes, versions, counts) goes into `code` so Sentry grouping
 * stays stable. Detection is by marker property, not instanceof, so it
 * survives error copying across module boundaries.
 *
 * ToolInputError: the user's input was the problem (bad CSV, corrupt media).
 * Never reported to Sentry. Engine packages can import these helpers
 * directly; the raw marker form Object.assign(err, { isToolInputError: true })
 * remains the wire format for contexts where an import is undesirable, and
 * because instanceof is brittle across duplicate module instances.
 */
export type SafeErrorKind = "operational" | "bug";

export class SafeError extends Error {
  readonly isSafeMessage = true;
  readonly kind: SafeErrorKind;
  readonly code?: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    opts: { kind?: SafeErrorKind; code?: string; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "SafeError";
    this.kind = opts.kind ?? "operational";
    this.code = opts.code;
    this.statusCode = opts.statusCode;
  }
}

/**
 * Marker-detected errors that were copied across module boundaries may lack
 * `kind`, `code`, or `statusCode`, so consumers must tolerate their absence.
 */
export function isSafeMessageError(err: unknown): err is SafeError {
  return err instanceof Error && (err as { isSafeMessage?: unknown }).isSafeMessage === true;
}

export class ToolInputError extends Error {
  readonly isToolInputError = true;
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function isToolInputError(err: unknown): err is Error & { isToolInputError: true } {
  return err instanceof Error && (err as { isToolInputError?: unknown }).isToolInputError === true;
}

export function markToolInputError<E extends Error>(err: E): E {
  return Object.assign(err, { isToolInputError: true });
}
