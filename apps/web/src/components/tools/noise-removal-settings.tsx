import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Tier = "quick" | "balanced" | "quality" | "maximum";

const TIERS: { id: Tier; label: string; desc: string }[] = [
  { id: "quick", label: "Quick", desc: "Fast, lightweight" },
  { id: "balanced", label: "Balanced", desc: "Good quality, moderate speed" },
  { id: "quality", label: "Quality", desc: "AI-powered, slow" },
  { id: "maximum", label: "Maximum", desc: "Best AI model, slowest" },
];

const LOSSY_FORMATS = new Set(["jpeg", "webp"]);

export interface NoiseRemovalControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function NoiseRemovalControls({
  settings: initialSettings,
  onChange,
}: NoiseRemovalControlsProps) {
  const [tier, setTier] = useState<Tier>("balanced");
  const [strength, setStrength] = useState(50);
  const [detailPreservation, setDetailPreservation] = useState(50);
  const [colorNoise, setColorNoise] = useState(30);
  const [outputFormat, setOutputFormat] = useState<"original" | "png" | "jpeg" | "webp">(
    "original",
  );
  const [quality, setQuality] = useState(90);

  // One-time init from pipeline settings
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.tier != null) setTier(initialSettings.tier as Tier);
    if (initialSettings.strength != null) setStrength(Number(initialSettings.strength));
    if (initialSettings.detailPreservation != null)
      setDetailPreservation(Number(initialSettings.detailPreservation));
    if (initialSettings.colorNoise != null) setColorNoise(Number(initialSettings.colorNoise));
    if (initialSettings.format != null)
      setOutputFormat(initialSettings.format as "original" | "png" | "jpeg" | "webp");
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
  }, [initialSettings]);

  // Emit settings on change
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({
      tier,
      strength,
      detailPreservation,
      colorNoise,
      format: outputFormat,
      quality,
    });
  }, [tier, strength, detailPreservation, colorNoise, outputFormat, quality]);

  const tabClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`;

  const activeTier = TIERS.find((t) => t.id === tier);

  return (
    <div className="space-y-4">
      {/* Tier selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Denoising Tier</p>
        <div className="grid grid-cols-4 gap-1">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={`flex flex-col items-center gap-0.5 text-xs py-2 rounded transition-colors ${
                tier === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeTier && <p className="text-[10px] text-muted-foreground mt-1">{activeTier.desc}</p>}
      </div>

      <div className="border-t border-border pt-3" />

      {/* Strength slider */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Strength</p>
          <span className="text-sm font-mono tabular-nums font-medium">{strength}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Subtle</span>
          <span>Aggressive</span>
        </div>
      </div>

      {/* Detail Preservation slider */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Detail Preservation</p>
          <span className="text-sm font-mono tabular-nums font-medium">{detailPreservation}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={detailPreservation}
          onChange={(e) => setDetailPreservation(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Smooth</span>
          <span>Sharp</span>
        </div>
      </div>

      {/* Color Noise slider */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Color Noise</p>
          <span className="text-sm font-mono tabular-nums font-medium">{colorNoise}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={colorNoise}
          onChange={(e) => setColorNoise(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Off</span>
          <span>Heavy</span>
        </div>
      </div>

      <div className="border-t border-border pt-3" />

      {/* Output format */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Output Format</p>
        <div className="grid grid-cols-4 gap-1">
          {(["original", "png", "jpeg", "webp"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setOutputFormat(f)}
              className={tabClass(outputFormat === f)}
            >
              {f === "original" ? "Original" : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider (lossy formats only) */}
      {LOSSY_FORMATS.has(outputFormat) && (
        <div>
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-muted-foreground">Quality</p>
            <span className="text-sm font-mono tabular-nums font-medium">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
          />
        </div>
      )}
    </div>
  );
}

export function NoiseRemovalSettings() {
  const { files, entries } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("noise-removal");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  // Warn about GIF + AI tiers
  const isGif = entries.some((e) => e.file.type === "image/gif");
  const isAiTier = settings.tier === "quality" || settings.tier === "maximum";

  return (
    <div className="space-y-4">
      <NoiseRemovalControls onChange={setSettings} />

      {/* GIF + AI tier warning */}
      {isGif && isAiTier && (
        <p className="text-xs text-amber-500">
          AI denoising on GIF files processes only the first frame. For animated GIFs, use the Quick
          or Balanced tier.
        </p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Denoised: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={hasMultiple ? `Removing noise from ${files.length} images` : "Removing noise"}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="noise-removal-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {hasMultiple ? `Remove Noise (${files.length} files)` : "Remove Noise"}
        </button>
      )}

      {/* Download (single file - batch uses Download All ZIP in tool-page) */}
      {!hasMultiple && downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="noise-removal-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
