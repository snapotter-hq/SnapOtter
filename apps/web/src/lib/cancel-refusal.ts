import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";
import { isIgnoredError } from "@/lib/sentry-scrub";

/**
 * Why a cancel didn't go through, for the cancel button to say so (#1815).
 * notCancellable: the server answered 409, the run is past the point where it
 * can stop. notAllowed: 401 or 403, the user is signed out or may not cancel
 * it. failed: anything else, including a request that never got an answer.
 */
export type CancelRefusalReason = "notCancellable" | "notAllowed" | "failed";

/**
 * A cancel the server refused or never received. The run hooks reject the
 * cancel with this and leave the run alone: only the server can stop it, so
 * repainting it as canceled would be a lie (#767). Anything else a cancel
 * rejects with is the hook's own teardown breaking (#1779).
 */
export class CancelRefusedError extends Error {
  readonly reason: CancelRefusalReason;
  /** The refusing answer's HTTP status; absent when no answer came back. */
  readonly status?: number;

  constructor(reason: CancelRefusalReason, status?: number) {
    super(status === undefined ? "Cancel request failed" : `Cancel refused (${status})`);
    this.name = "CancelRefusedError";
    this.reason = reason;
    this.status = status;
  }
}

function tagsFor(toolId: string | undefined): Record<string, string> {
  return toolId ? { error_class: "operational", tool_id: toolId } : { error_class: "operational" };
}

/**
 * The error for a cancel the server answered with `status` (anything but a
 * 2xx or the 404 the hooks settle locally). Logs it, and reports the faults:
 * a 409 is expected and a 401 or 403 is about the user's session, so neither
 * is a bug. The report's message is constant and nothing from the body goes
 * with it; the status rides as the status_code tag.
 */
export function refusedCancel(status: number, toolId?: string): CancelRefusedError {
  if (status === 409) {
    console.info("Cancel refused", status);
    return new CancelRefusedError("notCancellable", status);
  }
  console.warn("Cancel refused", status);
  if (status === 401 || status === 403) return new CancelRefusedError("notAllowed", status);
  void captureHandledError(
    new SafeError("The server refused a cancel", { kind: "operational", statusCode: status }),
    { ...tagsFor(toolId), status_code: String(status) },
  );
  return new CancelRefusedError("failed", status);
}

/**
 * The error for a cancel request that rejected before any answer. Logs it,
 * and reports it unless it's the browser's own offline or dropped-connection
 * rejection, which Sentry ignores anyway.
 */
export function failedCancelRequest(cause: unknown, toolId?: string): CancelRefusedError {
  console.warn("Cancel request failed", cause);
  if (!isIgnoredError(cause)) {
    void captureHandledError(
      new SafeError("A cancel request never reached the server", { kind: "operational", cause }),
      tagsFor(toolId),
    );
  }
  return new CancelRefusedError("failed");
}
