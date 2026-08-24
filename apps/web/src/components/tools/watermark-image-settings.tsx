import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export function WatermarkImageSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [position, setPosition] = useState<Position>("bottom-right");
  const [opacity, setOpacity] = useState(50);
  const [scale, setScale] = useState(25);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (files.length === 0 || !watermarkFile) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);

    const settingsJson = JSON.stringify({ position, opacity, scale });

    if (files.length === 1) {
      try {
        const formData = new FormData();
        formData.append("file", files[0]);
        formData.append("watermark", watermarkFile);
        formData.append("settings", settingsJson);

        const res = await fetch("/api/v1/tools/image/watermark-image", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Processing failed: ${res.status}`);
        }

        const result = await res.json();
        setJobId(result.jobId);
        setProcessedUrl(result.downloadUrl);
        setDownloadUrl(result.downloadUrl);
        setOriginalSize(result.originalSize);
        setProcessedSize(result.processedSize);
        setSizes(result.originalSize, result.processedSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Processing failed");
      } finally {
        setProcessing(false);
      }
    } else {
      // Multiple files: process each one individually, writing results to each entry
      try {
        const store = useFileStore.getState();
        for (let i = 0; i < files.length; i++) {
          store.updateEntry(i, { status: "processing", error: null });
          try {
            const formData = new FormData();
            formData.append("file", files[i]);
            formData.append("watermark", watermarkFile);
            formData.append("settings", settingsJson);

            const res = await fetch("/api/v1/tools/image/watermark-image", {
              method: "POST",
              headers: formatHeaders(),
              body: formData,
            });

            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              store.updateEntry(i, { status: "failed", error: body.error || "Processing failed" });
              continue;
            }

            const result = await res.json();
            store.updateEntry(i, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: result.previewUrl ?? null,
              processedFilename: null,
              status: "completed",
              originalSize: result.originalSize,
              processedSize: result.processedSize,
            });
          } catch (err) {
            store.updateEntry(i, {
              status: "failed",
              error: err instanceof Error ? err.message : "Processing failed",
            });
          }
        }
      } finally {
        setProcessing(false);
      }
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-image"].watermarkImage}
        </p>
        <input
          ref={watermarkInputRef}
          type="file"
          accept="image/*,.avif,.heic,.heif,.hif"
          onChange={(e) => setWatermarkFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => watermarkInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {watermarkFile
            ? watermarkFile.name
            : t.toolSettings["watermark-image"].chooseWatermarkImage}
        </button>
      </div>

      <div>
        <label htmlFor="watermark-image-position" className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-image"].position}
        </label>
        <select
          id="watermark-image-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="center">{t.toolSettings["watermark-image"].center}</option>
          <option value="top-left">{t.toolSettings["watermark-image"].topLeft}</option>
          <option value="top-right">{t.toolSettings["watermark-image"].topRight}</option>
          <option value="bottom-left">{t.toolSettings["watermark-image"].bottomLeft}</option>
          <option value="bottom-right">{t.toolSettings["watermark-image"].bottomRight}</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-opacity" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-image"].opacity}
          </label>
          <span className="text-xs font-mono text-foreground">{opacity}%</span>
        </div>
        <input
          id="watermark-image-opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-scale" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-image"].scale}
          </label>
          <span className="text-xs font-mono text-foreground">{scale}%</span>
        </div>
        <input
          id="watermark-image-scale"
          type="range"
          min={5}
          max={100}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["watermark-image"].originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["watermark-image"].processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      <button
        type="button"
        data-testid="watermark-image-submit"
        onClick={handleProcess}
        disabled={!hasFile || !watermarkFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? t.toolSettings["watermark-image"].processing
          : files.length > 1
            ? format(t.toolSettings["watermark-image"].submitBatch, { count: files.length })
            : t.toolSettings["watermark-image"].submit}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="watermark-image-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </div>
  );
}
