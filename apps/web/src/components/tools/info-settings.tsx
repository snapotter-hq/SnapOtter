import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

interface ImageInfoData {
  filename: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  channels: number;
  hasAlpha: boolean;
  colorSpace: string;
  density: number | null;
  isProgressive: boolean;
  orientation: number | null;
  hasProfile: boolean;
  hasExif: boolean;
  hasIcc: boolean;
  hasXmp: boolean;
  bitDepth: string | null;
  pages: number;
  histogram: Array<{
    channel: string;
    min: number;
    max: number;
    mean: number;
    stdev: number;
  }>;
}

export function InfoSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const selectedIndex = useFileStore((s) => s.selectedIndex);
  const [info, setInfo] = useState<ImageInfoData | null>(null);
  const cacheRef = useRef<Map<number, ImageInfoData>>(new Map());
  const autoFetchRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInfo = useCallback(
    async (index: number) => {
      const file = useFileStore.getState().entries[index]?.file;
      if (!file) return;

      const cached = cacheRef.current.get(index);
      if (cached) {
        setError(null);
        setInfo(cached);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setProcessing(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/v1/tools/image/info", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed: ${res.status}`);
        }

        const data: ImageInfoData = await res.json();
        cacheRef.current.set(index, data);
        setInfo(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t.toolSettings.info.failedToRead);
      } finally {
        if (!controller.signal.aborted) {
          setProcessing(false);
        }
      }
    },
    [setProcessing, setError, t],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: files.length is the reset trigger
  useEffect(() => {
    cacheRef.current.clear();
    autoFetchRef.current = false;
    setInfo(null);
  }, [files.length]);

  useEffect(() => {
    if (!autoFetchRef.current || files.length === 0) return;
    fetchInfo(selectedIndex);
  }, [selectedIndex, fetchInfo, files.length]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleProcess = () => {
    if (files.length === 0) return;
    autoFetchRef.current = true;
    setInfo(null);
    fetchInfo(selectedIndex);
  };

  const hasFile = files.length > 0;
  const channelColors: Record<string, string> = {
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    alpha: "bg-gray-500",
  };

  const ts = t.toolSettings.info;

  return (
    <div className="space-y-4">
      <button
        type="button"
        data-testid="info-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? ts.reading : ts.readInfo}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {info && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="text-muted-foreground">{ts.dimensions}</div>
            <div className="text-foreground font-mono">
              {info.width} x {info.height}
            </div>
            <div className="text-muted-foreground">{ts.format}</div>
            <div className="text-foreground font-mono">{info.format}</div>
            <div className="text-muted-foreground">{ts.fileSize}</div>
            <div className="text-foreground font-mono">{(info.fileSize / 1024).toFixed(1)} KB</div>
            <div className="text-muted-foreground">{ts.channels}</div>
            <div className="text-foreground font-mono">{info.channels}</div>
            <div className="text-muted-foreground">{ts.colorSpace}</div>
            <div className="text-foreground font-mono">{info.colorSpace}</div>
            <div className="text-muted-foreground">{ts.hasAlpha}</div>
            <div className="text-foreground font-mono">{info.hasAlpha ? ts.yes : ts.no}</div>
            <div className="text-muted-foreground">{ts.density}</div>
            <div className="text-foreground font-mono">{info.density ?? ts.na}</div>
            <div className="text-muted-foreground">{ts.progressive}</div>
            <div className="text-foreground font-mono">{info.isProgressive ? ts.yes : ts.no}</div>
            <div className="text-muted-foreground">{ts.hasIcc}</div>
            <div className="text-foreground font-mono">{info.hasIcc ? ts.yes : ts.no}</div>
            <div className="text-muted-foreground">{ts.hasExif}</div>
            <div className="text-foreground font-mono">{info.hasExif ? ts.yes : ts.no}</div>
            <div className="text-muted-foreground">{ts.hasXmp}</div>
            <div className="text-foreground font-mono">{info.hasXmp ? ts.yes : ts.no}</div>
            <div className="text-muted-foreground">{ts.pages}</div>
            <div className="text-foreground font-mono">{info.pages}</div>
          </div>

          {/* Histogram */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">{ts.channelStats}</p>
            <div className="mt-1 space-y-1.5">
              {info.histogram.map((ch) => (
                <div key={ch.channel} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${channelColors[ch.channel] ?? "bg-gray-400"}`}
                    />
                    <span className="text-xs text-foreground capitalize">{ch.channel}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-muted-foreground font-mono">
                    <span>min:{ch.min}</span>
                    <span>max:{ch.max}</span>
                    <span>mean:{ch.mean}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${channelColors[ch.channel] ?? "bg-gray-400"}`}
                      style={{ width: `${(ch.mean / 255) * 100}%`, opacity: 0.7 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
