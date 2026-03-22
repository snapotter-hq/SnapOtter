import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { ProgressCard } from "@/components/common/progress-card";
import { Download } from "lucide-react";

type BgModel =
  | "birefnet-general"
  | "birefnet-general-lite"
  | "birefnet-portrait"
  | "bria-rmbg"
  | "isnet-general-use"
  | "u2net";

const MODELS: { value: BgModel; label: string; description: string }[] = [
  { value: "u2net", label: "U2-Net", description: "Fast, good quality (recommended)" },
  { value: "isnet-general-use", label: "IS-Net", description: "Good general purpose" },
  { value: "bria-rmbg", label: "BRIA RMBG", description: "Great for products" },
  { value: "birefnet-general-lite", label: "BiRefNet Lite", description: "Higher quality, slower (~15s)" },
  { value: "birefnet-portrait", label: "BiRefNet Portrait", description: "Best for people, slower (~15s)" },
  { value: "birefnet-general", label: "BiRefNet Full", description: "Best quality, very slow (~60s+)" },
];

const BG_PRESETS = [
  { color: "", label: "Transparent", preview: "checkerboard" },
  { color: "#FFFFFF", label: "White", preview: "#FFFFFF" },
  { color: "#000000", label: "Black", preview: "#000000" },
  { color: "#FF0000", label: "Red", preview: "#FF0000" },
  { color: "#00FF00", label: "Green", preview: "#00FF00" },
  { color: "#0000FF", label: "Blue", preview: "#0000FF" },
];

export function RemoveBgSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("remove-background");

  const [model, setModel] = useState<BgModel>("u2net");
  const [bgColor, setBgColor] = useState("");

  const handleProcess = () => {
    const settings: Record<string, unknown> = { model };
    if (bgColor) settings.backgroundColor = bgColor;
    processFiles(files, settings);
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Model selector */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">AI Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as BgModel)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} — {m.description}
            </option>
          ))}
        </select>
      </div>

      {/* Background color - intuitive preset buttons */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Output Background
        </label>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {BG_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setBgColor(preset.color)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                bgColor === preset.color
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span
                className="w-4 h-4 rounded-sm border border-border shrink-0"
                style={
                  preset.preview === "checkerboard"
                    ? {
                        backgroundImage:
                          "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                        backgroundSize: "8px 8px",
                        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                      }
                    : { backgroundColor: preset.preview }
                }
              />
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom color picker */}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="color"
            value={bgColor || "#ffffff"}
            onChange={(e) => setBgColor(e.target.value)}
            className="w-8 h-8 rounded border border-border cursor-pointer"
          />
          <input
            type="text"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            placeholder="Custom hex (#FF5500)"
            className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-xs text-foreground"
          />
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && !processing && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Removing background"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Remove Background
        </button>
      )}

      {/* Download */}
      {downloadUrl && !processing && (
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
