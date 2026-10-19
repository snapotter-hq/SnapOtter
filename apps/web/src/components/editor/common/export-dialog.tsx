import { appUrl, resolveServerUrls } from "@/lib/app-url";
// apps/web/src/components/editor/common/export-dialog.tsx

import {
  ANALYTICS_EVENTS,
  apiToolPath,
  type EditorExportedProperties,
  en,
  SafeError,
} from "@snapotter/shared";
import type Konva from "konva";
import {
  Check,
  ClipboardCopy,
  Download,
  FileDown,
  FileUp,
  Loader2,
  Lock,
  Save,
  Unlock,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type CurvePoint,
  type CurvesState,
  defaultCurvesState,
  defaultLevelsState,
  IDENTITY_LEVELS,
  type LevelsState,
  type LevelsValues,
  type ToneChannel,
} from "@/components/editor/adjustment-lut";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import {
  type CaptureFailure,
  type CaptureFailureMessages,
  captureDocumentCanvas,
  captureHasPixels,
  classifyCaptureError,
  reportCaptureFailure,
} from "@/components/editor/stage-capture";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { captureHandledError, track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { format } from "@/lib/format";
import {
  checkToolResult,
  frameFailure,
  type JobFailure,
  jobFailureMessage,
  MalformedResultError,
  type ProgressFrame,
  reportMalformedResult,
} from "@/lib/progress-frames";
import { cn, copyImageToClipboard } from "@/lib/utils";
import { isHexColor, useEditorStore } from "@/stores/editor-store";
import type {
  AdjustmentValues,
  CanvasObject,
  EditorLayer,
  FilterConfig,
  Guide,
} from "@/types/editor";

type ExportFormat = "png" | "jpeg" | "webp" | "avif" | "tiff" | "gif" | "jxl";

interface ExportSettings {
  format: ExportFormat;
  quality: number;
  width: number;
  height: number;
  lockAspect: boolean;
  transparent: boolean;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  supportsTransparency: boolean;
  needsServerConvert: boolean;
}[] = [
  { value: "png", label: "PNG", supportsTransparency: true, needsServerConvert: false },
  { value: "jpeg", label: "JPEG", supportsTransparency: false, needsServerConvert: false },
  { value: "webp", label: "WebP", supportsTransparency: true, needsServerConvert: false },
  { value: "avif", label: "AVIF", supportsTransparency: true, needsServerConvert: true },
  { value: "tiff", label: "TIFF", supportsTransparency: true, needsServerConvert: true },
  { value: "gif", label: "GIF", supportsTransparency: true, needsServerConvert: true },
  { value: "jxl", label: "JXL", supportsTransparency: true, needsServerConvert: true },
];

// A capture whose width or height rounds to 0 px throws InvalidStateError. The 200 px
// thumbnail of a very wide or tall document asks for exactly that (on 40000x100 the
// short side would be 0.5 px), so never ask for less than 1 px on the shorter side.
function atLeastOnePixel(ratio: number, width: number, height: number): number {
  return Math.max(ratio, 1 / Math.min(width, height));
}

function getMimeType(format: ExportFormat): string {
  const mimes: Record<ExportFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    avif: "image/avif",
    tiff: "image/tiff",
    gif: "image/gif",
    jxl: "image/jxl",
  };
  return mimes[format];
}

// How long the size estimate waits after the last change before it captures and
// encodes the whole document again. On every keystroke it cost a full render and
// captured half-typed sizes (#2174). The 200 px thumbnail stays immediate.
const ESTIMATE_DEBOUNCE_MS = 300;
const SSE_STALL_TIMEOUT_MS = 5 * 60_000;

type ExportFailureReason = NonNullable<EditorExportedProperties["reason"]>;

/** A result checkToolResult passed: it always carries a download URL. */
type ConvertResult = Record<string, unknown> & { downloadUrl: string };

interface ProgressHandlers {
  onProgress?: (percent: number) => void;
  onComplete: (result: ConvertResult) => void;
  onFailed: (failure: JobFailure) => void;
  onStall: () => void;
}

/** A live progress subscription. */
export interface ProgressSubscription {
  /** End it: close the stream and drop the stall timer. Safe to call twice. */
  stop: () => void;
  /** Count something outside the stream as a sign of life and restart the stall timer. */
  touch: () => void;
  /** Whether the initial EventSource connection was created without throwing. */
  opened: boolean;
}

/**
 * Subscribe to async (202) server-convert job progress (#2171). Reconnects on
 * tab refocus (the progress endpoint replays the terminal frame from Redis and,
 * after that cache expires, from the durable job record) and arms a stall
 * timeout so a wedged job fails with a message instead of leaving the dialog
 * stuck.
 */
export function subscribeExportJobProgress(
  jobId: string,
  handlers: ProgressHandlers,
  toolId = "editor-export",
): ProgressSubscription {
  let es: EventSource | null = null;
  let stall: ReturnType<typeof setTimeout> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const onVisible = () => {
    if (done || document.visibilityState !== "visible") return;
    if (es && es.readyState === EventSource.OPEN) return;
    if (reconnect) clearTimeout(reconnect);
    reconnect = setTimeout(() => {
      reconnect = null;
      open();
    }, 500);
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    if (stall) clearTimeout(stall);
    stall = null;
    if (reconnect) clearTimeout(reconnect);
    reconnect = null;
    if (es) es.close();
    es = null;
    document.removeEventListener("visibilitychange", onVisible);
  };

  const resetStall = () => {
    if (done) return;
    if (stall) clearTimeout(stall);
    stall = setTimeout(() => {
      cleanup();
      handlers.onStall();
    }, SSE_STALL_TIMEOUT_MS);
  };

  function open() {
    if (done) return;
    if (es && es.readyState === EventSource.OPEN) return;
    if (es) es.close();
    try {
      es = new EventSource(appUrl(`/api/v1/jobs/${jobId}/progress`));
    } catch {
      return;
    }
    es.onmessage = (event) => {
      let data: ProgressFrame;
      try {
        data = resolveServerUrls(JSON.parse(event.data));
      } catch {
        return;
      }
      let completed: ConvertResult | null = null;
      if (data.type === "single" && data.phase === "complete") {
        try {
          completed = checkToolResult<ConvertResult>(data.result);
        } catch (err) {
          cleanup();
          reportMalformedResult(err, { toolId });
          handlers.onFailed({ reason: "invalidResponse" });
          return;
        }
      }
      try {
        if (data.type === "heartbeat") {
          resetStall();
          return;
        }
        if (data.type !== "single") return;
        resetStall();
        if (completed) {
          cleanup();
          handlers.onComplete(completed);
          return;
        }
        if (data.phase === "failed") {
          cleanup();
          handlers.onFailed(frameFailure(data.error, data.details));
          return;
        }
        if (typeof data.percent === "number") handlers.onProgress?.(data.percent);
      } catch (err) {
        cleanup();
        try {
          handlers.onFailed({ reason: "trackingFailed" });
        } catch {
          // onFailed may be what threw; the original error is rethrown below.
        }
        throw err;
      }
    };
    es.onerror = () => {};
  }

  document.addEventListener("visibilitychange", onVisible);
  open();
  resetStall();
  return { stop: cleanup, touch: resetStall, opened: es !== null };
}

// The canvas the file is made from: exactly `width` x `height` (at least 1 px a
// side), on white unless the format keeps transparency. The two axes scale on their
// own once the aspect lock is off (#2174): the document is captured at the larger of
// the two ratios, so neither axis is upsampled, then drawn into the requested size.
// A capture that already is that size, for a format that keeps transparency, is used
// as it is. Null means the browser can't back a canvas that big; a capture or encode
// that fails on size throws, and classifyCaptureError tells the two kinds apart.
function renderExportCanvas(
  stage: Konva.Stage,
  canvasSize: { width: number; height: number },
  settings: Pick<ExportSettings, "width" | "height" | "format" | "transparent">,
): HTMLCanvasElement | null {
  const width = Math.max(1, Math.round(settings.width));
  const height = Math.max(1, Math.round(settings.height));
  const captured = captureDocumentCanvas(
    stage,
    canvasSize.width,
    canvasSize.height,
    Math.max(width / canvasSize.width, height / canvasSize.height),
  );
  const opaque = !settings.transparent || settings.format === "jpeg";
  if (!opaque && captured.width === width && captured.height === height) return captured;
  // With the lock off the capture can be much bigger than the file. Past the browser's
  // limit it still comes back and draws nothing, so the file built from it would encode
  // fine but blank, slipping past the "data:," check (#2140).
  if (!captureHasPixels(captured)) return null;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(captured, 0, 0, width, height);
  return out;
}

// The encoded size, read off the data URL's base64 payload (to within the two bytes of
// padding, which a label in KB never shows). No fetch, so an estimate that started
// earlier can't land after a newer one.
function dataUrlBytes(dataUrl: string): number {
  return Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
}

// A tainted or over-limit canvas can't be encoded. The preview just goes blank;
// Export and Copy are where the user is told why. Anything else is a bug and is
// reported, never rethrown: a throw would reach the route ErrorBoundary from a
// passive effect (#2140).
function reportPreviewFailure(err: unknown): void {
  if (classifyCaptureError(err)) return;
  console.error("Export preview failed:", err);
  void captureHandledError(
    new SafeError("Could not render the export preview", { kind: "bug", cause: err }),
    { error_class: "bug", tool_id: "editor-export" },
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const markClean = useEditorStore((s) => s.markClean);

  const [settings, setSettings] = useState<ExportSettings>({
    format: "png",
    quality: 92,
    width: canvasSize.width,
    height: canvasSize.height,
    lockAspect: true,
    transparent: true,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const stopExportRef = useRef<() => void>(() => {});
  const stopLoadRef = useRef<() => void>(() => {});
  const later = useTimeouts();

  useEffect(
    () => () => {
      stopExportRef.current();
      stopLoadRef.current();
    },
    [],
  );

  const aspectRatio = canvasSize.width / canvasSize.height;
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleUnexpectedError = useCallback(
    (err: unknown) => {
      toast.error(t.editor.ui.exportDialog.exportFailed);
      void captureHandledError(new SafeError("Editor export failed", { kind: "bug", cause: err }), {
        error_class: "bug",
        tool_id: "editor-export",
      });
    },
    [t],
  );

  // For server-convert formats the Canvas API cannot produce a preview, so the
  // thumbnail and the estimate fall back to PNG.
  const previewMime = useMemo(() => {
    const option = FORMAT_OPTIONS.find((o) => o.value === settings.format);
    return option?.needsServerConvert ? "image/png" : getMimeType(settings.format);
  }, [settings.format]);

  // The 200 px thumbnail is cheap, so it follows format and quality at once.
  useEffect(() => {
    const stage = editorStageRefHolder.current;
    if (!stage) return;
    const maxPreview = 200;
    const scale = atLeastOnePixel(
      Math.min(maxPreview / canvasSize.width, maxPreview / canvasSize.height),
      canvasSize.width,
      canvasSize.height,
    );
    let url: string;
    try {
      url = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height, scale).toDataURL(
        previewMime,
        settings.quality / 100,
      );
    } catch (err) {
      reportPreviewFailure(err);
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(url === "data:," ? null : url);
  }, [canvasSize, previewMime, settings.quality]);

  // The size estimate renders and encodes the whole document at the requested size.
  // The first one shows with the dialog; after that it waits until the settings have
  // stopped changing (#2174).
  const estimatedOnce = useRef(false);
  useEffect(() => {
    const estimate = () => {
      const stage = editorStageRefHolder.current;
      if (!stage) return;
      let fullUrl: string;
      try {
        const canvas = renderExportCanvas(stage, canvasSize, {
          width: settings.width,
          height: settings.height,
          format: settings.format,
          transparent: settings.transparent,
        });
        fullUrl = canvas ? canvas.toDataURL(previewMime, settings.quality / 100) : "data:,";
      } catch (err) {
        reportPreviewFailure(err);
        setEstimatedSize(null);
        return;
      }
      setEstimatedSize(fullUrl === "data:," ? null : dataUrlBytes(fullUrl));
    };
    if (!estimatedOnce.current) {
      estimatedOnce.current = true;
      estimate();
      return;
    }
    later(estimate, ESTIMATE_DEBOUNCE_MS, "estimate");
  }, [
    later,
    canvasSize,
    previewMime,
    settings.width,
    settings.height,
    settings.format,
    settings.transparent,
    settings.quality,
  ]);

  // Width and height follow each other while the lock is on. The derived side never
  // rounds below 1 px: a 1 px width on a wide document used to make the height 0.
  const handleWidthChange = useCallback(
    (w: number) => {
      const width = Math.max(1, w);
      setSettings((prev) =>
        prev.lockAspect
          ? { ...prev, width, height: Math.max(1, Math.round(width / aspectRatio)) }
          : { ...prev, width },
      );
    },
    [aspectRatio],
  );

  const handleHeightChange = useCallback(
    (h: number) => {
      const height = Math.max(1, h);
      setSettings((prev) =>
        prev.lockAspect
          ? { ...prev, height, width: Math.max(1, Math.round(height * aspectRatio)) }
          : { ...prev, height },
      );
    },
    [aspectRatio],
  );

  const captureMessages = useMemo<CaptureFailureMessages>(
    () => ({
      noCanvasMemory: t.editor.ui.exportDialog.tooLarge,
      crossOriginBlocked: t.editor.ui.captureFailure.crossOriginBlocked,
    }),
    [t],
  );

  // Past the browser's canvas limit Chromium and WebKit still hand out a canvas,
  // but toDataURL() answers "data:," and toBlob() answers null or an empty blob.
  // Saying so beats downloading an empty file and marking the document saved (#2140).
  const reportEmptyExport = useCallback(() => {
    reportCaptureFailure("no-context", captureMessages);
  }, [captureMessages]);

  // Run a capture-and-encode step. A tainted or over-limit canvas is reported to
  // the user and answered as the reason; any other error is reported as a bug.
  const guardCapture = useCallback(
    (step: () => void): CaptureFailure | "bug" | null => {
      try {
        step();
        return null;
      } catch (err) {
        const reason = classifyCaptureError(err);
        if (!reason) {
          handleUnexpectedError(err);
          return "bug";
        }
        reportCaptureFailure(reason, captureMessages);
        return reason;
      }
    },
    [captureMessages, handleUnexpectedError],
  );

  // Export through the Konva stage. editor_exported is sent once per attempt, when
  // the outcome is known (#2174): it used to fire on the click, so a canvas the
  // browser couldn't encode or a server error still counted as an export.
  const handleExport = useCallback(() => {
    if (exportingRef.current) return;
    let reported = false;
    const report = (status: "completed" | "failed", reason?: ExportFailureReason) => {
      if (reported) return;
      reported = true;
      const properties = {
        output_format: settings.format,
        status,
        ...(reason ? { reason } : {}),
      } satisfies EditorExportedProperties;
      track(ANALYTICS_EVENTS.EDITOR_EXPORTED, properties);
    };
    const stage = editorStageRefHolder.current;
    if (!stage) {
      report("failed", "no-stage");
      return;
    }
    const download = (href: string) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = `export.${settings.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      markClean();
      report("completed");
    };
    const finishExport = () => {
      exportingRef.current = false;
      setExporting(false);
    };
    const formatOption = FORMAT_OPTIONS.find((o) => o.value === settings.format);

    const failure = guardCapture(() => {
      const canvas = renderExportCanvas(stage, canvasSize, settings);
      if (!canvas) {
        reportEmptyExport();
        report("failed", "no-context");
        return;
      }

      // Formats the Canvas API cannot encode go to the server as PNG.
      if (formatOption?.needsServerConvert) {
        exportingRef.current = true;
        setExporting(true);
        const controller = new AbortController();
        let stopped = false;
        stopExportRef.current = () => {
          stopped = true;
          exportingRef.current = false;
          controller.abort();
          report("failed", "server-pending");
        };
        try {
          canvas.toBlob(async (blob) => {
            if (stopped) return;
            if (!blob || blob.size === 0) {
              stopExportRef.current = () => {};
              finishExport();
              reportEmptyExport();
              report("failed", "no-context");
              return;
            }
            const formData = new FormData();
            formData.append("file", blob, "export.png");
            formData.append(
              "settings",
              JSON.stringify({ format: settings.format, quality: settings.quality }),
            );
            let res: Response;
            try {
              res = await fetch(appUrl(apiToolPath("convert")), {
                method: "POST",
                headers: formatHeaders(),
                body: formData,
                signal: controller.signal,
              });
            } catch (err) {
              if (stopped) return;
              stopExportRef.current = () => {};
              finishExport();
              console.error("Server-side export failed:", err);
              toast.error(t.editor.ui.exportDialog.exportFailed);
              void captureHandledError(
                new SafeError("Server-side export request failed", {
                  kind: "operational",
                  cause: err,
                }),
                { error_class: "operational", tool_id: "editor-export" },
              );
              report("failed", "server-convert");
              return;
            }
            if (stopped) return;

            if (!res.ok) {
              const body =
                typeof res.json === "function" ? await res.json().catch(() => null) : null;
              if (stopped) return;
              stopExportRef.current = () => {};
              finishExport();
              const message = failedAnswerMessage(
                t,
                body,
                res.status,
                t.editor.ui.exportDialog.exportFailed,
              );
              console.error("Server-side export failed:", res.status, body);
              toast.error(message);
              void captureHandledError(
                new SafeError("Server-side export failed", {
                  kind: "operational",
                  statusCode: res.status,
                }),
                { error_class: "operational", tool_id: "editor-export" },
              );
              report("failed", "server-convert");
              return;
            }

            let rawBody: unknown;
            try {
              rawBody = resolveServerUrls(await res.json());
            } catch (err) {
              if (stopped) return;
              stopExportRef.current = () => {};
              finishExport();
              console.error("Server-side export failed:", err);
              reportMalformedResult(new MalformedResultError("notAnObject"), {
                status: res.status,
                toolId: "editor-export",
              });
              toast.error(t.errors.invalidResponse);
              report("failed", "server-convert");
              return;
            }
            if (stopped) return;

            const isAsyncAccepted =
              res.status === 202 ||
              (typeof rawBody === "object" &&
                rawBody !== null &&
                !Array.isArray(rawBody) &&
                (rawBody as Record<string, unknown>).async === true);

            if (isAsyncAccepted) {
              const jobId =
                typeof (rawBody as Record<string, unknown> | null)?.jobId === "string"
                  ? ((rawBody as Record<string, unknown>).jobId as string)
                  : "";
              if (!jobId) {
                stopExportRef.current = () => {};
                finishExport();
                console.error("Server-side export answered 202 without a jobId");
                reportMalformedResult(new MalformedResultError("missingResultField"), {
                  status: res.status,
                  toolId: "editor-export",
                });
                toast.error(t.errors.invalidResponse);
                report("failed", "server-convert");
                return;
              }
              if (typeof EventSource !== "function") {
                stopExportRef.current = () => {};
                finishExport();
                console.error("Server-side export answered before the file was ready");
                toast.error(t.editor.ui.exportDialog.exportFailed);
                void captureHandledError(
                  new SafeError("Server-side export progress stream unavailable", {
                    kind: "operational",
                  }),
                  { error_class: "operational", tool_id: "editor-export" },
                );
                report("failed", "server-pending");
                return;
              }
              let failedOnce = false;
              const subscription = subscribeExportJobProgress(jobId, {
                onComplete: (result) => {
                  stopExportRef.current = () => {};
                  finishExport();
                  download(result.downloadUrl);
                },
                onFailed: (failure) => {
                  if (failedOnce) return;
                  failedOnce = true;
                  stopExportRef.current = () => {};
                  finishExport();
                  const isTrackingBug = "reason" in failure && failure.reason === "trackingFailed";
                  console.error("Server-side export failed:", failure);
                  toast.error(jobFailureMessage(failure, t.errors));
                  if (isTrackingBug) {
                    void captureHandledError(
                      new SafeError("Editor export failed", { kind: "bug" }),
                      {
                        error_class: "bug",
                        tool_id: "editor-export",
                      },
                    );
                  }
                  report("failed", isTrackingBug ? "bug" : "server-convert");
                },
                onStall: () => {
                  stopExportRef.current = () => {};
                  finishExport();
                  toast.error(t.errors.timeout);
                  void captureHandledError(
                    new SafeError("Server-side export timed out waiting for job progress", {
                      kind: "operational",
                    }),
                    { error_class: "operational", tool_id: "editor-export" },
                  );
                  report("failed", "server-pending");
                },
              });
              if (!subscription.opened) {
                subscription.stop();
                stopExportRef.current = () => {};
                finishExport();
                console.error("Server-side export answered before the file was ready");
                toast.error(t.editor.ui.exportDialog.exportFailed);
                void captureHandledError(
                  new SafeError("Server-side export progress stream unavailable", {
                    kind: "operational",
                  }),
                  { error_class: "operational", tool_id: "editor-export" },
                );
                report("failed", "server-pending");
                return;
              }
              stopExportRef.current = () => {
                stopped = true;
                exportingRef.current = false;
                subscription.stop();
                report("failed", "server-pending");
              };
              return;
            }

            let result: ConvertResult;
            try {
              result = checkToolResult<ConvertResult>(rawBody);
            } catch (err) {
              stopExportRef.current = () => {};
              finishExport();
              console.error("Server-side export returned no download URL");
              reportMalformedResult(err, { status: res.status, toolId: "editor-export" });
              toast.error(t.errors.invalidResponse);
              report("failed", "server-convert");
              return;
            }
            stopExportRef.current = () => {};
            finishExport();
            try {
              download(result.downloadUrl);
            } catch (err) {
              console.error("Server-side export failed:", err);
              handleUnexpectedError(err);
              report("failed", "bug");
            }
          }, "image/png");
        } catch (err) {
          stopExportRef.current = () => {};
          finishExport();
          throw err;
        }
        return;
      }

      const dataUrl = canvas.toDataURL(
        getMimeType(settings.format),
        settings.format === "png" ? undefined : settings.quality / 100,
      );
      if (dataUrl === "data:,") {
        reportEmptyExport();
        report("failed", "no-context");
        return;
      }
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => {
          if (blob.size === 0) {
            reportEmptyExport();
            report("failed", "no-context");
            return;
          }
          const url = URL.createObjectURL(blob);
          download(url);
          URL.revokeObjectURL(url);
        })
        .catch((err) => {
          console.error("Export failed:", err);
          handleUnexpectedError(err);
          report("failed", "download");
        });
    });
    if (failure) report("failed", failure);
  }, [settings, canvasSize, markClean, reportEmptyExport, guardCapture, handleUnexpectedError, t]);

  // Copy a transparent PNG at the requested size through the Konva stage.
  const handleCopyToClipboard = useCallback(async () => {
    const stage = editorStageRefHolder.current;
    if (!stage) return;

    let dataUrl = "";
    const failure = guardCapture(() => {
      const canvas = renderExportCanvas(stage, canvasSize, {
        width: settings.width,
        height: settings.height,
        format: "png",
        transparent: true,
      });
      dataUrl = canvas ? canvas.toDataURL("image/png") : "data:,";
    });
    if (failure || dataUrl === "data:,") {
      // An over-limit canvas copies as an empty image while the button says copied.
      if (!failure) reportEmptyExport();
      setCopyStatus("failed");
      later(() => setCopyStatus("idle"), 2000, "copyStatus");
      return;
    }

    const blobPromise = (async () => {
      const res = await fetch(dataUrl);
      return await res.blob();
    })();
    blobPromise.catch(() => {});
    // Pass the blob promise without awaiting it first so navigator.clipboard.write
    // starts synchronously inside WebKit's user gesture (#1979). Image copy has no
    // fallback on plain-http installs (no ClipboardItem there), so failure gets
    // surfaced on the button instead of thrown.
    setCopyStatus((await copyImageToClipboard(blobPromise)) ? "copied" : "failed");
    later(() => setCopyStatus("idle"), 2000, "copyStatus");
  }, [settings, canvasSize, later, guardCapture, reportEmptyExport]);

  // Project save (.snapotter file)
  const handleSaveProject = useCallback(async () => {
    try {
      const state = useEditorStore.getState();
      const projectData = {
        version: 1,
        ...(await serializeEditorState(state)),
      };

      const json = JSON.stringify(projectData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project.snapotter";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (useEditorStore.getState()._historyVersion === state._historyVersion) {
        markClean();
      }
    } catch (err) {
      console.error("Save project failed:", err);
      handleUnexpectedError(err);
    }
  }, [markClean, handleUnexpectedError]);

  // Project load (.snapotter file)
  const handleLoadProject = useCallback(() => {
    setLoadError(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".snapotter,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      stopLoadRef.current();
      let cancelled = false;
      const reader = new FileReader();
      stopLoadRef.current = () => {
        cancelled = true;
        try {
          reader.abort();
        } catch {
          // ignore abort errors
        }
      };
      const failLoad = (err: unknown) => {
        if (cancelled) return;
        stopLoadRef.current = () => {};
        console.debug("Failed to load project file:", err);
        setLoadError(t.editor.ui.exportDialog.invalidProject);
        toast.error(t.editor.ui.exportDialog.invalidProject);
      };
      reader.onerror = () => {
        failLoad(reader.error ?? new Error("FileReader failed to read project file"));
      };
      reader.onload = () => {
        if (cancelled) return;
        stopLoadRef.current = () => {};
        if (typeof reader.result !== "string") {
          failLoad(new Error("FileReader result was not a string"));
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(reader.result);
        } catch (err) {
          failLoad(err);
          return;
        }
        if (!isValidProjectData(data)) {
          failLoad(new Error("Project JSON failed structural validation"));
          return;
        }

        try {
          const store = useEditorStore.getState();
          const setState = useEditorStore.setState;
          const layers = data.layers || store.layers;
          const activeLayerId = layers.some((l) => l.id === store.activeLayerId)
            ? store.activeLayerId
            : (layers[0]?.id ?? store.activeLayerId);
          const adjustments = data.adjustments
            ? { ...store.adjustments, ...data.adjustments }
            : store.adjustments;
          const filters = data.filters
            ? store.filters.map((existing) => {
                const match = data.filters?.find((f) => f.type === existing.type);
                return match
                  ? {
                      ...existing,
                      enabled: match.enabled,
                      params: { ...existing.params, ...match.params },
                    }
                  : existing;
              })
            : store.filters;
          const levels = resolveLoadedLevels(data.levels);
          const curves = resolveLoadedCurves(data.curves);

          setState({
            canvasSize: data.canvasSize,
            layers,
            activeLayerId,
            objects: data.objects || [],
            adjustments,
            filters,
            levels,
            curves,
            guides: data.guides || [],
            sourceImageUrl: data.sourceImageUrl || null,
            sourceImageSize: data.sourceImageSize || null,
            foregroundColor: data.foregroundColor || "#000000",
            backgroundColor: data.backgroundColor || "#ffffff",
            selection: null,
            cropState: null,
            isCropping: false,
            editingTextId: null,
            selectedObjectIds: [],
            clipboard: null,
            lastAction: { id: "loadProject" },
            _historyVersion: store._historyVersion + 1,
          });

          onClose();
        } catch (err) {
          console.error("Load project failed:", err);
          handleUnexpectedError(err);
        }
      };
      try {
        reader.readAsText(file);
      } catch (err) {
        failLoad(err);
      }
    };
    input.click();
  }, [onClose, t, handleUnexpectedError]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const supportsQuality = settings.format !== "png";
  const supportsTransparency = settings.format !== "jpeg";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop click-to-dismiss uses Escape as keyboard equivalent
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {t.editor.ui.exportDialog.heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            aria-label={t.common.close}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Preview */}
          {previewUrl && (
            <div className="flex justify-center p-2 bg-muted/30 rounded border border-border">
              <img
                src={previewUrl}
                alt={t.editor.ui.exportDialog.previewAlt}
                className="max-h-[120px] object-contain rounded"
              />
              {estimatedSize !== null && (
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  ~
                  {estimatedSize < 1024 * 1024
                    ? `${(estimatedSize / 1024).toFixed(0)} KB`
                    : `${(estimatedSize / (1024 * 1024)).toFixed(1)} MB`}
                </p>
              )}
            </div>
          )}

          {/* Format */}
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t.editor.ui.exportDialog.format}
            </span>
            <div className="flex gap-1">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      format: opt.value,
                      transparent: opt.supportsTransparency ? prev.transparent : false,
                    }))
                  }
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded transition-colors",
                    settings.format === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quality */}
          {supportsQuality && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.editor.ui.exportDialog.quality}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {settings.quality}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={settings.quality}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, quality: Number.parseInt(e.target.value, 10) }))
                }
                className={cn(
                  "w-full h-1.5 appearance-none rounded-full bg-muted",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3",
                  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
                )}
              />
            </div>
          )}

          {/* Dimensions */}
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t.editor.ui.exportDialog.dimensions}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={settings.width}
                  onChange={(e) => handleWidthChange(Number.parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 text-xs bg-muted rounded border border-border text-foreground outline-none focus:border-ring"
                  min={1}
                />
                <span className="text-[10px] text-muted-foreground">
                  {t.editor.ui.exportDialog.width}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, lockAspect: !prev.lockAspect }))}
                className={cn(
                  "p-1 rounded transition-colors mt-[-12px]",
                  settings.lockAspect
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={
                  settings.lockAspect ? t.editor.ui.unlockAspectRatio : t.editor.ui.lockAspectRatio
                }
              >
                {settings.lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <div className="flex-1">
                <input
                  type="number"
                  value={settings.height}
                  onChange={(e) => handleHeightChange(Number.parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 text-xs bg-muted rounded border border-border text-foreground outline-none focus:border-ring"
                  min={1}
                />
                <span className="text-[10px] text-muted-foreground">
                  {t.editor.ui.exportDialog.height}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  width: canvasSize.width,
                  height: canvasSize.height,
                }))
              }
              className="mt-1 text-[10px] text-primary-ink hover:underline"
            >
              {format(t.editor.ui.exportDialog.resetToOriginalSize, {
                width: canvasSize.width,
                height: canvasSize.height,
              })}
            </button>
          </div>

          {/* Transparent background */}
          {supportsTransparency && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.transparent}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, transparent: e.target.checked }))
                }
                className="rounded border-border"
              />
              <span className="text-xs text-foreground">
                {t.editor.ui.exportDialog.transparentBackground}
              </span>
            </label>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 px-4 pb-4">
          {/* Primary export actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {t.editor.ui.exportDialog.exportButton}
            </button>
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
            >
              {copyStatus === "copied" ? <Check size={14} /> : <ClipboardCopy size={14} />}
              {copyStatus === "copied"
                ? t.editor.ui.exportDialog.copied
                : copyStatus === "failed"
                  ? t.editor.ui.exportDialog.copyFailed
                  : t.common.copy}
            </button>
          </div>

          {/* Project save/load */}
          <div className="flex gap-2 pt-1 border-t border-border mt-1">
            <button
              type="button"
              onClick={handleSaveProject}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileDown size={12} />
              {t.editor.ui.exportDialog.saveProject}
            </button>
            <button
              type="button"
              onClick={handleLoadProject}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileUp size={12} />
              {t.editor.ui.exportDialog.loadProject}
            </button>
          </div>
          {loadError && (
            <p role="alert" className="text-xs text-destructive-ink text-center">
              {loadError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Autosave utilities (Feature 44) ----

function isValidDimensions(size: unknown): size is { width: number; height: number } {
  if (typeof size !== "object" || size === null) return false;
  const { width, height } = size as { width?: unknown; height?: unknown };
  return (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidLayer(layer: unknown): boolean {
  if (!isPlainRecord(layer)) return false;
  return (
    typeof layer.id === "string" &&
    layer.id.length > 0 &&
    typeof layer.name === "string" &&
    typeof layer.visible === "boolean" &&
    typeof layer.locked === "boolean" &&
    typeof layer.opacity === "number" &&
    Number.isFinite(layer.opacity) &&
    layer.opacity >= 0 &&
    layer.opacity <= 1 &&
    typeof layer.blendMode === "string"
  );
}

function isValidCanvasObject(obj: unknown): boolean {
  if (!isPlainRecord(obj)) return false;
  return (
    typeof obj.id === "string" &&
    obj.id.length > 0 &&
    typeof obj.type === "string" &&
    obj.type.length > 0 &&
    typeof obj.layerId === "string" &&
    obj.layerId.length > 0 &&
    isPlainRecord(obj.attrs)
  );
}

function isValidFilterConfig(filter: unknown): boolean {
  if (!isPlainRecord(filter)) return false;
  return (
    typeof filter.type === "string" &&
    filter.type.length > 0 &&
    typeof filter.enabled === "boolean" &&
    isPlainRecord(filter.params) &&
    Object.values(filter.params).every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function isValidGuide(guide: unknown): boolean {
  if (!isPlainRecord(guide)) return false;
  return (
    typeof guide.id === "string" &&
    guide.id.length > 0 &&
    (guide.orientation === "horizontal" || guide.orientation === "vertical") &&
    typeof guide.position === "number" &&
    Number.isFinite(guide.position)
  );
}

const TONE_CHANNELS: readonly ToneChannel[] = ["rgb", "red", "green", "blue"];
const LEVELS_VALUE_KEYS: readonly (keyof LevelsValues)[] = [
  "blackPoint",
  "whitePoint",
  "gamma",
  "outBlack",
  "outWhite",
];

function isValidLevelsChannel(value: unknown): value is Partial<LevelsValues> {
  if (!isPlainRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (!LEVELS_VALUE_KEYS.includes(key as keyof LevelsValues)) return false;
    const v = value[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  const merged: LevelsValues = {
    ...IDENTITY_LEVELS,
    ...(value as Partial<LevelsValues>),
  };
  return (
    merged.blackPoint >= 0 &&
    merged.blackPoint < merged.whitePoint &&
    merged.whitePoint <= 255 &&
    merged.gamma >= 0.01 &&
    merged.gamma <= 10 &&
    merged.outBlack >= 0 &&
    merged.outBlack <= merged.outWhite &&
    merged.outWhite <= 255
  );
}

function isValidLevels(levels: unknown): boolean {
  if (!isPlainRecord(levels)) return false;
  return Object.entries(levels).every(
    ([channel, val]) => TONE_CHANNELS.includes(channel as ToneChannel) && isValidLevelsChannel(val),
  );
}

function isValidCurvePoint(pt: unknown): pt is CurvePoint {
  if (!isPlainRecord(pt)) return false;
  return (
    typeof pt.x === "number" &&
    Number.isFinite(pt.x) &&
    pt.x >= 0 &&
    pt.x <= 255 &&
    typeof pt.y === "number" &&
    Number.isFinite(pt.y) &&
    pt.y >= 0 &&
    pt.y <= 255
  );
}

function isValidCurveChannel(pts: unknown): pts is CurvePoint[] {
  if (!Array.isArray(pts) || pts.length < 2 || !pts.every(isValidCurvePoint)) {
    return false;
  }
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x <= sorted[i - 1].x) return false;
  }
  return true;
}

function isValidCurves(curves: unknown): boolean {
  if (!isPlainRecord(curves)) return false;
  return Object.entries(curves).every(
    ([channel, pts]) => TONE_CHANNELS.includes(channel as ToneChannel) && isValidCurveChannel(pts),
  );
}

function resolveLoadedLevels(raw: Partial<LevelsState> | undefined): LevelsState {
  const base = defaultLevelsState();
  if (!isPlainRecord(raw)) return base;
  for (const channel of TONE_CHANNELS) {
    const chVal = raw[channel];
    if (isValidLevelsChannel(chVal)) {
      base[channel] = { ...base[channel], ...chVal };
    }
  }
  return base;
}

function resolveLoadedCurves(raw: Partial<CurvesState> | undefined): CurvesState {
  const base = defaultCurvesState();
  if (!isPlainRecord(raw)) return base;
  for (const channel of TONE_CHANNELS) {
    const pts = raw[channel];
    if (isValidCurveChannel(pts)) {
      base[channel] = [...pts].sort((a, b) => a.x - b.x).map((p) => ({ x: p.x, y: p.y }));
    }
  }
  return base;
}

function isValidProjectData(data: unknown): data is Partial<AutosaveState> & {
  version: number;
  canvasSize: { width: number; height: number };
} {
  if (!isPlainRecord(data)) return false;
  if (data.version !== 1) return false;
  if (!isValidDimensions(data.canvasSize)) return false;
  if (
    data.layers !== undefined &&
    (!Array.isArray(data.layers) || data.layers.length === 0 || !data.layers.every(isValidLayer))
  ) {
    return false;
  }
  if (
    data.objects !== undefined &&
    (!Array.isArray(data.objects) || !data.objects.every(isValidCanvasObject))
  ) {
    return false;
  }
  if (
    data.filters !== undefined &&
    (!Array.isArray(data.filters) || !data.filters.every(isValidFilterConfig))
  ) {
    return false;
  }
  if (
    data.guides !== undefined &&
    (!Array.isArray(data.guides) || !data.guides.every(isValidGuide))
  ) {
    return false;
  }
  if (
    data.adjustments !== undefined &&
    (!isPlainRecord(data.adjustments) ||
      !Object.values(data.adjustments).every((v) => typeof v === "number" && Number.isFinite(v)))
  ) {
    return false;
  }
  if (data.levels !== undefined && !isValidLevels(data.levels)) {
    return false;
  }
  if (data.curves !== undefined && !isValidCurves(data.curves)) {
    return false;
  }
  if (
    data.sourceImageUrl !== undefined &&
    data.sourceImageUrl !== null &&
    typeof data.sourceImageUrl !== "string"
  ) {
    return false;
  }
  if (
    data.sourceImageSize !== undefined &&
    data.sourceImageSize !== null &&
    !isValidDimensions(data.sourceImageSize)
  ) {
    return false;
  }
  if (
    data.foregroundColor !== undefined &&
    (typeof data.foregroundColor !== "string" || !isHexColor(data.foregroundColor))
  ) {
    return false;
  }
  if (
    data.backgroundColor !== undefined &&
    (typeof data.backgroundColor !== "string" || !isHexColor(data.backgroundColor))
  ) {
    return false;
  }
  return true;
}

const AUTOSAVE_KEY = "snapotter-editor-autosave";
const AUTOSAVE_DB_NAME = "snapotter-editor-autosave";
const AUTOSAVE_DB_VERSION = 1;
const AUTOSAVE_STORE_NAME = "blobs";
const AUTOSAVE_IDB_SOURCE_URL = "idb://snapotter-editor-autosave/source";
const AUTOSAVE_IDB_OBJECT_PREFIX = "idb://snapotter-editor-autosave/object/";
const AUTOSAVE_INTERVAL_MS = 60_000;

let autosaveFailureReported = false;
let activeSaveRunId = 0;
let pendingManualSaveOptions: SaveEditorStateOptions | null = null;

export interface SaveEditorStateOptions {
  manual?: boolean;
  errorMessage?: string;
}

interface AutosaveState {
  canvasSize: { width: number; height: number };
  layers: EditorLayer[];
  objects: CanvasObject[];
  adjustments: AdjustmentValues;
  filters: FilterConfig[];
  levels: LevelsState;
  curves: CurvesState;
  guides: Guide[];
  sourceImageUrl: string | null;
  sourceImageSize: { width: number; height: number } | null;
  foregroundColor: string;
  backgroundColor: string;
}

interface AutosaveData {
  version: 1;
  timestamp: number;
  state: AutosaveState;
}

// The canvas a brush paints into mid-stroke lives in attrs.image. It serialises as
// `{}`, which a restored object would then try to draw.
function withoutLiveStroke(obj: CanvasObject): CanvasObject {
  if (obj.type !== "image" || !obj.attrs.image) return obj;
  const { image: _liveCanvas, ...attrs } = obj.attrs;
  return { ...obj, attrs };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const commaIdx = typeof result === "string" ? result.indexOf(",") : -1;
      if (
        typeof result === "string" &&
        result.startsWith("data:") &&
        commaIdx !== -1 &&
        commaIdx < result.length - 1
      ) {
        resolve(result);
      } else {
        reject(reader.error ?? new Error("FileReader did not produce a valid data URL"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob as data URL"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIdx === -1 || commaIdx >= dataUrl.length - 1) {
    throw new Error("Invalid data URL");
  }
  const header = dataUrl.slice(5, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const isBase64 = header.endsWith(";base64");
  const mime = (isBase64 ? header.slice(0, -7) : header) || "application/octet-stream";
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.byteLength === 0) {
      throw new Error("Data URL resolved to an empty blob");
    }
    return new Blob([bytes], { type: mime });
  }
  const decoded = decodeURIComponent(payload);
  const bytes = new TextEncoder().encode(decoded);
  if (bytes.byteLength === 0) {
    throw new Error("Data URL resolved to an empty blob");
  }
  return new Blob([bytes], { type: mime });
}

async function urlToBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    return dataUrlToBlob(url);
  }
  const res = await fetch(url);
  if (res.ok === false) {
    throw new Error(`Failed to fetch blob URL (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error("Blob URL resolved to an empty blob");
  }
  return blob;
}

/**
 * Convert a blob: URL to a data: URL. Returns the original string if it is not
 * a blob URL, and throws if the blob cannot be read into a non-empty data URL.
 */
async function blobUrlToDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;
  const blob = await urlToBlob(url);
  return await blobToDataUrl(blob);
}

async function serializeEditorState(s = useEditorStore.getState()): Promise<AutosaveState> {
  // Convert blob URLs to data URLs so they survive round-trip across sessions
  const sourceImageUrl = s.sourceImageUrl ? await blobUrlToDataUrl(s.sourceImageUrl) : null;

  // Also convert blob URLs inside image-type canvas objects
  const objects = await Promise.all(
    s.objects.map(async (obj) => {
      const saved = withoutLiveStroke(obj);
      if (saved.type === "image" && saved.attrs.src?.startsWith("blob:")) {
        return {
          ...saved,
          attrs: { ...saved.attrs, src: await blobUrlToDataUrl(saved.attrs.src) },
        };
      }
      return saved;
    }),
  );

  return {
    canvasSize: s.canvasSize,
    layers: s.layers,
    objects,
    adjustments: s.adjustments,
    filters: s.filters,
    levels: s.levels,
    curves: s.curves,
    guides: s.guides,
    sourceImageUrl,
    sourceImageSize: s.sourceImageSize,
    foregroundColor: s.foregroundColor,
    backgroundColor: s.backgroundColor,
  };
}

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && typeof indexedDB?.open === "function";
  } catch {
    return false;
  }
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    name === "QuotaExceeded"
  ) {
    return true;
  }
  const code = (err as { code?: unknown }).code;
  return code === 22 || code === 1014;
}

function openAutosaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
        db.createObjectStore(AUTOSAVE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open autosave IndexedDB"));
    req.onblocked = () => reject(new Error("Autosave IndexedDB open was blocked"));
  });
}

async function writeAutosaveBlobs(blobs: Map<string, Blob>): Promise<void> {
  const db = await openAutosaveDb();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      let tx: IDBTransaction;
      try {
        tx = db.transaction(AUTOSAVE_STORE_NAME, "readwrite");
      } catch (err) {
        fail(err);
        return;
      }
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = (e) => {
        const reqErr = (e?.target as IDBRequest | null)?.error;
        fail(reqErr ?? tx.error ?? new Error("Failed to write autosave blobs to IndexedDB"));
      };
      tx.onabort = (e) => {
        const reqErr = (e?.target as IDBRequest | null)?.error;
        fail(reqErr ?? tx.error ?? new DOMException("IndexedDB transaction aborted", "AbortError"));
      };
      try {
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        store.clear();
        for (const [key, blob] of blobs) {
          store.put(blob, key);
        }
      } catch (err) {
        fail(err);
      }
    });
  } finally {
    db.close();
  }
}

async function readAutosaveBlobs(keys: string[]): Promise<Map<string, Blob>> {
  if (keys.length === 0) return new Map();
  const db = await openAutosaveDb();
  try {
    return await new Promise<Map<string, Blob>>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      let tx: IDBTransaction;
      try {
        tx = db.transaction(AUTOSAVE_STORE_NAME, "readonly");
      } catch (err) {
        fail(err);
        return;
      }
      const results = new Map<string, Blob>();
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(results);
      };
      tx.onerror = () => {
        fail(tx.error ?? new Error("Failed to read autosave blobs from IndexedDB"));
      };
      tx.onabort = () => {
        fail(tx.error ?? new Error("Autosave IndexedDB read transaction aborted"));
      };
      try {
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        for (const key of keys) {
          const req = store.get(key);
          req.onsuccess = () => {
            const val = req.result;
            if (val instanceof Blob && val.size > 0) {
              results.set(key, val);
            } else if (
              val &&
              typeof val === "object" &&
              typeof (val as { size?: unknown }).size === "number" &&
              (val as { size: number }).size > 0 &&
              typeof (val as { slice?: unknown }).slice === "function"
            ) {
              results.set(key, val as Blob);
            }
          };
          req.onerror = () => {
            fail(req.error ?? new Error(`Failed to read key "${key}" from IndexedDB`));
          };
        }
      } catch (err) {
        fail(err);
      }
    });
  } finally {
    db.close();
  }
}

async function clearAutosaveBlobs(expectedRunId = activeSaveRunId): Promise<void> {
  if (!isIndexedDbAvailable() || expectedRunId !== activeSaveRunId) return;
  const db = await openAutosaveDb();
  try {
    if (expectedRunId !== activeSaveRunId) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      let tx: IDBTransaction;
      try {
        tx = db.transaction(AUTOSAVE_STORE_NAME, "readwrite");
      } catch (err) {
        fail(err);
        return;
      }
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = () => fail(tx.error ?? new Error("Failed to clear autosave IndexedDB"));
      tx.onabort = () => fail(tx.error ?? new Error("Clear autosave IndexedDB aborted"));
      try {
        tx.objectStore(AUTOSAVE_STORE_NAME).clear();
      } catch (err) {
        fail(err);
      }
    });
  } finally {
    db.close();
  }
}

function isBlobOrDataUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && (url.startsWith("blob:") || url.startsWith("data:"));
}

async function prepareAutosavePayload(
  s = useEditorStore.getState(),
): Promise<{ idbState: AutosaveState; blobs: Map<string, Blob> }> {
  const blobs = new Map<string, Blob>();
  let sourceImageUrl = s.sourceImageUrl;
  if (isBlobOrDataUrl(s.sourceImageUrl)) {
    blobs.set("source", await urlToBlob(s.sourceImageUrl));
    sourceImageUrl = AUTOSAVE_IDB_SOURCE_URL;
  }

  const objects = await Promise.all(
    s.objects.map(async (obj) => {
      const saved = withoutLiveStroke(obj);
      if (saved.type === "image" && isBlobOrDataUrl(saved.attrs.src)) {
        blobs.set(`object:${saved.id}`, await urlToBlob(saved.attrs.src));
        return {
          ...saved,
          attrs: { ...saved.attrs, src: `${AUTOSAVE_IDB_OBJECT_PREFIX}${saved.id}` },
        };
      }
      return saved;
    }),
  );

  return {
    idbState: {
      canvasSize: s.canvasSize,
      layers: s.layers,
      objects,
      adjustments: s.adjustments,
      filters: s.filters,
      levels: s.levels,
      curves: s.curves,
      guides: s.guides,
      sourceImageUrl,
      sourceImageSize: s.sourceImageSize,
      foregroundColor: s.foregroundColor,
      backgroundColor: s.backgroundColor,
    },
    blobs,
  };
}

async function stateWithInlineBlobs(
  state: AutosaveState,
  blobs: Map<string, Blob>,
): Promise<AutosaveState> {
  const sourceBlob = blobs.get("source");
  const sourceImageUrl =
    state.sourceImageUrl === AUTOSAVE_IDB_SOURCE_URL && sourceBlob
      ? await blobToDataUrl(sourceBlob)
      : state.sourceImageUrl;

  const objects = await Promise.all(
    state.objects.map(async (obj) => {
      if (
        obj.type === "image" &&
        typeof obj.attrs.src === "string" &&
        obj.attrs.src.startsWith(AUTOSAVE_IDB_OBJECT_PREFIX)
      ) {
        const objBlob = blobs.get(`object:${obj.id}`);
        if (objBlob) {
          return {
            ...obj,
            attrs: { ...obj.attrs, src: await blobToDataUrl(objBlob) },
          };
        }
      }
      return obj;
    }),
  );

  return {
    ...state,
    sourceImageUrl,
    objects,
  };
}

function neededAutosaveBlobKeys(data: AutosaveData): string[] {
  const keys: string[] = [];
  if (data.state.sourceImageUrl === AUTOSAVE_IDB_SOURCE_URL) {
    keys.push("source");
  }
  for (const obj of data.state.objects ?? []) {
    if (
      obj.type === "image" &&
      typeof obj.attrs.src === "string" &&
      obj.attrs.src.startsWith(AUTOSAVE_IDB_OBJECT_PREFIX)
    ) {
      const id = obj.attrs.src.slice(AUTOSAVE_IDB_OBJECT_PREFIX.length);
      if (id) keys.push(`object:${id}`);
    }
  }
  return keys;
}

async function hydrateAutosaveState(
  data: AutosaveData,
): Promise<{ data: AutosaveData; createdUrls: string[] } | null> {
  const keys = neededAutosaveBlobKeys(data);
  if (keys.length === 0) {
    return { data, createdUrls: [] };
  }
  if (!isIndexedDbAvailable()) {
    console.debug("Autosave references IndexedDB blobs, but IndexedDB is unavailable");
    return null;
  }
  let blobs: Map<string, Blob>;
  try {
    blobs = await readAutosaveBlobs(keys);
  } catch (err) {
    console.debug("Failed to read autosave blobs from IndexedDB:", err);
    return null;
  }
  for (const key of keys) {
    if (!blobs.has(key)) {
      console.debug(`Autosave blob "${key}" missing from IndexedDB`);
      return null;
    }
  }

  const createdUrls: string[] = [];
  try {
    let sourceImageUrl = data.state.sourceImageUrl;
    const sourceBlob = blobs.get("source");
    if (sourceImageUrl === AUTOSAVE_IDB_SOURCE_URL && sourceBlob) {
      const sourceUrl = URL.createObjectURL(sourceBlob);
      createdUrls.push(sourceUrl);
      sourceImageUrl = sourceUrl;
    }
    const objects = (data.state.objects ?? []).map((obj) => {
      if (
        obj.type === "image" &&
        typeof obj.attrs.src === "string" &&
        obj.attrs.src.startsWith(AUTOSAVE_IDB_OBJECT_PREFIX)
      ) {
        const id = obj.attrs.src.slice(AUTOSAVE_IDB_OBJECT_PREFIX.length);
        const objBlob = blobs.get(`object:${id}`);
        if (objBlob) {
          const objUrl = URL.createObjectURL(objBlob);
          createdUrls.push(objUrl);
          return {
            ...obj,
            attrs: { ...obj.attrs, src: objUrl },
          };
        }
      }
      return obj;
    });
    return {
      data: {
        ...data,
        state: {
          ...data.state,
          sourceImageUrl,
          objects,
        },
      },
      createdUrls,
    };
  } catch (err) {
    for (const url of createdUrls) {
      URL.revokeObjectURL(url);
    }
    console.debug("Failed to create object URLs for autosave blobs:", err);
    return null;
  }
}

function reportAutosaveFailure(
  err: unknown,
  phase: "storage" | "serialization",
  options?: SaveEditorStateOptions,
): void {
  const isQuota = isQuotaExceededError(err);
  if (phase === "storage") {
    console.warn("[SnapOtter] Autosave failed (localStorage quota may be exceeded):", err);
  } else {
    console.warn("[SnapOtter] Autosave serialization failed:", err);
  }
  if (options?.manual || !autosaveFailureReported) {
    autosaveFailureReported = true;
    const message = isQuota
      ? "Editor autosave exceeded storage quota"
      : phase === "storage"
        ? "Editor autosave storage failed"
        : "Editor autosave serialization failed";
    void captureHandledError(
      new SafeError(message, {
        kind: "operational",
        cause: err,
      }),
      { error_class: "operational", tool_id: "editor-autosave" },
    );
  }
  if (options?.manual) {
    toast.error(options.errorMessage ?? en.editor.ui.autosaveRecovery.saveFailed);
  }
}

export async function saveEditorState(options?: SaveEditorStateOptions): Promise<boolean> {
  if (options?.manual) {
    pendingManualSaveOptions = options;
  }
  const effectiveOptions = options?.manual ? options : (pendingManualSaveOptions ?? options);
  const runId = ++activeSaveRunId;
  const timestamp = Date.now();
  let idbState: AutosaveState;
  let blobs: Map<string, Blob>;
  try {
    const prepared = await prepareAutosavePayload();
    idbState = prepared.idbState;
    blobs = prepared.blobs;
  } catch (err) {
    if (runId === activeSaveRunId) {
      pendingManualSaveOptions = null;
      reportAutosaveFailure(err, "serialization", effectiveOptions);
    }
    return false;
  }
  if (runId !== activeSaveRunId) return false;

  try {
    if (blobs.size > 0 && isIndexedDbAvailable()) {
      let wroteToIdb = false;
      try {
        await writeAutosaveBlobs(blobs);
        wroteToIdb = true;
      } catch (idbErr) {
        if (isQuotaExceededError(idbErr)) {
          throw idbErr;
        }
        console.debug("Autosave IndexedDB write failed; falling back to localStorage:", idbErr);
      }
      if (runId !== activeSaveRunId) return false;
      if (wroteToIdb) {
        const data: AutosaveData = {
          version: 1,
          timestamp,
          state: idbState,
        };
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        } catch (lsErr) {
          try {
            localStorage.removeItem(AUTOSAVE_KEY);
          } catch (rmErr) {
            console.debug(
              "Failed to remove stale autosave key after localStorage write failure:",
              rmErr,
            );
          }
          void clearAutosaveBlobs(runId).catch((err) => {
            console.debug("Failed to clear autosave blobs from IndexedDB:", err);
          });
          throw lsErr;
        }
        pendingManualSaveOptions = null;
        autosaveFailureReported = false;
        useEditorStore.setState({ lastAutoSave: timestamp });
        return true;
      }
    }

    const inlineState = blobs.size > 0 ? await stateWithInlineBlobs(idbState, blobs) : idbState;
    if (runId !== activeSaveRunId) return false;
    const data: AutosaveData = {
      version: 1,
      timestamp,
      state: inlineState,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    if (blobs.size === 0 && isIndexedDbAvailable()) {
      void clearAutosaveBlobs(runId).catch((err) => {
        console.debug("Failed to clear autosave blobs from IndexedDB:", err);
      });
    }
    pendingManualSaveOptions = null;
    autosaveFailureReported = false;
    useEditorStore.setState({ lastAutoSave: timestamp });
    return true;
  } catch (storageErr) {
    if (runId === activeSaveRunId) {
      pendingManualSaveOptions = null;
      reportAutosaveFailure(storageErr, "storage", effectiveOptions);
    }
    return false;
  }
}

export function loadAutosaveState(): AutosaveData | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch (err) {
    console.debug("Failed to read autosave state from localStorage:", err);
    return null;
  }
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.debug("Failed to parse autosave state:", err);
    clearAutosave();
    return null;
  }
  if (
    !isPlainRecord(data) ||
    data.version !== 1 ||
    typeof data.timestamp !== "number" ||
    !Number.isFinite(data.timestamp) ||
    data.timestamp <= 0 ||
    !isPlainRecord(data.state) ||
    !isValidProjectData({ ...data.state, version: data.version })
  ) {
    console.debug("Autosave state failed structural validation");
    clearAutosave();
    return null;
  }
  return data as unknown as AutosaveData;
}

export function clearAutosave(): void {
  const runId = ++activeSaveRunId;
  pendingManualSaveOptions = null;
  autosaveFailureReported = false;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (err) {
    console.debug("Failed to clear autosave state from localStorage:", err);
  }
  void clearAutosaveBlobs(runId).catch((err) => {
    console.debug("Failed to clear autosave blobs from IndexedDB:", err);
  });
}

export function restoreAutosave(data: AutosaveData): void {
  const store = useEditorStore.getState();
  const state = data.state;
  const needsHydration = neededAutosaveBlobKeys(data).length > 0;
  const layers = state.layers || store.layers;
  const activeLayerId = layers.some((l) => l.id === store.activeLayerId)
    ? store.activeLayerId
    : (layers[0]?.id ?? store.activeLayerId);
  const adjustments = state.adjustments
    ? { ...store.adjustments, ...state.adjustments }
    : store.adjustments;
  const filters = state.filters
    ? store.filters.map((existing) => {
        const match = state.filters?.find((f) => f.type === existing.type);
        return match
          ? {
              ...existing,
              enabled: match.enabled,
              params: { ...existing.params, ...match.params },
            }
          : existing;
      })
    : store.filters;
  const initialObjects = (state.objects || []).filter(
    (obj) =>
      !(
        obj.type === "image" &&
        typeof obj.attrs.src === "string" &&
        obj.attrs.src.startsWith(AUTOSAVE_IDB_OBJECT_PREFIX)
      ),
  );
  const targetHistoryVersion = store._historyVersion + 1;
  useEditorStore.setState({
    canvasSize: state.canvasSize,
    layers,
    activeLayerId,
    objects: initialObjects,
    adjustments,
    filters,
    levels: resolveLoadedLevels(state.levels),
    curves: resolveLoadedCurves(state.curves),
    guides: state.guides || [],
    sourceImageUrl:
      state.sourceImageUrl === AUTOSAVE_IDB_SOURCE_URL ? null : state.sourceImageUrl || null,
    sourceImageSize: state.sourceImageSize || null,
    foregroundColor: state.foregroundColor || "#000000",
    backgroundColor: state.backgroundColor || "#ffffff",
    selection: null,
    cropState: null,
    isCropping: false,
    editingTextId: null,
    selectedObjectIds: [],
    clipboard: null,
    isDirty: true,
    lastAction: { id: "restoreAutosave" },
    _historyVersion: targetHistoryVersion,
  });
  if (needsHydration) {
    void hydrateAutosaveState(data)
      .then((hydrated) => {
        if (!hydrated) {
          console.debug("Failed to hydrate autosave state during restoreAutosave");
          clearAutosave();
          return;
        }
        if (useEditorStore.getState()._historyVersion !== targetHistoryVersion) {
          for (const url of hydrated.createdUrls) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        useEditorStore.setState({
          sourceImageUrl: hydrated.data.state.sourceImageUrl || null,
          objects: hydrated.data.state.objects || [],
          lastAction: { id: "restoreAutosave" },
          _historyVersion: targetHistoryVersion + 1,
        });
      })
      .catch((err) => {
        console.debug("Failed to hydrate autosave state during restoreAutosave:", err);
      });
  }
}

/**
 * Hook to run autosave on an interval. Call this in EditorPage.
 * Returns recovery state if found on mount.
 */
export function useAutosave(): {
  recoveryData: AutosaveData | null;
  dismissRecovery: () => void;
  restoreRecovery: () => void;
} {
  const [recoveryData, setRecoveryData] = useState<AutosaveData | null>(null);
  const isDirty = useEditorStore((s) => s.isDirty);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const lastAutoSave = useEditorStore((s) => s.lastAutoSave);
  const createdUrlsRef = useRef<string[]>([]);
  const restoredRef = useRef(false);

  // Check for recovery on mount
  useEffect(() => {
    let cancelled = false;
    restoredRef.current = false;
    const data = loadAutosaveState();
    if (!data) return;
    if (neededAutosaveBlobKeys(data).length === 0) {
      setRecoveryData(data);
      return;
    }
    void hydrateAutosaveState(data)
      .then((hydrated) => {
        if (cancelled) {
          for (const url of hydrated?.createdUrls ?? []) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        if (!hydrated) {
          clearAutosave();
          return;
        }
        createdUrlsRef.current = hydrated.createdUrls;
        setRecoveryData(hydrated.data);
      })
      .catch((err) => {
        console.debug("Failed to hydrate autosave state on mount:", err);
      });
    return () => {
      cancelled = true;
      if (!restoredRef.current) {
        for (const url of createdUrlsRef.current) {
          URL.revokeObjectURL(url);
        }
        createdUrlsRef.current = [];
      }
    };
  }, []);

  // If a new save overwrites the autosave slot while an older recovery banner is still
  // up, hide the stale banner and release its object URLs without clearing storage.
  useEffect(() => {
    if (!recoveryData || lastAutoSave === null || lastAutoSave <= recoveryData.timestamp) return;
    for (const url of createdUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    createdUrlsRef.current = [];
    setRecoveryData(null);
  }, [recoveryData, lastAutoSave]);

  // Autosave interval
  useEffect(() => {
    if (!sourceImageUrl) return;

    const timer = setInterval(() => {
      if (isDirty) {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => void saveEditorState());
        } else {
          void saveEditorState();
        }
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isDirty, sourceImageUrl]);

  const dismissRecovery = useCallback(() => {
    for (const url of createdUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    createdUrlsRef.current = [];
    clearAutosave();
    setRecoveryData(null);
  }, []);

  const handleRestore = useCallback(() => {
    if (recoveryData) {
      restoredRef.current = true;
      createdUrlsRef.current = [];
      restoreAutosave(recoveryData);
      clearAutosave();
      setRecoveryData(null);
    }
  }, [recoveryData]);

  return { recoveryData, dismissRecovery, restoreRecovery: handleRestore };
}

/**
 * Recovery banner component for display at the top of the editor.
 */
export function AutosaveRecoveryBanner({
  data,
  onRestore,
  onDiscard,
}: {
  data: AutosaveData;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const timeStr = new Date(data.timestamp).toLocaleString();

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/30 text-xs">
      <Save size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
      <span className="text-foreground">
        {format(t.editor.ui.autosaveRecovery.message, { time: timeStr })}
      </span>
      <div className="flex items-center gap-2 ms-auto">
        <button
          type="button"
          onClick={onRestore}
          className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
        >
          {t.editor.ui.autosaveRecovery.restore}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t.editor.ui.autosaveRecovery.discard}
        </button>
      </div>
    </div>
  );
}
