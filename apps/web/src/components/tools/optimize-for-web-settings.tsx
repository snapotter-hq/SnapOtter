import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

type WebFormat = "webp" | "jpeg" | "avif" | "png" | "jxl";

interface PreviewState {
  loading: boolean;
  previewUrl: string | null;
  processedSize: number | null;
  originalSize: number | null;
}

const FORMAT_LABELS: Record<WebFormat, string> = {
  webp: "WebP",
  jpeg: "JPEG",
  avif: "AVIF",
  png: "PNG",
  jxl: "JXL",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OptimizeForWebSettings() {
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
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    previewUrl: null,
    processedSize: null,
    originalSize: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewUrlRef = useRef<string | null>(null);

  const hasFile = files.length > 0;

  // Use a ref for the current file so fetchPreview doesn't depend on the
  // reactive entry (which changes when we write processedUrl back to the store).
  const fileRef = useRef<File | null>(null);
  const fileSizeRef = useRef(0);
  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    const entry = entries[selectedIndex];
    if (entry) {
      fileRef.current = entry.file;
      fileSizeRef.current = entry.file.size;
    }
    selectedIndexRef.current = selectedIndex;
  }, [entries, selectedIndex]);

  // Build settings object
  const buildSettings = useCallback(() => {
    const settings: Record<string, unknown> = {
      format,
      quality,
      progressive: true,
      stripMetadata,
    };
    const mw = Number(maxWidth);
    const mh = Number(maxHeight);
    if (mw > 0) settings.maxWidth = mw;
    if (mh > 0) settings.maxHeight = mh;
    return settings;
  }, [format, quality, maxWidth, maxHeight, stripMetadata]);

  // Live preview - reads file from ref to avoid re-trigger loop
  const fetchPreview = useCallback(() => {
    const file = fileRef.current;
    if (!file) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setPreview((prev) => ({ ...prev, loading: true }));

    const idx = selectedIndexRef.current;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify(buildSettings()));

    fetch("/api/v1/tools/image/optimize-for-web/preview", {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview failed: ${response.status}`);

        const originalSize = Number(response.headers.get("X-Original-Size") ?? "0");
        const processedSize = Number(response.headers.get("X-Processed-Size") ?? "0");
        const blob = await response.blob();
        const previewUrl = URL.createObjectURL(blob);

        // Revoke previous preview URL
        if (prevPreviewUrlRef.current) {
          URL.revokeObjectURL(prevPreviewUrlRef.current);
        }
        prevPreviewUrlRef.current = previewUrl;

        // Write the preview into the file store so BeforeAfterSlider picks it up
        useFileStore.getState().updateEntry(idx, {
          processedUrl: previewUrl,
          processedPreviewUrl: null,
          processedFilename: null,
          status: "completed",
          originalSize,
          processedSize,
        });

        setPreview({
          loading: false,
          previewUrl,
          processedSize,
          originalSize,
        });
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setPreview((prev) => ({ ...prev, loading: false }));
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [hasFile, fetchPreview]);

  // Re-preview when the user switches between files in batch mode
  const prevSelectedIndex = useRef(selectedIndex);
  useEffect(() => {
    if (prevSelectedIndex.current !== selectedIndex && hasFile) {
      prevSelectedIndex.current = selectedIndex;
      fetchPreview();
    }
  }, [selectedIndex, hasFile, fetchPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
    };
  }, []);

  // Final process handler (creates workspace + download link)
  const handleProcess = () => {
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
        <p className="text-sm font-medium text-muted-foreground">Output Format</p>
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
              Quality
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
            <span>Smallest file</span>
            <span>Best quality</span>
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
          <span>Max Dimensions</span>
        </button>
        {showDimensions && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label htmlFor="max-width" className="text-[10px] text-muted-foreground">
                Max Width
              </label>
              <input
                id="max-width"
                type="number"
                value={maxWidth}
                onChange={(e) => setMaxWidth(e.target.value)}
                min={1}
                placeholder="px"
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div>
              <label htmlFor="max-height" className="text-[10px] text-muted-foreground">
                Max Height
              </label>
              <input
                id="max-height"
                type="number"
                value={maxHeight}
                onChange={(e) => setMaxHeight(e.target.value)}
                min={1}
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
          Strip Metadata
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

      {/* Size comparison card */}
      {(preview.originalSize || preview.loading) && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Size Comparison</span>
            {preview.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {preview.originalSize != null && (
            <div className="text-xs text-muted-foreground">
              Original: {formatSize(preview.originalSize)}
            </div>
          )}
          {preview.processedSize != null && (
            <div className="text-xs text-muted-foreground">
              Optimized: {formatSize(preview.processedSize)}
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
              {Number(savings) > 0 ? `${savings}% smaller` : `${Math.abs(Number(savings))}% larger`}
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
          label="Optimizing"
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
          {files.length > 1 ? `Process & Download (${files.length} files)` : "Process & Download"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
