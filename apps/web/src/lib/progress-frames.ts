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
 * How a job-progress subscriber reports a failed run. Subscribers that live
 * outside a component have no locale, so when there's no server text they hand
 * over a reason and the component translates it with jobFailureMessage (#1593).
 */
export type JobFailure = { message: string } | { reason: "noDetail" | "trackingFailed" };

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
  errors: { processingFailedNoDetail: string; jobTrackingFailed: string },
): string {
  if ("message" in failure) return failure.message;
  return failure.reason === "noDetail" ? errors.processingFailedNoDetail : errors.jobTrackingFailed;
}
