import { appUrl } from "@/lib/app-url";
import type { ProgressFrame } from "@/lib/progress-frames";

const SSE_STALL_TIMEOUT_MS = 5 * 60_000;

/** The job id a 202 answer names for its progress stream, if it names one. */
export function acceptedJobId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = data.progressJobId ?? data.jobId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A queued job that failed; the frame says why. */
export class QueuedJobFailed extends Error {
  constructor(readonly frame: ProgressFrame) {
    super("Queued job failed");
    this.name = "QueuedJobFailed";
  }
}

/** The progress stream went quiet for longer than any of these jobs takes. */
export class QueuedJobStalled extends Error {
  constructor() {
    super("Queued job stalled");
    this.name = "QueuedJobStalled";
  }
}

/**
 * Follow a job the server queued (a 202 answer from a custom JSON route) over
 * its progress stream until it settles: resolves with the completed frame's
 * result, rejects with QueuedJobFailed, QueuedJobStalled, or an AbortError when
 * the run is reset. The endpoint replays the terminal frame on reconnect, so a
 * tab that slept through the finish still gets it when it comes back.
 */
export function followQueuedJob(
  jobId: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let es: EventSource | null = null;
    let stall: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const settle = (finish: () => void) => {
      if (done) return;
      done = true;
      if (stall) clearTimeout(stall);
      es?.close();
      es = null;
      document.removeEventListener("visibilitychange", onVisible);
      signal.removeEventListener("abort", onAbort);
      finish();
    };
    const onAbort = () => settle(() => reject(new DOMException("Aborted", "AbortError")));
    const resetStall = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(() => settle(() => reject(new QueuedJobStalled())), SSE_STALL_TIMEOUT_MS);
    };
    const open = () => {
      if (done) return;
      es?.close();
      es = new EventSource(appUrl(`/api/v1/jobs/${jobId}/progress`));
      es.onmessage = (event) => {
        let frame: ProgressFrame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (frame.type === "heartbeat") {
          resetStall();
          return;
        }
        if (frame.type !== "single") return;
        resetStall();
        if (frame.phase === "complete") {
          settle(() => resolve(frame.result));
        } else if (frame.phase === "failed") {
          settle(() => reject(new QueuedJobFailed(frame)));
        } else if (typeof frame.percent === "number") {
          onProgress(frame.percent);
        }
      };
      // The browser reconnects a dropped stream by itself.
      es.onerror = () => {};
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && es?.readyState !== EventSource.OPEN) open();
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort);
    document.addEventListener("visibilitychange", onVisible);
    open();
    resetStall();
  });
}
