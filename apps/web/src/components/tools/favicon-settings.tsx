import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format, plural } from "@/lib/format";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { runEndWrites } from "@/lib/run-teardown";
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
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    };
  }, []);

  const stopTimers = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    elapsedRef.current = null;
    processingTimerRef.current = null;
  };

  // An abort fires neither onload nor onerror, so a run the unmount cuts off has to
  // be ended here, or `processing` stays set for good (#2304).
  useSettleOnUnmount(
    () => xhrRef.current !== null,
    () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      stopTimers();
      const xhr = xhrRef.current;
      xhrRef.current = null;
      xhr?.abort();
    },
  );

  const cleanup = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    stopTimers();
    xhrRef.current = null;
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

    const { entries: startEntries, selectedIndex: capturedIndex } = useFileStore.getState();
    const capturedEntryId = startEntries[capturedIndex]?.id ?? startEntries[0]?.id;

    unsubscribeRef.current?.();
    xhrRef.current?.abort();
    stopTimers();

    // The request is made, and the ref set, before the store flag goes up: a throw
    // between the two would leave `processing` set with nothing for the unmount to
    // end (#2304).
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    flushSync(() => {
      const revoked = new Set<string>();
      for (const entry of useFileStore.getState().entries) {
        if (entry.processedUrl) {
          if (entry.processedUrl.startsWith("blob:")) {
            revoked.add(entry.processedUrl);
            URL.revokeObjectURL(entry.processedUrl);
          }
          useFileStore.getState().updateEntryById(entry.id, {
            processedUrl: null,
            processedPreviewUrl: null,
            processedFilename: null,
            status: "pending",
            error: null,
          });
        }
      }
      if (downloadUrl) {
        if (downloadUrl.startsWith("blob:") && !revoked.has(downloadUrl)) {
          URL.revokeObjectURL(downloadUrl);
        }
        setDownloadUrl(null);
      }
      setError(null);
      setBusy(true);
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });
    });

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (!state.processing || state.entries.length === 0) {
        storeReset = true;
        if (xhrRef.current === xhr) xhrRef.current = null;
        if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
        unsubscribe();
        stopTimers();
        setBusy(false);
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

    try {
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

      xhr.responseType = "blob";
      xhr.timeout = 300_000;

      xhr.upload.onprogress = (event) => {
        if (xhrRef.current !== xhr || storeReset) return;
        if (event.lengthComputable) {
          const uploadPercent = (event.loaded / event.total) * 40;
          setProgress((prev) =>
            prev.phase === "uploading" ? { ...prev, percent: uploadPercent } : prev,
          );
        }
      };

      xhr.upload.onload = () => {
        if (xhrRef.current !== xhr || storeReset) return;
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
        if (xhrRef.current !== xhr || storeReset) {
          endSubscription();
          return;
        }
        stopTimers();
        if (xhr.status >= 200 && xhr.status < 300) {
          endSubscription();
          let url: string | null = null;
          try {
            const blob = xhr.response as Blob;
            url = URL.createObjectURL(blob);
            if (capturedEntryId) {
              useFileStore.getState().updateEntryById(capturedEntryId, {
                processedUrl: url,
                processedFilename: "favicons.zip",
                status: "completed",
              });
            }
            setDownloadUrl(url);
            setProgress((prev) => ({ ...prev, phase: "complete", percent: 100 }));
          } catch (err) {
            if (url && !useFileStore.getState().entries.some((e) => e.processedUrl === url)) {
              URL.revokeObjectURL(url);
            }
            const teardownError = runEndWrites([
              () => setError(t.errors.jobTrackingFailed),
              cleanup,
            ]);
            if (teardownError) {
              reportRunEndFailure(
                "Ending a sync tool run after a result handling error failed",
                teardownError.cause,
                "favicon",
              );
            }
            throw err;
          }
          cleanup();
          return;
        }

        void (async () => {
          try {
            let body: unknown = null;
            try {
              const text = xhr.response instanceof Blob ? await xhr.response.text() : "";
              body = JSON.parse(text);
            } catch {
              body = null;
            }
            endSubscription();
            if (xhrRef.current !== xhr || storeReset) return;
            setError(
              failedAnswerMessage(
                t,
                body,
                xhr.status,
                format(t.toolSettings.favicon.generationFailed, { status: xhr.status }),
              ),
            );
          } finally {
            if (xhrRef.current === xhr && !storeReset) {
              cleanup();
            }
          }
        })();
      };

      xhr.onerror = () => {
        endSubscription();
        if (xhrRef.current !== xhr || storeReset) return;
        setError(t.toolSettings.favicon.networkError);
        cleanup();
      };

      xhr.ontimeout = () => {
        endSubscription();
        if (xhrRef.current !== xhr || storeReset) return;
        setError(t.toolSettings.favicon.timeout);
        cleanup();
      };

      xhr.open("POST", appUrl("/api/v1/tools/image/favicon"));
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    } catch (err) {
      endSubscription();
      if (!storeReset) {
        setError(err instanceof Error ? err.message : t.toolSettings.favicon.networkError);
      }
      cleanup();
    }
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
    t,
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
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {t.toolSettings.favicon.preview}
          </p>
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
        <span className="text-xs text-muted-foreground">{t.toolSettings.favicon.background}</span>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex flex-1 gap-1">
            <button
              type="button"
              onClick={() => setBgMode("transparent")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "transparent" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t.toolSettings.favicon.transparent}
            </button>
            <button
              type="button"
              onClick={() => setBgMode("color")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "color" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t.toolSettings.favicon.color}
            </button>
          </div>
          {bgMode === "color" && (
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              aria-label={t.a11y.backgroundColor}
              className="h-7 w-9 shrink-0 rounded border border-border bg-background"
            />
          )}
        </div>
      </div>

      {/* Padding */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{t.toolSettings.favicon.padding}</span>
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
          <span className="text-xs text-muted-foreground">
            {t.toolSettings.favicon.cornerRadius}
          </span>
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
          <span>{t.toolSettings.favicon.square}</span>
          <span>{t.toolSettings.favicon.circle}</span>
        </div>
      </div>

      {/* Theme color */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{t.toolSettings.favicon.themeColor}</span>
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            aria-label={t.toolSettings.favicon.themeColor2}
            className="h-7 w-9 shrink-0 rounded border border-border bg-background"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {t.toolSettings.favicon.usedInManifestJsonFor}
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
              ? t.toolSettings.favicon.uploadingImages
              : format(
                  plural(
                    files.length,
                    t.toolSettings.favicon.processingImagesOne,
                    t.toolSettings.favicon.processingImagesOther,
                  ),
                  { count: files.length },
                )
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
        <ResultDownloadLink
          href={downloadUrl}
          testId="favicon-download"
          downloadName="favicons.zip"
          label={t.toolSettings.favicon.downloadZip}
        />
      )}
    </div>
  );
}
