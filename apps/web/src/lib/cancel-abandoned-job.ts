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
} as const;

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
  toolId: keyof typeof MESSAGES,
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
