import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const PRESETS: { label: string; shadow: string; highlight: string }[] = [
  { label: "Classic", shadow: "#1e3a8a", highlight: "#fbbf24" },
  { label: "Noir", shadow: "#000000", highlight: "#ffffff" },
  { label: "Sepia", shadow: "#2d1b00", highlight: "#ffe8c2" },
  { label: "Midnight", shadow: "#0f2027", highlight: "#78ffd6" },
  { label: "Sunset", shadow: "#3a1c71", highlight: "#ffaf7b" },
  { label: "Cyber", shadow: "#0f0c29", highlight: "#f857a6" },
  { label: "Ocean", shadow: "#000428", highlight: "#43cea2" },
  { label: "Forest", shadow: "#022c12", highlight: "#9be15d" },
];

interface DuotoneSettingsProps {
  onImageStyle?: (style: React.CSSProperties | null) => void;
  onImageOverlay?: (node: React.ReactNode) => void;
}

export function DuotoneSettings({ onImageStyle, onImageOverlay }: DuotoneSettingsProps) {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const blobUrl = entry?.blobUrl;
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("duotone");

  const [shadow, setShadow] = useState("#1e3a8a");
  const [highlight, setHighlight] = useState("#fbbf24");
  const [intensity, setIntensity] = useState(100);

  // Stable refs for preview callbacks to avoid stale closures
  const onImageStyleRef = useRef(onImageStyle);
  useEffect(() => {
    onImageStyleRef.current = onImageStyle;
  });
  const onImageOverlayRef = useRef(onImageOverlay);
  useEffect(() => {
    onImageOverlayRef.current = onImageOverlay;
  });

  // Live preview: a self-contained duotone overlay (its own grayscale copy of
  // the image plus lighten/darken color layers, isolated so the parent pane
  // filter can't re-gray it). Intensity fades toward the real color image
  // beneath, matching the backend blend. onImageStyle activates the wrapper
  // branch in image-viewer so the overlay children actually mount.
  useEffect(() => {
    if (!blobUrl) return;
    onImageStyleRef.current?.({});
    onImageOverlayRef.current?.(
      <div className="absolute inset-0" style={{ opacity: intensity / 100, isolation: "isolate" }}>
        <img
          src={blobUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
          style={{ objectFit: "contain", filter: "grayscale(1)" }}
        />
        <div className="absolute inset-0" style={{ background: shadow, mixBlendMode: "lighten" }} />
        <div
          className="absolute inset-0"
          style={{ background: highlight, mixBlendMode: "darken" }}
        />
      </div>,
    );
    return () => {
      onImageStyleRef.current?.(null);
      onImageOverlayRef.current?.(null);
    };
  }, [shadow, highlight, intensity, blobUrl]);

  const handleProcess = () => {
    const settings = { shadow, highlight, intensity };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Presets */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Presets</p>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setShadow(p.shadow);
                setHighlight(p.highlight);
              }}
              className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded transition-colors ${
                shadow === p.shadow && highlight === p.highlight
                  ? "bg-primary/10 ring-1 ring-primary"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="w-full h-5 rounded-sm border border-border/50 flex overflow-hidden">
                <div className="flex-1" style={{ background: p.shadow }} />
                <div className="flex-1" style={{ background: p.highlight }} />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight truncate w-full text-center">
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Shadow Color */}
      <div>
        <label htmlFor="duotone-shadow" className="text-xs text-muted-foreground">
          {t.toolSettings.duotone.shadow}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="duotone-shadow"
            type="color"
            value={shadow}
            onChange={(e) => setShadow(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={shadow}
            onChange={(e) => setShadow(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {/* Highlight Color */}
      <div>
        <label htmlFor="duotone-highlight" className="text-xs text-muted-foreground">
          {t.toolSettings.duotone.highlight}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="duotone-highlight"
            type="color"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {/* Intensity Slider */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="duotone-intensity" className="text-xs text-muted-foreground">
            Intensity
          </label>
          <span className="text-xs font-mono text-foreground tabular-nums">{intensity}%</span>
        </div>
        <input
          id="duotone-intensity"
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full mt-0.5"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.duotone.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="duotone-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.duotone.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.duotone.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="duotone-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
