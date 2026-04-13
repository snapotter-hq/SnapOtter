import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Model = "auto" | "ddcolor" | "opencv";

const MODEL_OPTIONS: { value: Model; label: string; desc: string }[] = [
  { value: "opencv", label: "Fast", desc: "Quick results" },
  { value: "auto", label: "Balanced", desc: "Best available" },
  { value: "ddcolor", label: "Best", desc: "Highest quality" },
];

export function ColorizeSettings() {
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
  } = useToolProcessor("colorize");

  const [model, setModel] = useState<Model>("auto");
  const [intensity, setIntensity] = useState(100);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = {
      model,
      intensity: intensity / 100,
    };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Model selector */}
      <SectionLabel>AI Model</SectionLabel>
      <div className="grid grid-cols-3 gap-1">
        {MODEL_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setModel(opt.value)}
            className={`text-xs py-2 rounded transition-colors ${
              model === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            <span className="block font-medium">{opt.label}</span>
            <span className="block text-[10px] opacity-70">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Color intensity */}
      <SectionLabel>Color Intensity</SectionLabel>
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {intensity === 0
              ? "Grayscale"
              : intensity < 50
                ? "Subtle"
                : intensity < 80
                  ? "Natural"
                  : "Vivid"}
          </span>
          <span className="text-xs font-mono text-foreground tabular-nums w-10 text-right">
            {intensity}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full mt-0.5"
        />
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          Lower values produce more muted, vintage-style colors.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Colorized: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={hasMultiple ? `Colorizing ${files.length} images` : "Colorizing"}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="colorize-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {hasMultiple ? `Colorize (${files.length} files)` : "Colorize"}
        </button>
      )}

      {!hasMultiple && downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="colorize-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}
