import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type ColorMode = "bw" | "color";
type PathMode = "none" | "polygon" | "spline";
type Detail = "low" | "medium" | "high";
type Preset = "logo" | "illustration" | "photo" | "sketch" | "custom";

interface VectorizeState {
  colorMode: ColorMode;
  threshold: number;
  colorPrecision: number;
  layerDifference: number;
  filterSpeckle: number;
  pathMode: PathMode;
  cornerThreshold: number;
  invert: boolean;
}

const PRESET_SETTINGS: Record<Exclude<Preset, "custom">, VectorizeState> = {
  logo: {
    colorMode: "bw",
    threshold: 128,
    colorPrecision: 6,
    layerDifference: 6,
    filterSpeckle: 2,
    pathMode: "spline",
    cornerThreshold: 60,
    invert: false,
  },
  illustration: {
    colorMode: "color",
    threshold: 128,
    colorPrecision: 4,
    layerDifference: 16,
    filterSpeckle: 8,
    pathMode: "spline",
    cornerThreshold: 60,
    invert: false,
  },
  photo: {
    colorMode: "color",
    threshold: 128,
    colorPrecision: 8,
    layerDifference: 5,
    filterSpeckle: 4,
    pathMode: "spline",
    cornerThreshold: 60,
    invert: false,
  },
  sketch: {
    colorMode: "bw",
    threshold: 100,
    colorPrecision: 6,
    layerDifference: 6,
    filterSpeckle: 1,
    pathMode: "polygon",
    cornerThreshold: 60,
    invert: false,
  },
};

const DETAIL_TO_SPECKLE: Record<Detail, number> = { low: 16, medium: 4, high: 1 };

function speckleToDetail(speckle: number): Detail {
  if (speckle >= 10) return "low";
  if (speckle >= 3) return "medium";
  return "high";
}

export function VectorizeSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("vectorize");

  const [preset, setPreset] = useState<Preset>("logo");
  const [colorMode, setColorMode] = useState<ColorMode>("bw");
  const [threshold, setThreshold] = useState(128);
  const [colorPrecision, setColorPrecision] = useState(6);
  const [layerDifference, setLayerDifference] = useState(6);
  const [filterSpeckle, setFilterSpeckle] = useState(2);
  const [pathMode, setPathMode] = useState<PathMode>("spline");
  const [cornerThreshold, setCornerThreshold] = useState(60);
  const [invert, setInvert] = useState(false);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const s = PRESET_SETTINGS[p];
    setColorMode(s.colorMode);
    setThreshold(s.threshold);
    setColorPrecision(s.colorPrecision);
    setLayerDifference(s.layerDifference);
    setFilterSpeckle(s.filterSpeckle);
    setPathMode(s.pathMode);
    setCornerThreshold(s.cornerThreshold);
    setInvert(s.invert);
  };

  const updateSetting = <T,>(setter: (v: T) => void) => {
    return (v: T) => {
      setPreset("custom");
      setter(v);
    };
  };

  const handleProcess = () => {
    const settings = {
      colorMode,
      threshold,
      colorPrecision,
      layerDifference,
      filterSpeckle,
      pathMode,
      cornerThreshold,
      invert,
    };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const detail = speckleToDetail(filterSpeckle);

  return (
    <div className="space-y-4">
      {/* Preset */}
      <div>
        <p className="text-xs text-muted-foreground">Preset</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["logo", "illustration", "photo"] as const).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => applyPreset(p)}
              className={`capitalize text-xs py-1.5 rounded ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {(["sketch", "custom"] as const).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => applyPreset(p)}
              className={`capitalize text-xs py-1.5 rounded ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Color Mode */}
      <div>
        <p className="text-xs text-muted-foreground">Color Mode</p>
        <div className="flex gap-1 mt-1">
          {(["bw", "color"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => updateSetting(setColorMode)(m)}
              className={`flex-1 text-xs py-1.5 rounded ${colorMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {m === "bw" ? "Black & White" : "Color"}
            </button>
          ))}
        </div>
      </div>

      {/* Color-specific settings */}
      {colorMode === "color" && (
        <>
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="vectorize-color-precision" className="text-xs text-muted-foreground">
                Color Precision
              </label>
              <span className="text-xs font-mono text-foreground">{colorPrecision}</span>
            </div>
            <input
              id="vectorize-color-precision"
              type="range"
              min={1}
              max={8}
              value={colorPrecision}
              onChange={(e) => updateSetting(setColorPrecision)(Number(e.target.value))}
              className="w-full mt-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>Fewer colors</span>
              <span>More colors</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="vectorize-layer-diff" className="text-xs text-muted-foreground">
                Gradient Step
              </label>
              <span className="text-xs font-mono text-foreground">{layerDifference}</span>
            </div>
            <input
              id="vectorize-layer-diff"
              type="range"
              min={1}
              max={64}
              value={layerDifference}
              onChange={(e) => updateSetting(setLayerDifference)(Number(e.target.value))}
              className="w-full mt-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>Smooth gradients</span>
              <span>Flat colors</span>
            </div>
          </div>
        </>
      )}

      {/* B&W-specific settings */}
      {colorMode === "bw" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="vectorize-threshold" className="text-xs text-muted-foreground">
              Threshold
            </label>
            <span className="text-xs font-mono text-foreground">{threshold}</span>
          </div>
          <input
            id="vectorize-threshold"
            type="range"
            min={0}
            max={255}
            value={threshold}
            onChange={(e) => updateSetting(setThreshold)(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>More white</span>
            <span>More black</span>
          </div>
        </div>
      )}

      <div className="border-t border-border" />

      {/* Detail */}
      <div>
        <p className="text-xs text-muted-foreground">Detail</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["low", "medium", "high"] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => updateSetting(setFilterSpeckle)(DETAIL_TO_SPECKLE[d])}
              className={`capitalize text-xs py-1.5 rounded ${detail === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Smoothing */}
      <div>
        <p className="text-xs text-muted-foreground">Smoothing</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["none", "polygon", "spline"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => updateSetting(setPathMode)(m)}
              className={`capitalize text-xs py-1.5 rounded ${pathMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Corner Threshold (color mode) */}
      {colorMode === "color" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="vectorize-corner" className="text-xs text-muted-foreground">
              Corner Threshold
            </label>
            <span className="text-xs font-mono text-foreground">{cornerThreshold}deg</span>
          </div>
          <input
            id="vectorize-corner"
            type="range"
            min={0}
            max={180}
            value={cornerThreshold}
            onChange={(e) => updateSetting(setCornerThreshold)(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>More corners</span>
            <span>Smoother</span>
          </div>
        </div>
      )}

      {/* Invert toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Invert Colors</span>
        <button
          type="button"
          role="switch"
          aria-checked={invert}
          aria-label={t.toolSettings.vectorize.invertColors}
          onClick={() => updateSetting(setInvert)(!invert)}
          className={`w-9 h-5 rounded-full transition-colors ${invert ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${invert ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      <div className="border-t border-border" />

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>SVG: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Submit */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.vectorize.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="vectorize-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.vectorize.submitBatch, { count: files.length })
            : t.toolSettings.vectorize.submit}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="vectorize-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download SVG
        </a>
      )}
    </div>
  );
}
