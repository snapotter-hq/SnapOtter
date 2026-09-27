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
