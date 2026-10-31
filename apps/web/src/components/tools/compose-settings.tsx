import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { FeedbackCategoryError, feedbackCategoryOf } from "@/lib/feedback";
import { format } from "@/lib/format";
import { displayStoredError, useFileStore } from "@/stores/file-store";

interface ComposeEntryResult {
  downloadUrl: string;
  originalSize: number | null;
  processedSize: number | null;
}

interface ComposeResponse {
  jobId?: string | null;
  downloadUrl: string;
  previewUrl?: string | null;
  originalSize?: number | null;
  processedSize?: number | null;
}

function isOptionalUrl(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length > 0);
}

function isOptionalSize(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isComposeResponse(value: unknown): value is ComposeResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.downloadUrl === "string" &&
    data.downloadUrl.length > 0 &&
    isOptionalUrl(data.previewUrl) &&
    isOptionalSize(data.originalSize) &&
    isOptionalSize(data.processedSize)
  );
}

export function ComposeSettings() {
  const { t } = useTranslation();
  const { files, currentEntry, processing, error, setProcessing, setError, setJobId } =
    useFileStore();
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [blendMode, setBlendMode] = useState("over");
  const [resultsByEntry, setResultsByEntry] = useState<Record<string, ComposeEntryResult>>({});
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const handleProcess = async () => {
    if (files.length === 0 || !overlayFile) return;
    const { entries, selectedIndex } = useFileStore.getState();
    const capturedEntry = entries[selectedIndex] ?? entries[0];
    if (!capturedEntry) return;
    const entryId = capturedEntry.id;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "compose",
      is_batch: false,
      file_count: 1,
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setResultsByEntry((prev) => {
      if (!(entryId in prev)) return prev;
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    if (
      capturedEntry.processedUrl !== null ||
      capturedEntry.processedPreviewUrl !== null ||
      capturedEntry.processedSize !== null ||
      capturedEntry.status !== "pending" ||
      capturedEntry.error !== null
    ) {
      if (capturedEntry.processedUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(capturedEntry.processedUrl);
      }
      useFileStore.getState().updateEntryById(entryId, {
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        status: "pending",
        error: null,
      });
    }

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (
        !state.processing ||
        !state.entries.some((e) => e.id === capturedEntry.id && e.file === capturedEntry.file)
      ) {
        storeReset = true;
        if (abortRef.current === controller) abortRef.current = null;
        unsubscribe();
        if (state.processing) {
          setProcessing(false);
        }
        controller.abort();
      }
    });

    try {
      const formData = new FormData();
      formData.append("file", capturedEntry.file);
      formData.append("overlay", overlayFile);
      formData.append("settings", JSON.stringify({ x, y, opacity, blendMode }));

      const res = await fetch(appUrl("/api/v1/tools/image/compose"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      }).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new FeedbackCategoryError(
          err instanceof Error ? err.message : t.errors.network,
          "upload_error",
        );
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = failedAnswerMessage(
          t,
          body,
          res.status,
          format(t.errors.processingFailedWithStatus, { status: res.status }),
        );
        throw res.status === 413
          ? new FeedbackCategoryError(message, "upload_error")
          : new Error(message);
      }

      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (controller.signal.aborted || storeReset) return;
      const result = resolveServerUrls(raw);
      if (!isComposeResponse(result)) {
        throw new FeedbackCategoryError(t.errors.invalidServerResponse, "processing_error");
      }
      if (typeof result.jobId === "string" && result.jobId) {
        setJobId(result.jobId);
      }
      useFileStore.getState().updateEntryById(entryId, {
        processedUrl: result.downloadUrl,
        processedPreviewUrl: result.previewUrl ?? null,
        processedFilename: null,
        status: "completed",
        ...(result.originalSize != null ? { originalSize: result.originalSize } : {}),
        processedSize: result.processedSize ?? null,
      });
      setResultsByEntry((prev) => ({
        ...prev,
        [entryId]: {
          downloadUrl: result.downloadUrl,
          originalSize: result.originalSize ?? capturedEntry.originalSize,
          processedSize: result.processedSize ?? null,
        },
      }));
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      useFileStore.getState().updateEntryById(entryId, {
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        status: "failed",
        error: err instanceof Error ? err.message : t.errors.processingFailedNoDetail,
        errorCategory: feedbackCategoryOf(err),
      });
    } finally {
      unsubscribe();
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  };

  const hasFile = files.length > 0;
  const displayError = displayStoredError(
    currentEntry?.error ?? error,
    t.tools.processing.canceled,
  );
  const activeEntryResult =
    currentEntry && currentEntry.processedUrl !== null
      ? resultsByEntry[currentEntry.id]
      : undefined;
  const downloadUrl = activeEntryResult?.downloadUrl ?? null;
  const originalSize = activeEntryResult
    ? (activeEntryResult.originalSize ?? currentEntry?.originalSize ?? null)
    : null;
  const processedSize = activeEntryResult?.processedSize ?? null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="compose-overlay-image" className="text-xs text-muted-foreground">
          {t.toolSettings.compose.overlayImage}
        </label>
        <input
          id="compose-overlay-image"
          ref={overlayInputRef}
          type="file"
          accept="image/*,.avif,.heic,.heif,.hif,.jxl,.dng,.cr2,.cr3,.nef,.nrw,.arw,.orf,.rw2,.raf,.pef,.3fr,.iiq,.srw,.x3f,.rwl,.gpr,.fff,.mrw,.mef,.kdc,.dcr,.erf,.ptx,.tga,.psd,.exr,.hdr,.svgz,.jp2,.j2k,.qoi,.eps,.dds,.cur,.apng,.dpx,.cin,.fits,.ppm,.pgm,.pbm,.pfm"
          onChange={(e) => setOverlayFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => overlayInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {overlayFile ? overlayFile.name : t.toolSettings.compose.chooseOverlayImage}
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="compose-x-position" className="text-xs text-muted-foreground">
            {t.toolSettings.compose.xPosition}
          </label>
          <input
            id="compose-x-position"
            type="number"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="compose-y-position" className="text-xs text-muted-foreground">
            {t.toolSettings.compose.yPosition}
          </label>
          <input
            id="compose-y-position"
            type="number"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="compose-opacity" className="text-xs text-muted-foreground">
            {t.toolSettings.compose.opacity}
          </label>
          <span className="text-xs font-mono text-foreground">{opacity}%</span>
        </div>
        <input
          id="compose-opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="compose-blend-mode" className="text-xs text-muted-foreground">
          {t.toolSettings.compose.blendMode}
        </label>
        <select
          id="compose-blend-mode"
          value={blendMode}
          onChange={(e) => setBlendMode(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="over">{t.toolSettings.compose.normal}</option>
          <option value="multiply">{t.toolSettings.compose.multiply}</option>
          <option value="screen">{t.toolSettings.compose.screen}</option>
          <option value="overlay">{t.toolSettings.compose.overlay}</option>
          <option value="darken">{t.toolSettings.compose.darken}</option>
          <option value="lighten">{t.toolSettings.compose.lighten}</option>
          <option value="hard-light">{t.toolSettings.compose.hardLight}</option>
          <option value="soft-light">{t.toolSettings.compose.softLight}</option>
          <option value="difference">{t.toolSettings.compose.difference}</option>
          <option value="exclusion">{t.toolSettings.compose.exclusion}</option>
        </select>
      </div>

      {displayError && <p className="text-xs text-destructive-ink">{displayError}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings.compose.originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings.compose.processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      <button
        type="button"
        data-testid="compose-submit"
        onClick={handleProcess}
        disabled={!hasFile || !overlayFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? t.toolSettings.compose.processing : t.toolSettings.compose.submit}
      </button>

      {downloadUrl && (
        <ResultDownloadLink
          href={downloadUrl}
          testId="compose-download"
          claimEntryId={currentEntry?.id}
        />
      )}
    </div>
  );
}
