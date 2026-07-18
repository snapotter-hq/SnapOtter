// apps/web/src/components/editor/common/export-dialog.tsx

import { ANALYTICS_EVENTS, apiToolPath } from "@snapotter/shared";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { captureDocumentCanvas } from "@/components/editor/stage-capture";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const aspectRatio = canvasSize.width / canvasSize.height;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Issue #6: Use Konva stage ref for proper export instead of DOM query
  const generatePreview = useCallback(() => {
    const stage = editorStageRefHolder.current;
    if (!stage) return;

    const maxPreview = 200;
    const scale = Math.min(maxPreview / canvasSize.width, maxPreview / canvasSize.height);

    // For server-convert formats the Canvas API cannot produce a preview,
    // so fall back to PNG for the thumbnail.
    const fmtOpt = FORMAT_OPTIONS.find((o) => o.value === settings.format);
    const previewMime = fmtOpt?.needsServerConvert ? "image/png" : getMimeType(settings.format);

    const url = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height, scale).toDataURL(
      previewMime,
      settings.quality / 100,
    );
    setPreviewUrl(url);

    const pixelRatio = settings.width / canvasSize.width;
    const fullUrl = captureDocumentCanvas(
      stage,
      canvasSize.width,
      canvasSize.height,
      pixelRatio,
    ).toDataURL(previewMime, settings.quality / 100);
    fetch(fullUrl)
      .then((res) => res.blob())
      .then((blob) => setEstimatedSize(blob.size))
      .catch(() => setEstimatedSize(null));
  }, [canvasSize, settings.format, settings.quality, settings.width]);

  // Generate preview thumbnail on format/transparency change
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Handle width change with aspect lock
  const handleWidthChange = useCallback(
    (w: number) => {
      const newWidth = Math.max(1, w);
      if (settings.lockAspect) {
        setSettings((prev) => ({
          ...prev,
          width: newWidth,
          height: Math.round(newWidth / aspectRatio),
        }));
      } else {
        setSettings((prev) => ({ ...prev, width: newWidth }));
      }
    },
    [settings.lockAspect, aspectRatio],
  );

  // Handle height change with aspect lock
  const handleHeightChange = useCallback(
    (h: number) => {
      const newHeight = Math.max(1, h);
      if (settings.lockAspect) {
        setSettings((prev) => ({
          ...prev,
          height: newHeight,
          width: Math.round(newHeight * aspectRatio),
        }));
      } else {
        setSettings((prev) => ({ ...prev, height: newHeight }));
      }
    },
    [settings.lockAspect, aspectRatio],
  );

  // Issue #6: Export using Konva stage.toDataURL for correct output
  const handleExport = useCallback(() => {
    import("@/lib/analytics").then(({ track }) =>
      track(ANALYTICS_EVENTS.EDITOR_EXPORTED, { output_format: settings.format }),
    );
    const stage = editorStageRefHolder.current;
    if (!stage) return;

    const pixelRatio = settings.width / canvasSize.width;

    // Server-side convert for formats the Canvas API cannot produce
    const formatOption = FORMAT_OPTIONS.find((o) => o.value === settings.format);
    if (formatOption?.needsServerConvert) {
      let stageCanvas: HTMLCanvasElement;
      if (!settings.transparent || settings.format === "jpeg") {
        const raw = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height, pixelRatio);
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = raw.width;
        exportCanvas.height = raw.height;
        const ctx = exportCanvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(raw, 0, 0);
        stageCanvas = exportCanvas;
      } else {
        stageCanvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height, pixelRatio);
      }

      stageCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append("file", blob, "export.png");
        formData.append(
          "settings",
          JSON.stringify({ format: settings.format, quality: settings.quality }),
        );
        try {
          const res = await fetch(apiToolPath("convert"), {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error("Server convert failed");
          const json = await res.json();
          if (json.downloadUrl) {
            const a = document.createElement("a");
            a.href = json.downloadUrl;
            a.download = `export.${settings.format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            markClean();
          }
        } catch (err) {
          console.error("Server-side export failed:", err);
        }
      }, "image/png");
      return;
    }

    let dataUrl: string;

    if (!settings.transparent || settings.format === "jpeg") {
      // Create canvas with white background for non-transparent exports
      const stageCanvas = captureDocumentCanvas(
        stage,
        canvasSize.width,
        canvasSize.height,
        pixelRatio,
      );
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = stageCanvas.width;
      exportCanvas.height = stageCanvas.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(stageCanvas, 0, 0);
      dataUrl = exportCanvas.toDataURL(
        getMimeType(settings.format),
        settings.format === "png" ? undefined : settings.quality / 100,
      );
    } else {
      dataUrl = captureDocumentCanvas(
        stage,
        canvasSize.width,
        canvasSize.height,
        pixelRatio,
      ).toDataURL(
        getMimeType(settings.format),
        settings.format === "png" ? undefined : settings.quality / 100,
      );
    }

    const formatOpt = FORMAT_OPTIONS.find((f) => f.value === settings.format);
    if (formatOpt?.needsServerConvert) {
      fetch(dataUrl)
        .then((res) => res.blob())
        .then(async (pngBlob) => {
          const formData = new FormData();
          formData.append("file", pngBlob, "export.png");
          formData.append(
            "settings",
            JSON.stringify({ format: settings.format, quality: settings.quality }),
          );
          const res = await fetch(apiToolPath("convert"), { method: "POST", body: formData });
          if (!res.ok) throw new Error("Server conversion failed");
          const json = await res.json();
          if (json.downloadUrl) {
            const a = document.createElement("a");
            a.href = json.downloadUrl;
            a.download = `export.${settings.format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            markClean();
          }
        })
        .catch((err) => {
          console.error("Export failed:", err);
        });
    } else {
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `export.${settings.format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          markClean();
        })
        .catch((err) => {
          console.error("Export failed:", err);
        });
    }
  }, [settings, canvasSize, markClean]);

  // Issue #6: Copy to clipboard using Konva stage
  const handleCopyToClipboard = useCallback(async () => {
    const stage = editorStageRefHolder.current;
    if (!stage) return;

    const pixelRatio = settings.width / canvasSize.width;
    const dataUrl = captureDocumentCanvas(
      stage,
      canvasSize.width,
      canvasSize.height,
      pixelRatio,
    ).toDataURL("image/png");

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
    }
  }, [settings, canvasSize]);

  // Project save (.snapotter file)
  const handleSaveProject = useCallback(() => {
    const state = useEditorStore.getState();
    const projectData = {
      version: 1,
      canvasSize: state.canvasSize,
      layers: state.layers,
      objects: state.objects,
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
            lastAction: "Load Project",
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
          <h2 className="text-sm font-semibold text-foreground">Export Image</h2>
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
                alt="Export preview"
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
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">Format</span>
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
                <span className="text-xs font-medium text-muted-foreground">Quality</span>
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
              Dimensions
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={settings.width}
                  onChange={(e) => handleWidthChange(Number.parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 text-xs bg-muted rounded border border-border text-foreground outline-none focus:border-primary"
                  min={1}
                />
                <span className="text-[10px] text-muted-foreground">Width</span>
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
                aria-label={settings.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {settings.lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <div className="flex-1">
                <input
                  type="number"
                  value={settings.height}
                  onChange={(e) => handleHeightChange(Number.parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 text-xs bg-muted rounded border border-border text-foreground outline-none focus:border-primary"
                  min={1}
                />
                <span className="text-[10px] text-muted-foreground">Height</span>
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
              Reset to original size ({canvasSize.width} x {canvasSize.height})
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
              <span className="text-xs text-foreground">Transparent background</span>
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
              Export
            </button>
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
            >
              {copyStatus === "copied" ? <Check size={14} /> : <ClipboardCopy size={14} />}
              {copyStatus === "copied" ? "Copied" : "Copy"}
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
              Save Project
            </button>
            <button
              type="button"
              onClick={handleLoadProject}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileUp size={12} />
              Load Project
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
        if (obj.type === "image" && obj.attrs.src?.startsWith("blob:")) {
          return { ...obj, attrs: { ...obj.attrs, src: await blobUrlToDataUrl(obj.attrs.src) } };
        }
        return obj;
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
    lastAction: "Restore Autosave",
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
  const timeStr = new Date(data.timestamp).toLocaleString();

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/30 text-xs">
      <Save size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
      <span className="text-foreground">Recovered unsaved work from {timeStr}.</span>
      <div className="flex items-center gap-2 ms-auto">
        <button
          type="button"
          onClick={onRestore}
          className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
