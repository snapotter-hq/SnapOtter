import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const SIZE_OPTIONS = [
  { size: 16, name: "favicon-16x16.png", label: "16x16" },
  { size: 32, name: "favicon-32x32.png", label: "32x32" },
  { size: 48, name: "favicon-48x48.png", label: "48x48" },
  { size: 180, name: "apple-touch-icon.png", label: "180x180" },
  { size: 192, name: "android-chrome-192x192.png", label: "192x192" },
  { size: 512, name: "android-chrome-512x512.png", label: "512x512" },
];

const ALL_SIZES = SIZE_OPTIONS.map((s) => s.size);
const PREVIEW_BOXES = [64, 48, 32];

export function FaviconSettings() {
  const { t } = useTranslation();
  const { files, error, setProcessing, setError } = useFileStore();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const blobUrl = entry?.blobUrl;

  // Settings state
  const [bgMode, setBgMode] = useState<"transparent" | "color">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [padding, setPadding] = useState(0);
  const [radius, setRadius] = useState(0);
  const [themeColor, setThemeColor] = useState("#ffffff");
  const [selectedSizes, setSelectedSizes] = useState<Set<number>>(() => new Set(ALL_SIZES));

  // Download / progress state
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

  const toggleSize = (size: number) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
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

    // Build settings
    const settings: Record<string, unknown> = {
      padding,
      radius,
      themeColor,
    };
    if (bgMode === "color") {
      settings.background = bgColor;
    }
    if (selectedSizes.size < ALL_SIZES.length) {
      settings.sizes = Array.from(selectedSizes);
    }
    formData.append("settings", JSON.stringify(settings));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.responseType = "blob";
    xhr.timeout = 300_000;

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

    xhr.open("POST", "/api/v1/tools/image/favicon");
    formatHeaders().forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
  }, [
    files,
    setProcessing,
    setError,
    downloadUrl,
    bgMode,
    bgColor,
    padding,
    radius,
    themeColor,
    selectedSizes,
  ]);

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t.toolSettings.favicon.uploadHint}{" "}
        {files.length > 1 && format(t.toolSettings.favicon.multipleHint, { count: files.length })}
      </p>

      {/* Live preview grid */}
      {hasFiles && blobUrl && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
          <div className="flex items-end justify-center gap-3">
            {PREVIEW_BOXES.map((px) => {
              const insetPx = Math.round((px * padding) / 100);
              return (
                <div key={px} className="flex flex-col items-center gap-1">
                  <div
                    className="relative overflow-hidden"
                    style={{
                      width: px,
                      height: px,
                      borderRadius: `${radius}%`,
                      background: bgMode === "color" ? bgColor : "transparent",
                    }}
                  >
                    {bgMode === "transparent" && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage:
                            "linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%)",
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                        }}
                      />
                    )}
                    <div
                      className="relative"
                      style={{
                        padding: insetPx,
                        width: "100%",
                        height: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <img
                        src={blobUrl}
                        alt=""
                        draggable={false}
                        className="select-none block"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{px}px</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Background */}
      <div>
        <span className="text-xs text-muted-foreground">Background</span>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex flex-1 gap-1">
            <button
              type="button"
              onClick={() => setBgMode("transparent")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "transparent" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Transparent
            </button>
            <button
              type="button"
              onClick={() => setBgMode("color")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "color" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Color
            </button>
          </div>
          {bgMode === "color" && (
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              aria-label="Background color"
              className="h-7 w-9 shrink-0 rounded border border-border bg-background"
            />
          )}
        </div>
      </div>

      {/* Padding */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Padding</span>
          <span className="text-xs font-mono text-foreground">{padding}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={40}
          value={padding}
          onChange={(e) => setPadding(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Radius */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Corner Radius</span>
          <span className="text-xs font-mono text-foreground">{radius}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Square</span>
          <span>Circle</span>
        </div>
      </div>

      {/* Theme color */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Theme Color</span>
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            aria-label="Theme color"
            className="h-7 w-9 shrink-0 rounded border border-border bg-background"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Used in manifest.json for browser chrome
        </p>
      </div>

      {/* Size checklist */}
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {t.toolSettings.favicon.generatedSizes}
        </p>
        <div className="mt-1 space-y-1">
          {SIZE_OPTIONS.map((s) => (
            <label key={s.size} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSizes.has(s.size)}
                onChange={() => toggleSize(s.size)}
                className="rounded border-border accent-primary"
              />
              <span className="font-mono text-foreground">{s.name}</span>
              <span className="text-muted-foreground ms-auto">{s.label}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {t.toolSettings.favicon.plusManifest}
        </p>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {busy ? (
        <ProgressCard
          active={busy}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.favicon.progressLabel}
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
          {files.length !== 1
            ? format(t.toolSettings.favicon.submitPlural, { count: files.length })
            : format(t.toolSettings.favicon.submit, { count: files.length })}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download="favicons.zip"
          data-testid="favicon-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Favicons ZIP
        </a>
      )}
    </div>
  );
}
