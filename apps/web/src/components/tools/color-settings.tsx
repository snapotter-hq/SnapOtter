import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

type Tab = "basic" | "channels" | "effects";
type Effect = "none" | "grayscale" | "sepia" | "invert";

interface ColorSettingsProps {
  /** The specific tool ID to use for processing */
  toolId: string;
}

export function ColorSettings({ toolId }: ColorSettingsProps) {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor(toolId);

  const [tab, setTab] = useState<Tab>(() => {
    if (toolId === "color-channels") return "channels";
    if (toolId === "color-effects") return "effects";
    return "basic";
  });

  // Basic adjustments
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Color channels
  const [red, setRed] = useState(100);
  const [green, setGreen] = useState(100);
  const [blue, setBlue] = useState(100);

  // Effects
  const [effect, setEffect] = useState<Effect>("none");

  const handleProcess = () => {
    const settings = {
      brightness,
      contrast,
      saturation,
      red,
      green,
      blue,
      effect,
    };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasChanges =
    brightness !== 0 ||
    contrast !== 0 ||
    saturation !== 0 ||
    red !== 100 ||
    green !== 100 ||
    blue !== 100 ||
    effect !== "none";

  const tabs: { id: Tab; label: string }[] = [
    { id: "basic", label: "Basic" },
    { id: "channels", label: "Channels" },
    { id: "effects", label: "Effects" },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasChanges && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-xs py-1.5 rounded ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Basic Adjustments */}
      {tab === "basic" && (
        <div className="space-y-3">
          <SliderControl
            label="Brightness"
            value={brightness}
            onChange={setBrightness}
            min={-100}
            max={100}
          />
          <SliderControl
            label="Contrast"
            value={contrast}
            onChange={setContrast}
            min={-100}
            max={100}
          />
          <SliderControl
            label="Saturation"
            value={saturation}
            onChange={setSaturation}
            min={-100}
            max={100}
          />
        </div>
      )}

      {/* Color Channels */}
      {tab === "channels" && (
        <div className="space-y-3">
          <SliderControl
            label="Red"
            value={red}
            onChange={setRed}
            min={0}
            max={200}
            color="text-red-500"
          />
          <SliderControl
            label="Green"
            value={green}
            onChange={setGreen}
            min={0}
            max={200}
            color="text-green-500"
          />
          <SliderControl
            label="Blue"
            value={blue}
            onChange={setBlue}
            min={0}
            max={200}
            color="text-blue-500"
          />
        </div>
      )}

      {/* Effects */}
      {tab === "effects" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Color Effect</label>
          <div className="grid grid-cols-2 gap-1">
            {(["none", "grayscale", "sepia", "invert"] as const).map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEffect(e)}
                className={`text-xs py-2 rounded capitalize transition-colors ${
                  effect === e
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-primary/10"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reset button */}
      {hasChanges && (
        <button
          type="button"
          onClick={() => {
            setBrightness(0);
            setContrast(0);
            setSaturation(0);
            setRed(100);
            setGreen(100);
            setBlue(100);
            setEffect("none");
          }}
          className="w-full text-xs py-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
        >
          Reset All
        </button>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Adjusting colors"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || !hasChanges || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply (${files.length} files)` : "Apply"}
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

/** Reusable slider control */
function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center">
        <label className={`text-xs ${color || "text-muted-foreground"}`}>{label}</label>
        <span className="text-xs font-mono text-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-0.5"
      />
    </div>
  );
}
