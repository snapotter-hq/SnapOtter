import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";
import { isIgnoredError } from "@/lib/sentry-scrub";

/**
 * Why a cancel didn't go through, for the cancel button to say so (#1815).
 * notCancellable: the server can't stop this run now. It says so with a 200
 * `{ canceled: false }` (a run already ending, or a batch kind with nothing to
 * cancel); a 409 reads the same. notAllowed: 401 or 403, the user is signed
 * out or may not cancel it. failed: anything else, including a request that
 * never got an answer.
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
 * a 409 is expected, and a 401 or 403 (signed out, not allowed) or a 429
 * (clicking past the route's rate limit) is about the user, so none of those
 * is a bug. The report's message is constant and nothing from the body goes
 * with it; the status rides as the status_code tag.
 */
function refusedCancel(status: number, toolId?: string): CancelRefusedError {
  if (status === 409) {
    console.info("Cancel refused", status);
    return new CancelRefusedError("notCancellable", status);
  }
  console.warn("Cancel refused", status);
  if (status === 401 || status === 403) return new CancelRefusedError("notAllowed", status);
  if (status === 429) return new CancelRefusedError("failed", status);
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

/**
 * What a cancel answer means for the run that sent it. `acknowledged`: the
 * server is canceling it, so record the intent. `missing`: a 404, no job
 * exists server-side, so nothing will ever end the run but the hook itself.
 * `stale`: the run already ended while the POST was out, so there's nobody
 * left to tell.
 */
export type CancelAnswer = "acknowledged" | "missing" | "stale";

/**
 * Reads the cancel POST's answer, and throws a CancelRefusedError for every
 * answer that leaves the run going (#1815). `isCurrentRun` says whether the
 * run that sent the cancel is still the live one.
 *
 * A 200 `{ canceled: false }` is the server's own "can't cancel this now",
 * expected, so it's logged at info. A 2xx whose body won't parse breaks the
 * route's contract (a proxy's HTML page, say), so it's reported as well;
 * whether the server canceled is unknown, and the progress stream settles
 * that either way.
 */
export async function readCancelAnswer(
  res: Response,
  isCurrentRun: () => boolean,
  toolId?: string,
): Promise<CancelAnswer> {
  if (res.status === 404) return isCurrentRun() ? "missing" : "stale";
  if (!res.ok) throw refusedCancel(res.status, toolId);
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    console.warn("Cancel answer unreadable", res.status);
    void captureHandledError(
      new SafeError("A cancel answer was unreadable", {
        kind: "operational",
        statusCode: res.status,
      }),
      { ...tagsFor(toolId), status_code: String(res.status) },
    );
    throw new CancelRefusedError("failed", res.status);
  }
  if (!isCurrentRun()) return "stale";
  if ((body as { canceled?: unknown }).canceled === true) return "acknowledged";
  console.info("Cancel refused: the server can't cancel this run now");
  throw new CancelRefusedError("notCancellable", res.status);
}
