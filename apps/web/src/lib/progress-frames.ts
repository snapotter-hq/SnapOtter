import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";
import { resolveServerUrls } from "@/lib/app-url";

/** A parsed `/api/v1/jobs/:id/progress` SSE frame: the fields handlers read. */
export interface ProgressFrame {
  type?: string;
  phase?: string;
  result?: Record<string, unknown>;
  percent?: number;
  stage?: string;
  error?: string;
  /** Machine-readable reason on a failed frame, such as ENGINE_UNAVAILABLE. */
  code?: string;
  /** Operator hint that goes with `code` ("Check QPDF_PATH ..."). */
  details?: string;
}

/**
 * The error a run ends with when handling a well-formed progress frame throws
 * (#1287). That is a client bug, not a server outcome, so the run ends right
 * away instead of sitting at "processing" until a stall timer fires. A frame
 * that fails to parse is the only kind a handler may ignore.
 */
export const FRAME_HANDLING_FAILED = "Something went wrong while tracking this job. Try again.";

/**
 * Why a tool result isn't one. Each reason reports under its own constant
 * message and exception type, so Sentry keeps a proxy's HTML page apart from
 * an API answer with nothing to download: it groups a stack by type, and every
 * report is built at the same spot in reportMalformedResult.
 */
const MALFORMED_RESULT = {
  notAnObject: { type: "ResultNotAnObjectError", message: "Tool result body is not a JSON object" },
  noDownloadUrl: { type: "ResultWithoutDownloadError", message: "Tool result has no download URL" },
  // Barcode Read answers with decoded barcodes instead of a download (#1795).
  notABarcodeResult: {
    type: "NotABarcodeResultError",
    message: "Tool result is not a barcode read result",
  },
  // A download URL but not a field its caller reads, a job id or a size (#1857).
  missingResultField: {
    type: "ResultMissingFieldError",
    message: "Tool result is missing a field its tool reads",
  },
} as const;

/**
 * Result fields a caller can require on top of `downloadUrl`. The shared hooks
 * require none, since some routes answer without sizes; a panel that reads its
 * own answer names what it reads (#1857).
 */
export type RequiredResultField = "jobId" | "originalSize" | "processedSize";

/** What a caller's catch got when it wasn't a MalformedResultError: our own bug. */
const RESULT_UNREADABLE = {
  type: "ResultUnreadableError",
  message: "Tool result could not be read",
};

/**
 * A tool result that isn't one: the server's bug, not ours. The message is a
 * constant and there is never a cause, because the body may hold user data
 * and a SafeError's cause gets appended to its Sentry message (#1740).
 */
export class MalformedResultError extends SafeError {
  readonly reason: keyof typeof MALFORMED_RESULT;

  constructor(reason: keyof typeof MALFORMED_RESULT) {
    super(MALFORMED_RESULT[reason].message, { kind: "operational" });
    this.name = "MalformedResultError";
    this.reason = reason;
  }
}

/**
 * Parses a sync 2xx tool response, the step that rejects a malformed body. It
 * throws a MalformedResultError unless the body is a JSON object with a
 * non-empty `downloadUrl` string: every caller lands that URL as the entry's
 * result, and every sync 2xx the API sends carries one (#1740). `required`
 * names any other field the caller reads (see checkToolResult). Callers write
 * the result outside the try around this, so a throw from their own store
 * writes doesn't read as "Invalid response" (#1354, the sync twin of #1287).
 */
export function parseResultBody<T extends object>(
  text: string,
  required: readonly RequiredResultField[] = [],
): T {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Not rethrown or kept as the cause: a SyntaxError quotes the text.
    throw new MalformedResultError("notAnObject");
  }
  return resolveServerUrls(checkToolResult<T>(body, required));
}

/**
 * Checks that a tool result is one: a JSON object with a non-empty
 * `downloadUrl` string, or it throws a MalformedResultError. parseResultBody
 * runs it on a sync 2xx body, and the processing hooks on a completed progress
 * frame's `result`, which the worker builds the same way (#1794). Each field
 * in `required` must be there too: `jobId` a non-empty string, a size a finite
 * number no less than zero (#1857).
 */
export function checkToolResult<T extends object>(
  body: unknown,
  required: readonly RequiredResultField[] = [],
): T {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new MalformedResultError("notAnObject");
  }
  const result = body as Record<string, unknown>;
  const { downloadUrl } = result;
  if (typeof downloadUrl !== "string" || !downloadUrl) {
    throw new MalformedResultError("noDownloadUrl");
  }
  for (const field of required) {
    if (!isResultField(field, result[field])) {
      throw new MalformedResultError("missingResultField");
    }
  }
  return body as T;
}

function isResultField(field: RequiredResultField, value: unknown): boolean {
  if (field === "jobId") return typeof value === "string" && value !== "";
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Reports a result parseResultBody or checkToolResult (or a caller's own
 * check) rejected, so a server bug the user sees reaches Sentry too (#1740).
 * The report is rebuilt from a constant, never the error itself: anything else
 * that lands here, a SyntaxError say, can quote the body. `status` is the HTTP
 * status of a sync answer and goes on as the `status_code` tag; a progress
 * frame has none.
 */
export function reportMalformedResult(
  err: unknown,
  { status, toolId }: { status?: number; toolId?: string },
): void {
  const { type, message } =
    err instanceof MalformedResultError ? MALFORMED_RESULT[err.reason] : RESULT_UNREADABLE;
  const report = new SafeError(message, { kind: "operational", statusCode: status });
  report.name = type;
  void captureHandledError(
    report,
    toolId ? { error_class: "operational", tool_id: toolId } : { error_class: "operational" },
  );
}

/**
 * How a job-progress subscriber reports a failed run. Subscribers that live
 * outside a component have no locale, so when there's no server text they hand
 * over a reason and the component translates it with jobFailureMessage (#1593).
 * `invalidResponse` is a completed frame whose result checkToolResult rejected.
 */
export type JobFailure =
  | { message: string }
  | { reason: "noDetail" | "trackingFailed" | "invalidResponse" };

/**
 * The JobFailure for a failed progress frame's `error`. A blank or missing
 * error has nothing to show, so it's `noDetail` rather than an empty message:
 * the worker publishes `error: ""` when a handler throws an Error with no text.
 * The operator hint an engine-unavailable failure carries in `details` follows
 * the error, the same way an HTTP error body reads (#1432): without it, a job
 * that failed because qpdf or ffprobe couldn't start said nothing actionable.
 */
export function frameFailure(error: unknown, details?: unknown): JobFailure {
  if (typeof error !== "string" || !error.trim()) return { reason: "noDetail" };
  const hint = typeof details === "string" && details.trim() ? details : "";
  return { message: hint ? `${error}: ${hint}` : error };
}

/**
 * A failed frame's text for callers that show a plain string with their own
 * fallback (the shared tool processor, OCR): frameFailure's message, or the
 * fallback when the frame has no error.
 */
export function failedFrameMessage(frame: ProgressFrame, fallback: string): string {
  const failure = frameFailure(frame.error, frame.details);
  return "message" in failure ? failure.message : fallback;
}

/** The text to show for a JobFailure, in the caller's locale. */
export function jobFailureMessage(
  failure: JobFailure,
  errors: { processingFailedNoDetail: string; jobTrackingFailed: string; invalidResponse: string },
): string {
  if ("message" in failure) return failure.message;
  if (failure.reason === "noDetail") return errors.processingFailedNoDetail;
  if (failure.reason === "invalidResponse") return errors.invalidResponse;
  return errors.jobTrackingFailed;
}
