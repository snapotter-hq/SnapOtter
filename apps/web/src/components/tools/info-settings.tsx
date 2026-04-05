import { Loader2 } from "lucide-react";
import { useState } from "react";
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
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [info, setInfo] = useState<ImageInfoData | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);

      const res = await fetch("/api/v1/tools/info", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const data: ImageInfoData = await res.json();
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read info");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;
  const channelColors: Record<string, string> = {
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    alpha: "bg-gray-500",
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        data-testid="info-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Reading..." : "Read Info"}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {info && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="text-muted-foreground">Dimensions</div>
            <div className="text-foreground font-mono">
              {info.width} x {info.height}
            </div>
            <div className="text-muted-foreground">Format</div>
            <div className="text-foreground font-mono">{info.format}</div>
            <div className="text-muted-foreground">File Size</div>
            <div className="text-foreground font-mono">{(info.fileSize / 1024).toFixed(1)} KB</div>
            <div className="text-muted-foreground">Channels</div>
            <div className="text-foreground font-mono">{info.channels}</div>
            <div className="text-muted-foreground">Color Space</div>
            <div className="text-foreground font-mono">{info.colorSpace}</div>
            <div className="text-muted-foreground">Alpha</div>
            <div className="text-foreground font-mono">{info.hasAlpha ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">DPI</div>
            <div className="text-foreground font-mono">{info.density ?? "N/A"}</div>
            <div className="text-muted-foreground">Progressive</div>
            <div className="text-foreground font-mono">{info.isProgressive ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">ICC Profile</div>
            <div className="text-foreground font-mono">{info.hasIcc ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">EXIF Data</div>
            <div className="text-foreground font-mono">{info.hasExif ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">XMP Data</div>
            <div className="text-foreground font-mono">{info.hasXmp ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">Pages</div>
            <div className="text-foreground font-mono">{info.pages}</div>
          </div>

          {/* Histogram */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Channel Stats</p>
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
