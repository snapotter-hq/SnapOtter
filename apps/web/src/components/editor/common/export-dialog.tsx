import { appUrl, resolveServerUrls } from "@/lib/app-url";
// apps/web/src/components/editor/common/export-dialog.tsx

import {
  ANALYTICS_EVENTS,
  apiToolPath,
  type EditorExportedProperties,
  SafeError,
} from "@snapotter/shared";
import type Konva from "konva";
import {
  Check,
  ClipboardCopy,
  Download,
  FileDown,
  FileUp,
  Lock,
  Save,
  Unlock,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { format } from "@/lib/format";
import { cn, copyImageToClipboard } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
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

type ExportFailureReason = NonNullable<EditorExportedProperties["reason"]>;

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
  void import("@/lib/analytics").then(({ captureHandledError }) =>
    captureHandledError(
      new SafeError("Could not render the export preview", { kind: "bug", cause: err }),
      { error_class: "bug", tool_id: "editor-export" },
    ),
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
  const later = useTimeouts();

  const aspectRatio = canvasSize.width / canvasSize.height;
  const dialogRef = useRef<HTMLDivElement>(null);

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
  // the user and answered as the reason; any other error is a bug and propagates.
  const guardCapture = useCallback(
    (step: () => void): CaptureFailure | null => {
      try {
        step();
        return null;
      } catch (err) {
        const reason = classifyCaptureError(err);
        if (!reason) throw err;
        reportCaptureFailure(reason, captureMessages);
        return reason;
      }
    },
    [captureMessages],
  );

  // Export through the Konva stage. editor_exported is sent once per attempt, when
  // the outcome is known (#2174): it used to fire on the click, so a canvas the
  // browser couldn't encode or a server error still counted as an export.
  const handleExport = useCallback(() => {
    const report = (status: "completed" | "failed", reason?: ExportFailureReason) => {
      const properties = {
        output_format: settings.format,
        status,
        ...(reason ? { reason } : {}),
      } satisfies EditorExportedProperties;
      void import("@/lib/analytics").then(({ track }) =>
        track(ANALYTICS_EVENTS.EDITOR_EXPORTED, properties),
      );
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
    const formatOption = FORMAT_OPTIONS.find((o) => o.value === settings.format);

    let failure: CaptureFailure | null;
    try {
      failure = guardCapture(() => {
        const canvas = renderExportCanvas(stage, canvasSize, settings);
        if (!canvas) {
          reportEmptyExport();
          report("failed", "no-context");
          return;
        }

        // Formats the Canvas API cannot encode go to the server as PNG.
        if (formatOption?.needsServerConvert) {
          canvas.toBlob(async (blob) => {
            if (!blob || blob.size === 0) {
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
            try {
              const res = await fetch(appUrl(apiToolPath("convert")), {
                method: "POST",
                body: formData,
              });
              if (!res.ok) throw new Error("Server convert failed");
              const json = resolveServerUrls(await res.json());
              // A conversion that outlives the server's sync wait answers 202 with no
              // file yet, and the dialog doesn't follow the job (#2171).
              if (!json.downloadUrl) {
                console.error("Server-side export answered before the file was ready");
                report("failed", "server-pending");
                return;
              }
              download(json.downloadUrl);
            } catch (err) {
              console.error("Server-side export failed:", err);
              report("failed", "server-convert");
            }
          }, "image/png");
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
            report("failed", "download");
          });
      });
    } catch (err) {
      // Not a capture failure: a bug. It still propagates, but the attempt is counted.
      report("failed", "bug");
      throw err;
    }
    if (failure) report("failed", failure);
  }, [settings, canvasSize, markClean, reportEmptyExport, guardCapture]);

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

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      // Image copy has no fallback on plain-http installs (no ClipboardItem
      // there), so failure gets surfaced on the button instead of thrown.
      setCopyStatus((await copyImageToClipboard(blob)) ? "copied" : "failed");
      later(() => setCopyStatus("idle"), 2000, "copyStatus");
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
      setCopyStatus("failed");
      later(() => setCopyStatus("idle"), 2000, "copyStatus");
    }
  }, [settings, canvasSize, later, guardCapture, reportEmptyExport]);

  // Project save (.snapotter file)
  const handleSaveProject = useCallback(() => {
    const state = useEditorStore.getState();
    const projectData = {
      version: 1,
      canvasSize: state.canvasSize,
      layers: state.layers,
      objects: state.objects.map(withoutLiveStroke),
      adjustments: state.adjustments,
      filters: state.filters,
      guides: state.guides,
      sourceImageUrl: state.sourceImageUrl,
      sourceImageSize: state.sourceImageSize,
      foregroundColor: state.foregroundColor,
      backgroundColor: state.backgroundColor,
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
    markClean();
  }, [markClean]);

  // Project load (.snapotter file)
  const handleLoadProject = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".snapotter,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!data.version || !data.canvasSize) return;

          const store = useEditorStore.getState();
          const setState = useEditorStore.setState;

          setState({
            canvasSize: data.canvasSize,
            layers: data.layers || store.layers,
            objects: data.objects || [],
            adjustments: data.adjustments || store.adjustments,
            filters: data.filters || store.filters,
            guides: data.guides || [],
            sourceImageUrl: data.sourceImageUrl || null,
            sourceImageSize: data.sourceImageSize || null,
            foregroundColor: data.foregroundColor || "#000000",
            backgroundColor: data.backgroundColor || "#ffffff",
            selection: null,
            cropState: null,
            selectedObjectIds: [],
            clipboard: [],
            isDirty: false,
            lastAction: { id: "loadProject" },
            _historyVersion: store._historyVersion + 1,
          });

          onClose();
        } catch {
          // Invalid project file
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [onClose]);

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
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            >
              <Download size={14} />
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
        </div>
      </div>
    </div>
  );
}

// ---- Autosave utilities (Feature 44) ----

const AUTOSAVE_KEY = "snapotter-editor-autosave";
const AUTOSAVE_INTERVAL_MS = 60_000;

interface AutosaveState {
  canvasSize: { width: number; height: number };
  layers: EditorLayer[];
  objects: CanvasObject[];
  adjustments: AdjustmentValues;
  filters: FilterConfig[];
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

/**
 * Convert a blob: URL to a data: URL. Returns the original string
 * if it is not a blob URL or if the fetch fails.
 */
// The canvas a brush paints into mid-stroke lives in attrs.image. It serialises as
// `{}`, which a restored object would then try to draw.
function withoutLiveStroke(obj: CanvasObject): CanvasObject {
  if (obj.type !== "image" || !obj.attrs.image) return obj;
  const { image: _liveCanvas, ...attrs } = obj.attrs;
  return { ...obj, attrs };
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export async function saveEditorState(): Promise<void> {
  try {
    const s = useEditorStore.getState();

    // Convert blob URLs to data URLs so they survive localStorage round-trip
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

    const data: AutosaveData = {
      version: 1,
      timestamp: Date.now(),
      state: {
        canvasSize: s.canvasSize,
        layers: s.layers,
        objects,
        adjustments: s.adjustments,
        filters: s.filters,
        guides: s.guides,
        sourceImageUrl,
        sourceImageSize: s.sourceImageSize,
        foregroundColor: s.foregroundColor,
        backgroundColor: s.backgroundColor,
      },
    };

    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      useEditorStore.setState({ lastAutoSave: Date.now() });
    } catch (storageErr) {
      console.warn("[SnapOtter] Autosave failed (localStorage quota may be exceeded):", storageErr);
    }
  } catch {
    // Serialization or fetch error
  }
}

export function loadAutosaveState(): AutosaveData | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AutosaveData;
    if (data.version !== 1 || !data.state?.canvasSize) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

export function restoreAutosave(data: AutosaveData): void {
  const store = useEditorStore.getState();
  useEditorStore.setState({
    ...data.state,
    isDirty: true,
    lastAction: { id: "restoreAutosave" },
    _historyVersion: store._historyVersion + 1,
  });
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

  // Check for recovery on mount
  useEffect(() => {
    const data = loadAutosaveState();
    if (data) {
      setRecoveryData(data);
    }
  }, []);

  // Autosave interval
  useEffect(() => {
    if (!sourceImageUrl) return;

    const timer = setInterval(() => {
      if (isDirty) {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => saveEditorState());
        } else {
          saveEditorState();
        }
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isDirty, sourceImageUrl]);

  const dismissRecovery = useCallback(() => {
    clearAutosave();
    setRecoveryData(null);
  }, []);

  const handleRestore = useCallback(() => {
    if (recoveryData) {
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
