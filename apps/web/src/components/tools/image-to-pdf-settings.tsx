import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProgressCard } from "@/components/common/progress-card";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A3: [841.89, 1190.55],
  A5: [419.53, 595.28],
};

const PREVIEW_HEIGHT = 220;

function PdfPagePreview({
  pageSize,
  orientation,
  margin,
  imgUrl,
}: {
  pageSize: string;
  orientation: "portrait" | "landscape";
  margin: number;
  imgUrl: string | null;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!imgUrl) {
      setImgSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImgSize(null);
    img.src = imgUrl;
  }, [imgUrl]);

  let [pageW, pageH] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
  if (orientation === "landscape") [pageW, pageH] = [pageH, pageW];

  const scale = PREVIEW_HEIGHT / pageH;
  const previewW = pageW * scale;
  const previewH = PREVIEW_HEIGHT;
  const marginScaled = margin * scale;

  const contentW = previewW - marginScaled * 2;
  const contentH = previewH - marginScaled * 2;

  let imgStyle: React.CSSProperties | null = null;
  if (imgSize && imgUrl && contentW > 0 && contentH > 0) {
    const imgScale = Math.min(contentW / imgSize.w, contentH / imgSize.h, 1);
    const scaledW = imgSize.w * imgScale;
    const scaledH = imgSize.h * imgScale;
    imgStyle = {
      width: scaledW,
      height: scaledH,
      position: "absolute" as const,
      left: marginScaled + (contentW - scaledW) / 2,
      top: marginScaled + (contentH - scaledH) / 2,
      objectFit: "contain" as const,
    };
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Preview</p>
      <div className="flex justify-center">
        <div
          className="relative bg-white border border-border"
          style={{
            width: previewW,
            height: previewH,
            boxShadow: "2px 3px 8px rgba(0,0,0,0.10)",
            transition: "width 0.2s ease, height 0.2s ease",
          }}
        >
          {/* Margin area — dashed inner border */}
          {margin > 0 && (
            <div
              className="absolute border border-dashed border-blue-300/60"
              style={{
                left: marginScaled,
                top: marginScaled,
                width: contentW,
                height: contentH,
                transition: "all 0.2s ease",
              }}
            />
          )}
          {/* Image thumbnail */}
          {imgStyle && imgUrl && (
            <img src={imgUrl} alt="Preview" style={{ ...imgStyle, transition: "all 0.2s ease" }} />
          )}
          {/* Empty state placeholder */}
          {!imgUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground/40">No image</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export function ImageToPdfSettings() {
  const { files, selectedIndex, entries, error, setProcessing, setError } = useFileStore();
  const [pageSize, setPageSize] = useState<"A4" | "Letter" | "A3" | "A5">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [margin, setMargin] = useState(20);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Local processing state so the ProgressCard renders reliably
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({
    phase: "idle" as "idle" | "uploading" | "processing" | "complete",
    percent: 0,
    elapsed: 0,
  });
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, []);

  const cleanup = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    elapsedRef.current = null;
    processingTimerRef.current = null;
    setBusy(false);
    setProcessing(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup uses only stable refs and state setters
  const handleProcess = useCallback(() => {
    if (files.length === 0) return;

    // flushSync forces React to paint the ProgressCard before the XHR starts,
    // so users always see feedback even if the request completes quickly.
    flushSync(() => {
      setBusy(true);
      setProcessing(true);
      setError(null);
      setDownloadUrl(null);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });
    });

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setProgress((prev) => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    formData.append("settings", JSON.stringify({ pageSize, orientation, margin }));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.timeout = 180_000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const uploadPercent = (event.loaded / event.total) * 40;
        setProgress((prev) =>
          prev.phase === "uploading" ? { ...prev, percent: uploadPercent } : prev,
        );
      }
    };

    xhr.upload.onload = () => {
      setProgress((prev) => ({ ...prev, phase: "processing", percent: 40 }));
      const step = (95 - 40) / 90;
      processingTimerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev.phase !== "processing") return prev;
          return { ...prev, percent: Math.min(95, prev.percent + step) };
        });
      }, 500);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          setDownloadUrl(result.downloadUrl);
          setProgress((prev) => ({ ...prev, phase: "complete", percent: 100 }));
        } catch {
          setError("Failed to parse server response");
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(body.error || `Failed: ${xhr.status}`);
        } catch {
          setError(`PDF creation failed: ${xhr.status}`);
        }
      }
      cleanup();
    };

    xhr.onerror = () => {
      setError("Network error during PDF creation");
      cleanup();
    };

    xhr.ontimeout = () => {
      setError("Request timed out - the server may be overloaded");
      cleanup();
    };

    xhr.open("POST", "/api/v1/tools/image-to-pdf");
    const headers = formatHeaders();
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value as string);
    }
    xhr.send(formData);
  }, [files, pageSize, orientation, margin, setProcessing, setError]);

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {files.length} image{files.length !== 1 ? "s" : ""} will be combined into a PDF, one image
        per page.
      </p>

      <div>
        <label htmlFor="image-to-pdf-page-size" className="text-xs text-muted-foreground">
          Page Size
        </label>
        <select
          id="image-to-pdf-page-size"
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value as typeof pageSize)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
          <option value="A3">A3</option>
          <option value="A5">A5</option>
        </select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Orientation</p>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setOrientation("portrait")}
            className={`flex-1 text-xs py-1.5 rounded ${orientation === "portrait" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => setOrientation("landscape")}
            className={`flex-1 text-xs py-1.5 rounded ${orientation === "landscape" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Landscape
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="image-to-pdf-margin" className="text-xs text-muted-foreground">
            Margin
          </label>
          <span className="text-xs font-mono text-foreground">{margin}pt</span>
        </div>
        <input
          id="image-to-pdf-margin"
          type="range"
          min={0}
          max={100}
          value={margin}
          onChange={(e) => setMargin(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <PdfPagePreview
        pageSize={pageSize}
        orientation={orientation}
        margin={margin}
        imgUrl={entries[selectedIndex]?.blobUrl ?? entries[0]?.blobUrl ?? null}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {busy ? (
        <ProgressCard
          active={busy}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Creating PDF"
          stage={
            progress.phase === "uploading"
              ? "Uploading images..."
              : `Processing ${files.length} pages...`
          }
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="image-to-pdf-submit"
          onClick={handleProcess}
          disabled={!hasFiles || busy}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Create PDF ({files.length} pages)
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="image-to-pdf-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      )}
    </div>
  );
}
