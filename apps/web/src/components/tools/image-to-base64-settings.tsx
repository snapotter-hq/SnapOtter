import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
import {
  type Base64Error,
  type Base64Result,
  beginBase64Run,
  useBase64Store,
} from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";

type ServerBase64Result = Omit<Base64Result, "entryId">;
type ServerBase64Error = Omit<Base64Error, "entryId">;

interface Base64Response {
  results: ServerBase64Result[];
  errors: ServerBase64Error[];
}

function isBase64Result(value: unknown): value is ServerBase64Result {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.filename === "string" &&
    r.filename.length > 0 &&
    typeof r.mimeType === "string" &&
    r.mimeType.length > 0 &&
    typeof r.width === "number" &&
    Number.isFinite(r.width) &&
    r.width >= 0 &&
    typeof r.height === "number" &&
    Number.isFinite(r.height) &&
    r.height >= 0 &&
    typeof r.originalSize === "number" &&
    Number.isFinite(r.originalSize) &&
    r.originalSize >= 0 &&
    typeof r.encodedSize === "number" &&
    Number.isFinite(r.encodedSize) &&
    r.encodedSize >= 0 &&
    typeof r.overheadPercent === "number" &&
    Number.isFinite(r.overheadPercent) &&
    typeof r.base64 === "string" &&
    r.base64.length > 0 &&
    typeof r.dataUri === "string" &&
    r.dataUri.length > 0
  );
}

function isBase64Error(value: unknown): value is ServerBase64Error {
  if (value === null || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.filename === "string" &&
    e.filename.length > 0 &&
    typeof e.error === "string" &&
    e.error.trim().length > 0
  );
}

function isBase64Response(value: unknown): value is Base64Response {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.results) &&
    data.results.every(isBase64Result) &&
    Array.isArray(data.errors) &&
    data.errors.every(isBase64Error) &&
    data.results.length + data.errors.length > 0
  );
}

// Format names (JPEG, PNG, ...) are locale-invariant; "original" resolves via i18n.
const OUTPUT_FORMATS = [
  { value: "original", label: null },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "jxl", label: "JXL" },
] as const;

export function ImageToBase64Settings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["image-to-base64"];
  const { entries } = useFileStore();
  const { processing, setProcessing, setProgress, addResult, addError, reset } = useBase64Store();

  const [outputFormat, setOutputFormat] = useState("original");
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (entries.length === 0) return;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "image-to-base64",
      is_batch: entries.length > 1,
      file_count: entries.length,
    });

    setProcessing(true);
    setError(null);
    reset();
    setProcessing(true);

    const runController = new AbortController();
    let currentEntryId: string | null = null;
    let currentEntryController: AbortController | null = null;
    const run = beginBase64Run(() => {
      runController.abort();
      currentEntryController?.abort();
    });
    const runEntryIds = new Set(entries.map((e) => e.id));
    const isEntryPresent = (id: string) => useFileStore.getState().entries.some((e) => e.id === id);
    const unsubscribeFiles = useFileStore.subscribe((state) => {
      if (!state.entries.some((e) => runEntryIds.has(e.id))) {
        runController.abort();
        currentEntryController?.abort();
      } else if (currentEntryId && !state.entries.some((e) => e.id === currentEntryId)) {
        currentEntryController?.abort();
      }
    });
    const isCanceled = () => !run.isCurrent() || runController.signal.aborted;

    const settings = JSON.stringify({ outputFormat, quality, maxWidth, maxHeight });

    try {
      for (let i = 0; i < entries.length; i++) {
        if (isCanceled()) break;
        const { id: entryId, file } = entries[i];
        if (!isEntryPresent(entryId)) continue;
        setProgress({ completed: i, total: entries.length, currentFile: file.name });

        const entryController = new AbortController();
        currentEntryId = entryId;
        currentEntryController = entryController;

        let res: Response;
        try {
          const formData = new FormData();
          formData.append("files", file);
          formData.append("settings", settings);

          res = await fetch(appUrl("/api/v1/tools/image/image-to-base64"), {
            method: "POST",
            headers: formatHeaders(),
            body: formData,
            signal: entryController.signal,
          });
        } catch (err) {
          if (isCanceled()) break;
          if (
            entryController.signal.aborted ||
            !isEntryPresent(entryId) ||
            (err instanceof DOMException && err.name === "AbortError")
          ) {
            continue;
          }
          addError({
            entryId,
            filename: file.name,
            error: err instanceof Error ? err.message : "Failed to convert",
          });
          continue;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (isCanceled()) break;
          if (entryController.signal.aborted || !isEntryPresent(entryId)) continue;
          addError({
            entryId,
            filename: file.name,
            error: failedAnswerMessage(t, body, res.status, `Failed: ${res.status}`),
          });
          continue;
        }

        let data: unknown;
        try {
          data = await res.json();
        } catch (err) {
          if (isCanceled()) break;
          if (
            entryController.signal.aborted ||
            !isEntryPresent(entryId) ||
            (err instanceof DOMException && err.name === "AbortError")
          ) {
            continue;
          }
          console.warn(
            "Unexpected image-to-base64 response:",
            err instanceof Error ? err.message : err,
          );
          addError({
            entryId,
            filename: file.name,
            error: t.errors.invalidServerResponse,
          });
          continue;
        }
        if (isCanceled()) break;
        if (entryController.signal.aborted || !isEntryPresent(entryId)) continue;
        if (!isBase64Response(data)) {
          console.warn("Unexpected image-to-base64 response shape");
          addError({
            entryId,
            filename: file.name,
            error: t.errors.invalidServerResponse,
          });
          continue;
        }
        for (const r of data.results) addResult({ ...r, entryId });
        for (const e of data.errors) addError({ ...e, entryId });
      }
    } finally {
      currentEntryId = null;
      currentEntryController = null;
      unsubscribeFiles();
      run.end();
      if (run.isCurrent()) {
        setProgress(null);
        setProcessing(false);
      }
    }
  };

  const hasFiles = entries.length > 0;
  const showQuality =
    outputFormat === "jpeg" ||
    outputFormat === "webp" ||
    outputFormat === "avif" ||
    outputFormat === "jxl";

  return (
    <div className="space-y-4">
      {/* Output Format */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">{ts.outputImageFormat}</span>
        <p className="text-[10px] text-muted-foreground mb-1.5">
          {ts.convertBeforeEncodingToControl}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {OUTPUT_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              type="button"
              onClick={() => setOutputFormat(fmt.value)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                outputFormat === fmt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {fmt.value === "original" ? ts.keepOriginal : fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider */}
      {showQuality && (
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="b64-quality" className="text-xs font-medium text-muted-foreground">
              {ts.quality}
            </label>
            <span className="text-xs font-mono text-foreground">{quality}%</span>
          </div>
          <input
            id="b64-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1 accent-primary"
          />
          <p className="text-[10px] text-muted-foreground">{ts.lowerQualitySmallerBase64String}</p>
        </div>
      )}

      {/* Max Width */}
      <div>
        <label htmlFor="b64-max-width" className="text-xs font-medium text-muted-foreground">
          {ts.maxWidthPx}
        </label>
        <input
          id="b64-max-width"
          type="number"
          min={0}
          value={maxWidth}
          onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value)))}
          placeholder={ts.t0NoLimit}
          className="mt-1 w-full rounded bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>

      {/* Max Height */}
      <div>
        <label htmlFor="b64-max-height" className="text-xs font-medium text-muted-foreground">
          {ts.maxHeightPx}
        </label>
        <input
          id="b64-max-height"
          type="number"
          min={0}
          value={maxHeight}
          onChange={(e) => setMaxHeight(Math.max(0, Number(e.target.value)))}
          placeholder={ts.t0NoLimit}
          className="mt-1 w-full rounded bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {ts.resizeBeforeEncodingAspectRatio}
        </p>
      </div>

      {/* Process button */}
      <button
        type="button"
        data-testid="base64-submit"
        onClick={handleProcess}
        disabled={!hasFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? ts.converting
          : entries.length > 1
            ? format(ts.submitWithCount, { count: entries.length })
            : ts.submit}
      </button>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}
    </div>
  );
}
