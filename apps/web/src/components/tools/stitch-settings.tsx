import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format as formatMessage } from "@/lib/format";
import { jobFailureMessage, parseResultBody, reportMalformedResult } from "@/lib/progress-frames";
import { useFileStore } from "@/stores/file-store";

type Direction = "horizontal" | "vertical" | "grid";
type ResizeMode = "fit" | "original" | "stretch" | "crop";
type Alignment = "start" | "center" | "end";
type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "jxl";

/** What the panel reads off the answer besides its URL. The API always sends them (#1857). */
const RESULT_FIELDS = ["jobId", "originalSize", "processedSize"] as const;

interface StitchResult {
  jobId: string;
  downloadUrl: string;
  originalSize: number;
  processedSize: number;
}

export function StitchSettings() {
  const { t } = useTranslation();
  const { files, currentEntry, processing, error, setProcessing, setError, setJobId } =
    useFileStore();

  const [direction, setDirection] = useState<Direction>("horizontal");
  const [gridColumns, setGridColumns] = useState(3);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("fit");
  const [alignment, setAlignment] = useState<Alignment>("center");
  const [gap, setGap] = useState(0);
  const [border, setBorder] = useState(0);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(90);
  const [downloadByEntry, setDownloadByEntry] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useSettleOnUnmount(
    () => xhrRef.current !== null,
    () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      const xhr = xhrRef.current;
      xhrRef.current = null;
      xhr?.abort();
    },
  );

  const handleProcess = () => {
    if (files.length < 2) return;
    const { entries, selectedIndex } = useFileStore.getState();
    const capturedEntry = entries[selectedIndex] ?? entries[0];
    if (!capturedEntry) return;
    const entryId = capturedEntry.id;

    unsubscribeRef.current?.();
    xhrRef.current?.abort();
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    setError(null);
    setProcessing(true);
    setDownloadByEntry({});
    for (const entry of useFileStore.getState().entries) {
      if (
        entry.processedUrl !== null ||
        entry.processedPreviewUrl !== null ||
        entry.processedSize !== null ||
        entry.status !== "pending" ||
        entry.error !== null
      ) {
        if (entry.processedUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(entry.processedUrl);
        }
        useFileStore.getState().updateEntryById(entry.id, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          processedSize: null,
          status: "pending",
          error: null,
        });
      }
    }
    setUploadProgress(0);

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (
        !state.processing ||
        !state.entries.some((e) => e.id === capturedEntry.id && e.file === capturedEntry.file)
      ) {
        storeReset = true;
        if (xhrRef.current === xhr) xhrRef.current = null;
        if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
        unsubscribe();
        if (state.processing) {
          setProcessing(false);
        }
        xhr.abort();
      }
    });
    unsubscribeRef.current = unsubscribe;

    const endSubscription = () => {
      if (unsubscribeRef.current === unsubscribe) {
        unsubscribeRef.current = null;
      }
      unsubscribe();
    };

    const failEntry = (message: string) => {
      try {
        useFileStore.getState().updateEntryById(entryId, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          processedSize: null,
          status: "failed",
          error: message,
        });
      } finally {
        setProcessing(false);
      }
    };

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append(
        "settings",
        JSON.stringify({
          direction,
          gridColumns,
          resizeMode,
          alignment,
          gap,
          border,
          cornerRadius,
          backgroundColor,
          format,
          quality,
        }),
      );

      xhr.open("POST", appUrl("/api/v1/tools/image/stitch"));

      const headers = formatHeaders();
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.upload.onprogress = (e) => {
        if (xhrRef.current !== xhr || storeReset) return;
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        endSubscription();
        if (xhrRef.current !== xhr || storeReset) return;
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          // Only a body that isn't a result is the server's fault, and it gets
          // reported (#1740). A throw while landing a good one is our own
          // store write failing: it fails the run with the tracking message
          // and is rethrown so it still surfaces (#1795, after #1354).
          let result: StitchResult;
          try {
            result = parseResultBody<StitchResult>(xhr.responseText, RESULT_FIELDS);
          } catch (err) {
            failEntry(t.errors.invalidResponse);
            reportMalformedResult(err, { status: xhr.status, toolId: "stitch" });
            return;
          }
          try {
            setJobId(result.jobId);
            useFileStore.getState().updateEntryById(entryId, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: null,
              processedFilename: null,
              status: "completed",
              originalSize: result.originalSize,
              processedSize: result.processedSize,
            });
            setDownloadByEntry((prev) => ({
              ...prev,
              [entryId]: result.downloadUrl,
            }));
            setProcessing(false);
          } catch (err) {
            try {
              failEntry(jobFailureMessage({ reason: "trackingFailed" }, t.errors));
            } catch (teardownErr) {
              console.error("Ending the run after a result handling error failed", teardownErr);
            }
            throw err;
          }
        } else {
          let message: string;
          try {
            const body = JSON.parse(xhr.responseText);
            message = failedAnswerMessage(
              t,
              body,
              xhr.status,
              formatMessage(t.errors.failedWithStatus, { status: xhr.status }),
            );
          } catch {
            message = failedAnswerMessage(
              t,
              null,
              xhr.status,
              formatMessage(t.errors.failedWithStatus, { status: xhr.status }),
            );
          }
          failEntry(message);
        }
      };

      xhr.onerror = () => {
        endSubscription();
        if (xhrRef.current !== xhr || storeReset) return;
        xhrRef.current = null;
        failEntry(t.errors.network);
      };

      xhr.send(formData);
    } catch (err) {
      endSubscription();
      if (xhrRef.current === xhr) xhrRef.current = null;
      if (!storeReset) {
        failEntry(err instanceof Error ? err.message : t.toolSettings.stitch.stitchFailed);
      }
    }
  };

  const hasEnoughFiles = files.length >= 2;
  const displayError = currentEntry?.error ?? error;
  const downloadUrl =
    currentEntry && currentEntry.processedUrl !== null
      ? (downloadByEntry[currentEntry.id] ?? null)
      : null;

  return (
    <div className="space-y-4">
      {/* Layout */}
      <div>
        <p className="text-xs text-muted-foreground">{t.toolSettings.stitch.direction}</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["horizontal", "vertical", "grid"] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDirection(d)}
              className={`capitalize text-xs py-1.5 rounded ${direction === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {direction === "grid" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="stitch-grid-columns" className="text-xs text-muted-foreground">
              {t.toolSettings.stitch.gridColumns}
            </label>
            <span className="text-xs font-mono text-foreground">{gridColumns}</span>
          </div>
          <input
            id="stitch-grid-columns"
            type="range"
            min={2}
            max={10}
            value={gridColumns}
            onChange={(e) => setGridColumns(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      <div className="border-t border-border" />

      {/* Size Handling */}
      <div>
        <p className="text-xs text-muted-foreground">{t.toolSettings.stitch.resizeMode}</p>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {(["fit", "original", "stretch", "crop"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setResizeMode(m)}
              className={`capitalize text-xs py-1.5 rounded ${resizeMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t.toolSettings.stitch.alignment}</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["start", "center", "end"] as const).map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAlignment(a)}
              className={`capitalize text-xs py-1.5 rounded ${alignment === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Spacing & Border */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-gap" className="text-xs text-muted-foreground">
            {t.toolSettings.stitch.gap}
          </label>
          <span className="text-xs font-mono text-foreground">{gap}px</span>
        </div>
        <input
          id="stitch-gap"
          type="range"
          min={0}
          max={200}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-border" className="text-xs text-muted-foreground">
            {t.toolSettings.stitch.border}
          </label>
          <span className="text-xs font-mono text-foreground">{border}px</span>
        </div>
        <input
          id="stitch-border"
          type="range"
          min={0}
          max={50}
          value={border}
          onChange={(e) => setBorder(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-corner-radius" className="text-xs text-muted-foreground">
            {t.toolSettings.stitch.cornerRadius}
          </label>
          <span className="text-xs font-mono text-foreground">{cornerRadius}px</span>
        </div>
        <input
          id="stitch-corner-radius"
          type="range"
          min={0}
          max={50}
          value={cornerRadius}
          onChange={(e) => setCornerRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="stitch-background-color" className="text-xs text-muted-foreground">
          {t.toolSettings.stitch.backgroundColor}
        </label>
        <input
          id="stitch-background-color"
          type="color"
          value={backgroundColor}
          onChange={(e) => setBackgroundColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border"
        />
      </div>

      <div className="border-t border-border" />

      {/* Output */}
      <div>
        <p className="text-xs text-muted-foreground">{t.toolSettings.stitch.format}</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["png", "jpeg", "webp", "avif", "jxl"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`uppercase text-xs py-1.5 rounded ${format === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {(format === "jpeg" || format === "webp" || format === "avif" || format === "jxl") && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="stitch-quality" className="text-xs text-muted-foreground">
              {t.toolSettings.stitch.quality}
            </label>
            <span className="text-xs font-mono text-foreground">{quality}%</span>
          </div>
          <input
            id="stitch-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {displayError && <p className="text-xs text-destructive-ink">{displayError}</p>}

      {processing && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {uploadProgress < 100
                ? t.toolSettings.stitch.uploading
                : t.toolSettings.stitch.stitching}
            </span>
            {uploadProgress < 100 && <span>{uploadProgress}%</span>}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            {uploadProgress < 100 ? (
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            ) : (
              <div className="h-full bg-primary rounded-full animate-pulse" />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="stitch-submit"
        onClick={handleProcess}
        disabled={!hasEnoughFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? uploadProgress < 100
            ? formatMessage(t.toolSettings.stitch.uploadingPercent, { percent: uploadProgress })
            : t.toolSettings.stitch.stitching
          : formatMessage(t.toolSettings.stitch.submitCount, { count: files.length })}
      </button>

      {downloadUrl && (
        <ResultDownloadLink
          href={downloadUrl}
          testId="stitch-download"
          label={t.toolSettings.stitch.downloadStitchedImage}
          claimEntryId={currentEntry?.id}
        />
      )}
    </div>
  );
}
