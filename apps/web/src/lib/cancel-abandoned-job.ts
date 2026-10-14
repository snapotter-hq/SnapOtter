import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { CancelRefusedError, failedCancelRequest, readCancelAnswer } from "@/lib/cancel-refusal";

// SafeError messages are constants (packages/shared/src/tool-errors.ts), so
// each tool that can call this has its own pair rather than an interpolated one.
const MESSAGES = {
  "erase-object": {
    missing: "Cancel for an abandoned Erase Object job found no job",
    failed: "Canceling an abandoned Erase Object job failed",
  },
  ocr: {
    missing: "Cancel for an abandoned OCR job found no job",
    failed: "Canceling an abandoned OCR job failed",
  },
  "sign-pdf": {
    missing: "Cancel for an abandoned Sign PDF job found no job",
    failed: "Canceling an abandoned Sign PDF job failed",
  },
} as const;

export type AbandonedJobToolId = keyof typeof MESSAGES;

export interface AbandonedJobTracker {
  /**
   * Record an upload progress event. Firefox fires `upload.onload` only once
   * the response starts, so the final progress event (`loaded >= total`) also
   * counts as the browser having sent the whole body (#2136).
   */
  onUploadProgress: (event: { lengthComputable?: boolean; loaded: number; total: number }) => void;
  /** Record `xhr.upload.onload`. */
  onUploadLoad: () => void;
  /**
   * Record that the server has the job (a 202 response or a progress frame).
   * If the run was already stopped after the upload finished, cancels the job now.
   */
  onAccepted: () => void;
  /**
   * Stop an in-flight run. Cancels immediately if the server already accepted
   * the job; otherwise, if the upload finished, arms a cancel for when the 202
   * arrives and returns `true` so the caller keeps the request open instead of
   * aborting it (#2093, #2136, #2239).
   */
  keepRequestOnStop: () => boolean;
}

/**
 * Tracks the upload and acceptance state of one tool request so a stop in any
 * window cancels the server job without racing the alias insert (#2093, #2136,
 * #2239).
 */
export function trackAbandonedJob(
  clientJobId: string,
  toolId: AbandonedJobToolId,
): AbandonedJobTracker {
  let uploadDone = false;
  let accepted = false;
  let cancelOnAnswer = false;
  let stopped = false;

  return {
    onUploadProgress(event) {
      if (event.lengthComputable && event.loaded >= event.total) {
        uploadDone = true;
      }
    },
    onUploadLoad() {
      uploadDone = true;
    },
    onAccepted() {
      accepted = true;
      if (cancelOnAnswer) {
        cancelOnAnswer = false;
        void cancelAbandonedJob(clientJobId, toolId);
      }
    },
    keepRequestOnStop() {
      if (stopped) return false;
      stopped = true;
      if (accepted) {
        void cancelAbandonedJob(clientJobId, toolId);
        return false;
      }
      if (uploadDone) {
        cancelOnAnswer = true;
        return true;
      }
      return false;
    },
  };
}

/**
 * Asks the server to stop the job of a run the client gave up on: its own
 * handling broke (#1960), or the user left while a queued file was still
 * waiting (#2093). Best effort: the run has already ended in the UI, so an
 * answer changes nothing there. `canceled: false` means the job had already
 * finished, which is what a throw after a terminal frame gets. Refusals and a
 * request that never arrived are logged and reported by the cancel helpers; a
 * 404 (no such job for this caller) is reported here, since nothing else would
 * trace it. Never rejects.
 */
export async function cancelAbandonedJob(
  clientJobId: string,
  toolId: AbandonedJobToolId,
): Promise<void> {
  const messages = MESSAGES[toolId];
  try {
    let res: Response;
    try {
      res = await fetch(appUrl(`/api/v1/jobs/${clientJobId}/cancel`), {
        method: "POST",
        headers: formatHeaders(),
        keepalive: true,
      });
    } catch (cause) {
      throw failedCancelRequest(cause, toolId);
    }
    const answer = await readCancelAnswer(res, () => true, toolId);
    if (answer === "missing") {
      console.warn(messages.missing);
      void captureHandledError(
        new SafeError(messages.missing, { kind: "operational", statusCode: 404 }),
        { error_class: "operational", tool_id: toolId, status_code: "404" },
      );
    }
  } catch (err) {
    if (err instanceof CancelRefusedError) return;
    console.error(messages.failed, err);
    void captureHandledError(new SafeError(messages.failed, { kind: "bug", cause: err }), {
      error_class: "bug",
      tool_id: toolId,
    });
  }
}
