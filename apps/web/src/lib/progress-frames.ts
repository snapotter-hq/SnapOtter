/** A parsed `/api/v1/jobs/:id/progress` SSE frame: the fields handlers read. */
export interface ProgressFrame {
  type?: string;
  phase?: string;
  result?: Record<string, unknown>;
  percent?: number;
  stage?: string;
  error?: string;
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

/** The text to show for a JobFailure, in the caller's locale. */
export function jobFailureMessage(
  failure: JobFailure,
  errors: { processingFailedNoDetail: string; jobTrackingFailed: string },
): string {
  if ("message" in failure) return failure.message;
  return failure.reason === "noDetail" ? errors.processingFailedNoDetail : errors.jobTrackingFailed;
}
