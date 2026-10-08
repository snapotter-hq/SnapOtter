import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { CancelRefusedError, failedCancelRequest, readCancelAnswer } from "@/lib/cancel-refusal";

/**
 * Asks the server to stop the job of a run the client gave up on: its own
 * handling broke (#1960), or the user left while a queued file was still
 * waiting. Best effort: the run has already ended in the UI, so an answer
 * changes nothing there. `canceled: false` means the job had already finished,
 * which is what a throw after a terminal frame gets. Refusals and a request
 * that never arrived are logged and reported by the cancel helpers; a 404 (no
 * such job for this caller) is reported here, since nothing else would trace
 * it. Never rejects.
 *
 * `toolLabel` is the name used in the log and report messages.
 */
export async function cancelAbandonedJob(
  clientJobId: string,
  toolId: string,
  toolLabel: string,
): Promise<void> {
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
      const message = `Cancel for an abandoned ${toolLabel} job found no job`;
      console.warn(message);
      void captureHandledError(new SafeError(message, { kind: "operational", statusCode: 404 }), {
        error_class: "operational",
        tool_id: toolId,
        status_code: "404",
      });
    }
  } catch (err) {
    if (err instanceof CancelRefusedError) return;
    const message = `Canceling an abandoned ${toolLabel} job failed`;
    console.error(message, err);
    void captureHandledError(new SafeError(message, { kind: "bug", cause: err }), {
      error_class: "bug",
      tool_id: toolId,
    });
  }
}
