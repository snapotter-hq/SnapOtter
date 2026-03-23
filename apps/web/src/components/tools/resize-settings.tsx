import { useState } from "react";
import { SOCIAL_MEDIA_PRESETS } from "@stirling-image/shared";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Link, Unlink } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

type ResizeTab = "presets" | "custom" | "scale";
type FitMode = "cover" | "contain" | "fill";

const FIT_LABELS: Record<FitMode, string> = {
  cover: "Crop to fit",
  contain: "Fit inside",
  fill: "Stretch",
};

// Group presets by platform
const platforms = [...new Set(SOCIAL_MEDIA_PRESETS.map((p) => p.platform))];

export function ResizeSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("resize");

  const [tab, setTab] = useState<ResizeTab>("presets");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [percentage, setPercentage] = useState<string>("50");
  const [fit, setFit] = useState<FitMode>("cover");
  const [lockAspect, setLockAspect] = useState(true);
  const [withoutEnlargement, setWithoutEnlargement] = useState(false);

  const handlePreset = (preset: (typeof SOCIAL_MEDIA_PRESETS)[number]) => {
    const key = `${preset.platform}-${preset.name}`;
    if (selectedPreset === key) {
      setSelectedPreset(null);
      setWidth("");
      setHeight("");
    } else {
      setSelectedPreset(key);
      setWidth(String(preset.width));
      setHeight(String(preset.height));
    }
  };

  const handleProcess = () => {
    const settings: Record<string, unknown> = {};

    if (tab === "scale") {
      settings.percentage = Number(percentage);
    } else {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
      settings.fit = tab === "presets" ? "cover" : fit;
      settings.withoutEnlargement = withoutEnlargement;
    }

    processFiles(files, settings);
  };

  const hasFile = files.length > 0;
  const canProcess =
    hasFile &&
    !processing &&
    (tab === "scale"
      ? Number(percentage) > 0
      : Boolean(width) || Boolean(height));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  const tabClass = (t: ResizeTab) =>
    `flex-1 text-xs py-1.5 rounded ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tab selector */}
      <div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTab("presets")} className={tabClass("presets")}>
            Presets
          </button>
          <button type="button" onClick={() => setTab("custom")} className={tabClass("custom")}>
            Custom Size
          </button>
          <button type="button" onClick={() => setTab("scale")} className={tabClass("scale")}>
            Scale
          </button>
        </div>
      </div>

      {/* Presets tab */}
      {tab === "presets" && (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {platforms.map((platform) => (
            <div key={platform}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{platform}</p>
              <div className="space-y-1">
                {SOCIAL_MEDIA_PRESETS.filter((p) => p.platform === platform).map((preset) => {
                  const key = `${preset.platform}-${preset.name}`;
                  const isSelected = selectedPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePreset(preset)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded border text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>{preset.name}</span>
                      <span className="text-xs tabular-nums">
                        {preset.width} × {preset.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

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
        </div>
      )}

      {/* Custom Size tab */}
      {tab === "custom" && (
        <div className="space-y-3">
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
              type="button"
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

          {/* Fit mode */}
          <div>
            <label className="text-xs text-muted-foreground">Fit Mode</label>
            <div className="flex gap-1 mt-1">
              {(Object.keys(FIT_LABELS) as FitMode[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFit(f)}
                  className={`flex-1 text-xs py-1.5 rounded ${fit === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {FIT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

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
        </div>
      )}

      {/* Scale tab */}
      {tab === "scale" && (
        <div className="space-y-3">
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
          <div className="flex gap-1">
            {[25, 50, 75].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setPercentage(String(pct))}
                className={`flex-1 text-xs py-1.5 rounded ${
                  percentage === String(pct)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Resizing"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Resize
        </button>
      )}

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
    </form>
  );
}
