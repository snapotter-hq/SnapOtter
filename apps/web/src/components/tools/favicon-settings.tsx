import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProgressCard } from "@/components/common/progress-card";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

const SIZES = [
  { name: "favicon-16x16.png", size: "16x16" },
  { name: "favicon-32x32.png", size: "32x32" },
  { name: "favicon-48x48.png", size: "48x48" },
  { name: "apple-touch-icon.png", size: "180x180" },
  { name: "android-chrome-192x192.png", size: "192x192" },
  { name: "android-chrome-512x512.png", size: "512x512" },
  { name: "favicon.ico", size: "32x32" },
];

export function FaviconSettings() {
  const { files, error, setProcessing, setError } = useFileStore();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
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

    flushSync(() => {
      setBusy(true);
      setProcessing(true);
      setError(null);
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
      }
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

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.responseType = "blob";
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
        const blob = xhr.response as Blob;
        setDownloadUrl(URL.createObjectURL(blob));
        setProgress((prev) => ({ ...prev, phase: "complete", percent: 100 }));
      } else {
        setError(`Favicon generation failed: ${xhr.status}`);
      }
      cleanup();
    };

    xhr.onerror = () => {
      setError("Network error during favicon generation");
      cleanup();
    };

    xhr.ontimeout = () => {
      setError("Request timed out - the server may be overloaded");
      cleanup();
    };

    xhr.open("POST", "/api/v1/tools/favicon");
    formatHeaders().forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
  }, [files, setProcessing, setError, downloadUrl]);

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload square images (recommended 512x512 or larger) to generate all favicon and app icon
        sizes.{" "}
        {files.length > 1 && `Each of the ${files.length} images gets its own folder in the ZIP.`}
      </p>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Generated Sizes (per image)</p>
        <div className="mt-1 space-y-0.5">
          {SIZES.map((s) => (
            <div key={s.name} className="flex justify-between text-xs text-foreground">
              <span className="font-mono">{s.name}</span>
              <span className="text-muted-foreground">{s.size}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">+ manifest.json + HTML snippet</p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {busy ? (
        <ProgressCard
          active={busy}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Generating Favicons"
          stage={
            progress.phase === "uploading"
              ? "Uploading images..."
              : `Processing ${files.length} image${files.length !== 1 ? "s" : ""}...`
          }
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="favicon-submit"
          onClick={handleProcess}
          disabled={!hasFiles || busy}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Generate Favicons ({files.length} image{files.length !== 1 ? "s" : ""})
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download="favicons.zip"
          data-testid="favicon-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Favicons ZIP
        </a>
      )}
    </div>
  );
}
