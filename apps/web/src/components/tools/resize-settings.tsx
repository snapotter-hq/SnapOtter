import { useState } from "react";
import { SOCIAL_MEDIA_PRESETS } from "@stirling-image/shared";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Link, Unlink, Loader2 } from "lucide-react";

type FitMode = "contain" | "cover" | "fill" | "inside" | "outside";

export function ResizeSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize } =
    useToolProcessor("resize");

  const [mode, setMode] = useState<"pixels" | "percentage">("pixels");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [percentage, setPercentage] = useState<string>("100");
  const [fit, setFit] = useState<FitMode>("contain");
  const [lockAspect, setLockAspect] = useState(true);
  const [withoutEnlargement, setWithoutEnlargement] = useState(false);

  const handlePreset = (w: number, h: number) => {
    setMode("pixels");
    setWidth(String(w));
    setHeight(String(h));
  };

  const handleProcess = () => {
    const settings: Record<string, unknown> = { fit, withoutEnlargement };
    if (mode === "percentage") {
      settings.percentage = Number(percentage);
    } else {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
    }
    processFiles(files, settings);
  };

  const hasFile = files.length > 0;

  // Group presets by platform
  const platforms = [...new Set(SOCIAL_MEDIA_PRESETS.map((p) => p.platform))];

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">Resize Mode</label>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => setMode("pixels")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "pixels" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Pixels
          </button>
          <button
            onClick={() => setMode("percentage")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Percentage
          </button>
        </div>
      </div>

      {mode === "pixels" ? (
        <>
          {/* Width / Height */}
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Width (px)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="Auto"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
              <button
                onClick={() => setLockAspect(!lockAspect)}
                className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {lockAspect ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
              </button>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Height (px)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Auto"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Fit mode */}
          <div>
            <label className="text-xs text-muted-foreground">Fit Mode</label>
            <select
              value={fit}
              onChange={(e) => setFit(e.target.value as FitMode)}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill (stretch)</option>
              <option value="inside">Inside</option>
              <option value="outside">Outside</option>
            </select>
          </div>

          {/* Social media presets */}
          <div>
            <label className="text-xs text-muted-foreground">Social Media Presets</label>
            <select
              onChange={(e) => {
                const preset = SOCIAL_MEDIA_PRESETS.find(
                  (p) => `${p.platform} - ${p.name}` === e.target.value,
                );
                if (preset) handlePreset(preset.width, preset.height);
              }}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a preset...
              </option>
              {platforms.map((platform) => (
                <optgroup key={platform} label={platform}>
                  {SOCIAL_MEDIA_PRESETS.filter((p) => p.platform === platform).map((p) => (
                    <option key={`${p.platform}-${p.name}`} value={`${p.platform} - ${p.name}`}>
                      {p.name} ({p.width}x{p.height})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div>
          <label className="text-xs text-muted-foreground">Scale (%)</label>
          <input
            type="number"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            min={1}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

      {/* Don't enlarge */}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={withoutEnlargement}
          onChange={(e) => setWithoutEnlargement(e.target.checked)}
          className="rounded"
        />
        Don&apos;t enlarge
      </label>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button */}
      <button
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Processing..." : "Resize"}
      </button>

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
