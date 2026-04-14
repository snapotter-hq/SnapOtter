import { Loader2 } from "lucide-react";
import { useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useBase64Store } from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";

const OUTPUT_FORMATS = [
  { value: "original", label: "Keep Original" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
] as const;

export function ImageToBase64Settings() {
  const { files } = useFileStore();
  const { processing, setProcessing, setProgress, addResult, addError, reset } = useBase64Store();

  const [outputFormat, setOutputFormat] = useState("original");
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    reset();
    setProcessing(true);

    const settings = JSON.stringify({ outputFormat, quality, maxWidth, maxHeight });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ completed: i, total: files.length, currentFile: file.name });

      try {
        const formData = new FormData();
        formData.append("files", file);
        formData.append("settings", settings);

        const res = await fetch("/api/v1/tools/image-to-base64", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          addError({ filename: file.name, error: body.error || `Failed: ${res.status}` });
          continue;
        }

        const data = await res.json();
        for (const r of data.results) addResult(r);
        for (const e of data.errors) addError(e);
      } catch (err) {
        addError({
          filename: file.name,
          error: err instanceof Error ? err.message : "Failed to convert",
        });
      }
    }

    setProgress(null);
    setProcessing(false);
  };

  const hasFiles = files.length > 0;
  const showQuality = outputFormat === "jpeg" || outputFormat === "webp";

  return (
    <div className="space-y-4">
      {/* Output Format */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Output Image Format</span>
        <p className="text-[10px] text-muted-foreground/70 mb-1.5">
          Convert before encoding to control MIME type and size
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
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider */}
      {showQuality && (
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="b64-quality" className="text-xs font-medium text-muted-foreground">
              Quality
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
          <p className="text-[10px] text-muted-foreground/70">
            Lower quality = smaller base64 string
          </p>
        </div>
      )}

      {/* Max Width */}
      <div>
        <label htmlFor="b64-max-width" className="text-xs font-medium text-muted-foreground">
          Max Width (px)
        </label>
        <input
          id="b64-max-width"
          type="number"
          min={0}
          value={maxWidth}
          onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value)))}
          placeholder="0 = no limit"
          className="mt-1 w-full rounded bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
      </div>

      {/* Max Height */}
      <div>
        <label htmlFor="b64-max-height" className="text-xs font-medium text-muted-foreground">
          Max Height (px)
        </label>
        <input
          id="b64-max-height"
          type="number"
          min={0}
          value={maxHeight}
          onChange={(e) => setMaxHeight(Math.max(0, Number(e.target.value)))}
          placeholder="0 = no limit"
          className="mt-1 w-full rounded bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          Resize before encoding. Aspect ratio is preserved. 0 = no limit.
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
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing
          ? "Converting..."
          : `Convert to Base64${files.length > 1 ? ` (${files.length})` : ""}`}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
