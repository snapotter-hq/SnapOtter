import { isSafeMessageError, MAX_RESIZE_OUTPUT_DIMENSION, SafeError } from "@snapotter/shared";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { captureHandledError } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format as formatMessage } from "@/lib/format";
import { isIgnoredError } from "@/lib/sentry-scrub";
import type { ComparisonPreview } from "@/lib/tool-registry";
import { useFileStore } from "@/stores/file-store";

type WebFormat = "webp" | "jpeg" | "avif" | "png" | "jxl";

interface PreviewState {
  loading: boolean;
  previewUrl: string | null;
  processedSize: number | null;
  originalSize: number | null;
  /** Why the last attempt failed, shown in place of the size card (#2185). */
  error: string | null;
}

const IDLE_PREVIEW: PreviewState = {
  loading: false,
  previewUrl: null,
  processedSize: null,
  originalSize: null,
  error: null,
};

/** Answers about the file or the account: the panel shows them, Sentry does not. */
const UNREPORTED_PREVIEW_STATUSES = new Set([401, 403, 413, 422]);

const FORMAT_LABELS: Record<WebFormat, string> = {
  webp: "WebP",
  jpeg: "JPEG",
  avif: "AVIF",
  png: "PNG",
  jxl: "JXL",
};

// The API rejects a max width or height above the ceiling (#1185), so stop the value at
// the input. An empty or partly typed box is left alone.
function clampDimension(raw: string): string {
  const value = Number(raw);
  return raw !== "" && value > MAX_RESIZE_OUTPUT_DIMENSION
    ? String(MAX_RESIZE_OUTPUT_DIMENSION)
    : raw;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface OptimizeForWebSettingsProps {
  onComparisonPreview?: (preview: ComparisonPreview | null) => void;
}

export function OptimizeForWebSettings({ onComparisonPreview }: OptimizeForWebSettingsProps = {}) {
  const { t } = useTranslation();
  const { files, entries, selectedIndex } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("optimize-for-web");

  // Settings state
  const [format, setFormat] = useState<WebFormat>("webp");
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState("");
  const [maxHeight, setMaxHeight] = useState("");
  const [stripMetadata, setStripMetadata] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<PreviewState>(IDLE_PREVIEW);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewUrlRef = useRef<string | null>(null);
  const settingsEditedAfterRunRef = useRef(false);
  const onComparisonPreviewRef = useRef(onComparisonPreview);
  onComparisonPreviewRef.current = onComparisonPreview;
  // fetchPreview's dependencies are settings-only, so hold the catalog in a
  // ref for the messages it builds on failure.
  const tRef = useRef(t);
  tRef.current = t;

  const hasFile = files.length > 0;

  // Read the selected entry via ref so fetchPreview only re-binds when settings change.
  const currentSelectedEntry = entries[selectedIndex];
  const fileRef = useRef<File | null>(currentSelectedEntry?.file ?? null);
  const fileSizeRef = useRef(currentSelectedEntry?.file.size ?? 0);
  const entryIdRef = useRef<string | null>(currentSelectedEntry?.id ?? null);
  fileRef.current = currentSelectedEntry?.file ?? null;
  fileSizeRef.current = currentSelectedEntry?.file.size ?? 0;
  entryIdRef.current = currentSelectedEntry?.id ?? null;

  // Build settings object
  const buildSettings = useCallback(() => {
    const settings: Record<string, unknown> = {
      format,
      quality,
      progressive: true,
      stripMetadata,
    };
    // Whole pixels: the API rejects 800.5, and with the section collapsed the input's
    // own step check isn't there to stop it.
    const mw = Math.floor(Number(maxWidth));
    const mh = Math.floor(Number(maxHeight));
    if (mw > 0) settings.maxWidth = mw;
    if (mh > 0) settings.maxHeight = mh;
    return settings;
  }, [format, quality, maxWidth, maxHeight, stripMetadata]);

  const prevBuildSettingsRef = useRef(buildSettings);
  if (prevBuildSettingsRef.current !== buildSettings) {
    prevBuildSettingsRef.current = buildSettings;
    if (
      useFileStore
        .getState()
        .entries.some((e) => e.processedUrl !== null || e.status === "completed")
    ) {
      settingsEditedAfterRunRef.current = true;
    }
  }

  // Live preview - reads file from ref to avoid re-trigger loop
  const fetchPreview = useCallback(() => {
    debounceRef.current = null;
    const file = fileRef.current;
    if (!file) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setPreview((prev) => ({ ...prev, loading: true, error: null }));

    const entryId = entryIdRef.current;
    const settings = buildSettings();
    const copy = tRef.current;
    // Set by the non-OK branch so the catch can show the API's reason without
    // handing a server-authored string to Sentry (#2185).
    let failureMessage: string | null = null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify(settings));

    fetch(appUrl("/api/v1/tools/image/optimize-for-web/preview"), {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch((error: unknown) => {
            // A proxy can answer with HTML; keep the reason the body was
            // unreadable visible, like api.ts does (#4062). An abort while the
            // body was being read is this preview being replaced, not a fault.
            if (!controller.signal.aborted) {
              console.warn(
                `Failed to parse preview error response (status: ${response.status}):`,
                error,
              );
            }
            return null;
          });
          failureMessage = failedAnswerMessage(
            copy,
            body,
            response.status,
            copy.toolPage.previewFailed,
          );
          throw new SafeError("Optimize for Web preview request failed", {
            code: "preview-request",
            statusCode: response.status,
          });
        }

        const originalSize = Number(response.headers.get("X-Original-Size") ?? "0");
        const processedSize = Number(response.headers.get("X-Processed-Size") ?? "0");
        const blob = await response.blob();
        if (abortRef.current === controller) abortRef.current = null;
        if (controller.signal.aborted || entryIdRef.current !== entryId) return;
        const previewUrl = URL.createObjectURL(blob);

        // Revoke previous preview URL
        if (prevPreviewUrlRef.current) {
          URL.revokeObjectURL(prevPreviewUrlRef.current);
        }
        prevPreviewUrlRef.current = previewUrl;

        // Hand the preview to ToolPage's BeforeAfterSlider without writing it as a
        // completed result on the file-store entry (#1112). Browsers cannot render
        // image/jxl in <img> tags, so keep JXL size stats in the panel card without
        // handing an unrenderable blob URL to BeforeAfterSlider.
        if (entryId && settings.format !== "jxl") {
          const targetEntry = useFileStore.getState().entries.find((e) => e.id === entryId);
          const hasResult = Boolean(
            targetEntry?.processedUrl || targetEntry?.status === "completed",
          );
          onComparisonPreviewRef.current?.({
            entryId,
            url: previewUrl,
            originalSize,
            processedSize,
            supersedesResult: hasResult && settingsEditedAfterRunRef.current,
          });
        } else {
          onComparisonPreviewRef.current?.(null);
        }

        setPreview({
          loading: false,
          previewUrl,
          processedSize,
          originalSize,
          error: null,
        });
      })
      .catch((err) => {
        if (abortRef.current === controller) abortRef.current = null;
        // An abort is this preview being replaced (new settings, another file,
        // submit), not a failure to report.
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError"))
          return;
        // A failure for a file the viewer has moved off says nothing about the
        // one on screen.
        if (entryIdRef.current !== entryId) return;
        if (prevPreviewUrlRef.current) {
          URL.revokeObjectURL(prevPreviewUrlRef.current);
          prevPreviewUrlRef.current = null;
        }
        onComparisonPreviewRef.current?.(null);
        setPreview({ ...IDLE_PREVIEW, error: failureMessage ?? copy.toolPage.previewFailed });

        // A signed-out, denied, too-large, or undecodable answer is about this
        // file or account, and the panel says so. Anything else (settings the
        // API rejects, rate limit, 5xx) is a fault nobody would otherwise hear
        // about. A dropped connection is already in Sentry's IGNORE_ERRORS, so
        // wrapping one in a SafeError would defeat that filter.
        const reportable = isSafeMessageError(err)
          ? !UNREPORTED_PREVIEW_STATUSES.has(err.statusCode ?? 0)
          : !isIgnoredError(err);
        if (reportable) {
          void captureHandledError(
            isSafeMessageError(err)
              ? err
              : new SafeError("Optimize for Web preview request failed", {
                  code: "preview-request",
                  cause: err,
                }),
            { error_class: "operational", tool_id: "optimize-for-web" },
          );
        }
      });
  }, [buildSettings]);

  // Debounce preview on settings change only.
  // fetchPreview changes when buildSettings changes (format/quality/dimensions/stripMetadata).
  // hasFile triggers the initial preview on first upload.
  useEffect(() => {
    if (!hasFile) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const debounceMs = fileSizeRef.current > 20 * 1024 * 1024 ? 800 : 300;
    debounceRef.current = setTimeout(fetchPreview, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [hasFile, fetchPreview]);

  // Re-preview when the user switches between files in batch mode. Keyed by
  // entry id rather than selectedIndex so a reorder (which moves selectedIndex
  // to follow the selected entry) does not abort an in-flight preview or
  // re-fetch the same file (#1114).
  const selectedEntryId = entries[selectedIndex]?.id ?? null;
  const prevSelectedEntryId = useRef(selectedEntryId);
  useEffect(() => {
    if (prevSelectedEntryId.current !== selectedEntryId && prevSelectedEntryId.current !== null) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (prevPreviewUrlRef.current) {
        URL.revokeObjectURL(prevPreviewUrlRef.current);
        prevPreviewUrlRef.current = null;
      }
      onComparisonPreviewRef.current?.(null);
      setPreview(IDLE_PREVIEW);
      if (selectedEntryId !== null && hasFile) {
        fetchPreview();
      }
    }
    prevSelectedEntryId.current = selectedEntryId;
  }, [selectedEntryId, hasFile, fetchPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
      onComparisonPreviewRef.current?.(null);
    };
  }, []);

  // Final process handler (creates workspace + download link)
  const handleProcess = () => {
    // A failed preview's message describes the settings the run is replacing,
    // so it clears with the rest of the preview state (#2185).
    const hadPendingPreview =
      debounceRef.current !== null || abortRef.current !== null || preview.error !== null;
    settingsEditedAfterRunRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (hadPendingPreview) {
      if (prevPreviewUrlRef.current) {
        URL.revokeObjectURL(prevPreviewUrlRef.current);
        prevPreviewUrlRef.current = null;
      }
      setPreview(IDLE_PREVIEW);
      onComparisonPreviewRef.current?.(null);
    } else if (preview.previewUrl && entryIdRef.current && format !== "jxl") {
      onComparisonPreviewRef.current?.({
        entryId: entryIdRef.current,
        url: preview.previewUrl,
        originalSize: preview.originalSize ?? 0,
        processedSize: preview.processedSize ?? 0,
        supersedesResult: false,
      });
    } else {
      onComparisonPreviewRef.current?.(null);
    }
    const settings = buildSettings();
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  const savings =
    preview.originalSize && preview.processedSize
      ? ((1 - preview.processedSize / preview.originalSize) * 100).toFixed(1)
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Format selector */}
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {t.toolSettings["optimize-for-web"].outputFormat}
        </p>
        <div className="grid grid-cols-5 gap-1 mt-1">
          {(["webp", "jpeg", "avif", "png", "jxl"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`text-xs py-1.5 rounded font-medium transition-colors ${
                format === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider - hidden for PNG */}
      {format !== "png" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="web-quality" className="text-xs text-muted-foreground">
              {t.toolSettings["optimize-for-web"].quality}
            </label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            id="web-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{t.toolSettings["optimize-for-web"].smallestFile}</span>
            <span>{t.toolSettings["optimize-for-web"].bestQuality}</span>
          </div>
        </div>
      )}

      {/* Max dimensions - collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowDimensions(!showDimensions)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
        >
          {showDimensions ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span>{t.toolSettings["optimize-for-web"].maxDimensions}</span>
        </button>
        {showDimensions && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label htmlFor="max-width" className="text-[10px] text-muted-foreground">
                {t.toolSettings["optimize-for-web"].maxWidth}
              </label>
              <input
                id="max-width"
                type="number"
                value={maxWidth}
                onChange={(e) => setMaxWidth(clampDimension(e.target.value))}
                min={1}
                max={MAX_RESIZE_OUTPUT_DIMENSION}
                placeholder="px"
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div>
              <label htmlFor="max-height" className="text-[10px] text-muted-foreground">
                {t.toolSettings["optimize-for-web"].maxHeight}
              </label>
              <input
                id="max-height"
                type="number"
                value={maxHeight}
                onChange={(e) => setMaxHeight(clampDimension(e.target.value))}
                min={1}
                max={MAX_RESIZE_OUTPUT_DIMENSION}
                placeholder="px"
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>
        )}
      </div>

      {/* Strip metadata toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="strip-meta" className="text-xs text-muted-foreground">
          {t.toolSettings["optimize-for-web"].stripMetadata}
        </label>
        <button
          id="strip-meta"
          type="button"
          role="switch"
          aria-checked={stripMetadata}
          onClick={() => setStripMetadata(!stripMetadata)}
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
            stripMetadata ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
              stripMetadata ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* The last preview failed: say why instead of leaving the panel silent (#2185). */}
      {preview.error && (
        <p
          role="alert"
          className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-destructive-ink"
        >
          {preview.error}
        </p>
      )}

      {/* Size comparison card */}
      {(preview.originalSize || preview.loading) && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t.toolSettings["optimize-for-web"].sizeComparison}
            </span>
            {preview.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {preview.originalSize != null && (
            <div className="text-xs text-muted-foreground">
              {t.toolSettings["optimize-for-web"].original} {formatSize(preview.originalSize)}
            </div>
          )}
          {preview.processedSize != null && (
            <div className="text-xs text-muted-foreground">
              {t.toolSettings["optimize-for-web"].optimized} {formatSize(preview.processedSize)}
              <span className="ms-1 font-medium uppercase text-[10px]">
                {FORMAT_LABELS[format]}
              </span>
            </div>
          )}
          {savings != null && (
            <div
              className={`text-sm font-semibold ${
                Number(savings) > 0 ? "text-success-ink" : "text-destructive-ink"
              }`}
            >
              {Number(savings) > 0
                ? formatMessage(t.toolSettings["optimize-for-web"].smaller, { percent: savings })
                : formatMessage(t.toolSettings["optimize-for-web"].larger, {
                    percent: Math.abs(Number(savings)),
                  })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Process / Download */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["optimize-for-web"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? formatMessage(t.toolSettings["optimize-for-web"].submitBatch, {
                count: files.length,
              })
            : t.toolSettings["optimize-for-web"].submit}
        </button>
      )}

      {downloadUrl && <ResultDownloadLink href={downloadUrl} toolId="optimize-for-web" />}
    </form>
  );
}
