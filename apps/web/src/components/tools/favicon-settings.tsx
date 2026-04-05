import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
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
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [downloadReady, setDownloadReady] = useState(false);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setDownloadReady(false);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);

      const res = await fetch("/api/v1/tools/favicon", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "favicons.zip";
      a.click();
      URL.revokeObjectURL(url);
      setDownloadReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload a square image (recommended 512x512 or larger) to generate all favicon and app icon
        sizes.
      </p>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Generated Sizes</p>
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

      <button
        type="button"
        data-testid="favicon-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Generating..." : "Generate Favicons"}
      </button>

      {downloadReady && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Download className="h-3 w-3" /> ZIP downloaded successfully
        </p>
      )}
    </div>
  );
}
