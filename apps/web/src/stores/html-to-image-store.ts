import { ANALYTICS_EVENTS, en, type TranslationKeys } from "@snapotter/shared";
import { create } from "zustand";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders, userErrorMessage } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { cancelAbandonedJob } from "@/lib/cancel-abandoned-job";
import { currentTranslations } from "@/lib/current-translations";
import { failedFrameMessage, type ProgressFrame } from "@/lib/progress-frames";
import { safeRandomUUID } from "@/lib/uuid";

const TOOL_ID = "html-to-image";
const SSE_STALL_TIMEOUT_MS = 5 * 60_000;

interface CaptureResponse {
  downloadUrl: string;
  processedSize?: number | null;
}

function isCaptureResponse(value: unknown): value is CaptureResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.downloadUrl === "string" &&
    data.downloadUrl.length > 0 &&
    (data.processedSize === undefined ||
      data.processedSize === null ||
      (typeof data.processedSize === "number" &&
        Number.isFinite(data.processedSize) &&
        data.processedSize >= 0))
  );
}

/** The job id a 202 answer names for its progress stream, if it names one. */
function acceptedJobId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = data.progressJobId ?? data.jobId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A queued capture whose job failed; the frame says why. */
class QueuedCaptureFailed extends Error {
  constructor(readonly frame: ProgressFrame) {
    super("Queued capture failed");
    this.name = "QueuedCaptureFailed";
  }
}

/** The progress stream went quiet for longer than any capture takes. */
class QueuedCaptureStalled extends Error {
  constructor() {
    super("Queued capture stalled");
    this.name = "QueuedCaptureStalled";
  }
}

/**
 * Follow a capture the server queued (a 202 answer) over its progress stream
 * until the job settles: resolves with the completed frame's result, rejects
 * with QueuedCaptureFailed, QueuedCaptureStalled, or an AbortError when the
 * run is reset. The endpoint replays the terminal frame on reconnect, so a tab
 * that slept through the finish still gets it when it comes back.
 */
function followQueuedCapture(
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
      stall = setTimeout(
        () => settle(() => reject(new QueuedCaptureStalled())),
        SSE_STALL_TIMEOUT_MS,
      );
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
          settle(() => reject(new QueuedCaptureFailed(frame)));
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

interface HtmlToImageState {
  mode: "url" | "html";
  url: string;
  htmlContent: string;
  format: "jpg" | "png" | "webp";
  quality: number;
  fullPage: boolean;
  devicePreset: "desktop" | "tablet" | "mobile" | "custom";
  viewportWidth: number;
  viewportHeight: number;
  capturing: boolean;
  /** Percent from the job's progress stream once the server queued the capture. */
  progress: number | null;
  /** True once the server answered 202, so the capture can be canceled. */
  queued: boolean;
  resultUrl: string | null;
  resultSize: number | null;
  error: string | null;

  setMode: (mode: "url" | "html") => void;
  setUrl: (url: string) => void;
  setHtmlContent: (html: string) => void;
  setFormat: (format: "jpg" | "png" | "webp") => void;
  setQuality: (quality: number) => void;
  setFullPage: (fullPage: boolean) => void;
  setDevicePreset: (preset: "desktop" | "tablet" | "mobile" | "custom") => void;
  setViewportWidth: (width: number) => void;
  setViewportHeight: (height: number) => void;
  /** `t` words a failed answer (#1915); the store has no locale of its own. */
  capture: (t?: TranslationKeys) => Promise<void>;
  /** Stop a queued capture: closes its stream and cancels the server job. */
  cancel: () => void;
  reset: () => void;
}

const DEFAULTS = {
  mode: "url" as const,
  url: "",
  htmlContent: "",
  format: "png" as const,
  quality: 90,
  fullPage: false,
  devicePreset: "desktop" as const,
  viewportWidth: 1280,
  viewportHeight: 720,
  capturing: false,
  progress: null as number | null,
  queued: false,
  resultUrl: null as string | null,
  resultSize: null as number | null,
  error: null as string | null,
};

let captureController: AbortController | null = null;
let captureRunId = 0;
// The progress id of the capture the server queued, while it is running.
let queuedJobId: string | null = null;

/** Abort the current run and cancel its server job if the server queued one. */
function abortCurrentCapture() {
  captureRunId++;
  const controller = captureController;
  captureController = null;
  controller?.abort();
  if (queuedJobId) {
    void cancelAbandonedJob(queuedJobId, TOOL_ID);
    queuedJobId = null;
  }
}

export const useHtmlToImageStore = create<HtmlToImageState>((set, get) => ({
  ...DEFAULTS,

  setMode: (mode) => set({ mode, error: null }),
  setUrl: (url) => set({ url, error: null }),
  setHtmlContent: (htmlContent) => set({ htmlContent, error: null }),
  setFormat: (format) => set({ format }),
  setQuality: (quality) => set({ quality }),
  setFullPage: (fullPage) => set({ fullPage }),
  setDevicePreset: (devicePreset) => set({ devicePreset }),
  setViewportWidth: (viewportWidth) => set({ viewportWidth }),
  setViewportHeight: (viewportHeight) => set({ viewportHeight }),

  capture: async (t = en) => {
    const state = get();
    const hasInput = state.mode === "url" ? state.url : state.htmlContent;
    if (!hasInput || state.capturing) return;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "html-to-image",
      is_batch: false,
      file_count: 1,
    });

    captureController?.abort();
    const controller = new AbortController();
    captureController = controller;
    const runId = ++captureRunId;
    const isCurrent = () => runId === captureRunId && !controller.signal.aborted;

    set({
      capturing: true,
      progress: null,
      queued: false,
      error: null,
      resultUrl: null,
      resultSize: null,
    });
    // Names the job before the server answers. A 202 body names the stream to
    // follow; this id is the fallback when it doesn't.
    const clientJobId = safeRandomUUID();
    let followedJobId: string | null = null;

    try {
      const res = await fetch(appUrl("/api/v1/tools/image/html-to-image"), {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...(state.mode === "url" ? { url: state.url } : { html: state.htmlContent }),
          format: state.format,
          quality: state.quality,
          fullPage: state.fullPage,
          devicePreset: state.devicePreset,
          viewportWidth: state.viewportWidth,
          viewportHeight: state.viewportHeight,
          clientJobId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // A proxy's error page is not JSON; it still ends on the fallback.
        const body = await res.json().catch(() => null);
        if (!isCurrent()) return;
        set({
          error: failedAnswerMessage(t, body, res.status, "Capture failed"),
          capturing: false,
        });
        return;
      }

      let raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isCurrent()) return;

      // The capture outlasted the sync window: the server queued it and the
      // result arrives on the job's progress stream.
      if (res.status === 202) {
        followedJobId = acceptedJobId(raw) ?? clientJobId;
        queuedJobId = followedJobId;
        set({ queued: true });
        raw = await followQueuedCapture(followedJobId, controller.signal, (percent) => {
          if (isCurrent()) set({ progress: percent });
        });
        if (!isCurrent()) return;
      }
      const data = resolveServerUrls(raw);
      if (!isCaptureResponse(data)) {
        throw new Error(t.errors.invalidServerResponse);
      }

      set({
        resultUrl: data.downloadUrl,
        resultSize: data.processedSize ?? null,
        capturing: false,
      });
    } catch (err) {
      if (!isCurrent() || (err instanceof DOMException && err.name === "AbortError")) return;
      if (err instanceof QueuedCaptureFailed) {
        set({
          error: failedFrameMessage(err.frame, "Capture failed", t.errors.canceled),
          capturing: false,
        });
        return;
      }
      if (err instanceof QueuedCaptureStalled) {
        // The job may still be running with nobody left to collect it.
        if (followedJobId) void cancelAbandonedJob(followedJobId, TOOL_ID);
        set({ error: t.errors.jobTrackingFailed, capturing: false });
        return;
      }
      set({
        error: userErrorMessage(
          currentTranslations(),
          err,
          currentTranslations().errors.networkFailed,
        ),
        capturing: false,
      });
    } finally {
      if (captureController === controller) captureController = null;
      if (followedJobId && queuedJobId === followedJobId) queuedJobId = null;
      if (isCurrent()) set({ capturing: false, progress: null, queued: false });
    }
  },

  cancel: () => {
    abortCurrentCapture();
    set({ capturing: false, progress: null, queued: false });
  },

  reset: () => {
    abortCurrentCapture();
    set({ ...DEFAULTS });
  },
}));
