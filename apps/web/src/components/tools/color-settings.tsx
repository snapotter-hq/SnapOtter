import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Effect = "none" | "grayscale" | "sepia" | "invert";

interface ColorControlsProps {
  toolId: string;
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
  onPreviewFilter?: (filter: string) => void;
}

export function ColorControls({
  toolId: _toolId,
  settings: initialSettings,
  onChange,
  onPreviewFilter,
}: ColorControlsProps) {
  // Light
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [exposure, setExposure] = useState(0);

  // Color
  const [saturation, setSaturation] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [hue, setHue] = useState(0);

  // Detail
  const [sharpness, setSharpness] = useState(0);

  // Channels
  const [red, setRed] = useState(100);
  const [green, setGreen] = useState(100);
  const [blue, setBlue] = useState(100);
  const [channelsOpen, setChannelsOpen] = useState(false);

  // Effects
  const [effect, setEffect] = useState<Effect>("none");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.brightness != null) setBrightness(Number(initialSettings.brightness));
    if (initialSettings.contrast != null) setContrast(Number(initialSettings.contrast));
    if (initialSettings.exposure != null) setExposure(Number(initialSettings.exposure));
    if (initialSettings.saturation != null) setSaturation(Number(initialSettings.saturation));
    if (initialSettings.temperature != null) setTemperature(Number(initialSettings.temperature));
    if (initialSettings.tint != null) setTint(Number(initialSettings.tint));
    if (initialSettings.hue != null) setHue(Number(initialSettings.hue));
    if (initialSettings.sharpness != null) setSharpness(Number(initialSettings.sharpness));
    if (initialSettings.red != null) setRed(Number(initialSettings.red));
    if (initialSettings.green != null) setGreen(Number(initialSettings.green));
    if (initialSettings.blue != null) setBlue(Number(initialSettings.blue));
    if (initialSettings.effect != null) setEffect(initialSettings.effect as Effect);
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current?.({
      brightness,
      contrast,
      exposure,
      saturation,
      temperature,
      tint,
      hue,
      sharpness,
      red,
      green,
      blue,
      effect,
    });
  }, [
    brightness,
    contrast,
    exposure,
    saturation,
    temperature,
    tint,
    hue,
    sharpness,
    red,
    green,
    blue,
    effect,
  ]);

  // CSS filter preview
  const hasChannelChanges = red !== 100 || green !== 100 || blue !== 100;
  const hasTempTint = temperature !== 0 || tint !== 0;

  useEffect(() => {
    if (!onPreviewFilter) return;
    const parts: string[] = [];
    if (brightness !== 0) parts.push(`brightness(${1 + brightness / 100})`);
    if (contrast !== 0) parts.push(`contrast(${1 + contrast / 100})`);
    if (exposure !== 0) parts.push(`brightness(${1 + exposure / 200})`);
    if (saturation !== 0) parts.push(`saturate(${1 + saturation / 100})`);
    if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
    if (hasTempTint) parts.push("url(#ashim-temp-tint-filter)");
    if (hasChannelChanges) parts.push("url(#ashim-channel-filter)");
    if (sharpness > 0) parts.push("url(#ashim-sharpen-filter)");
    if (effect === "grayscale") parts.push("grayscale(1)");
    if (effect === "sepia") parts.push("sepia(1)");
    if (effect === "invert") parts.push("invert(1)");
    onPreviewFilter(parts.join(" "));
  }, [
    brightness,
    contrast,
    exposure,
    saturation,
    hue,
    sharpness,
    hasChannelChanges,
    hasTempTint,
    effect,
    onPreviewFilter,
  ]);

  const hasChanges =
    brightness !== 0 ||
    contrast !== 0 ||
    exposure !== 0 ||
    saturation !== 0 ||
    temperature !== 0 ||
    tint !== 0 ||
    hue !== 0 ||
    sharpness !== 0 ||
    red !== 100 ||
    green !== 100 ||
    blue !== 100 ||
    effect !== "none";

  // Build SVG filter matrices
  const tempT = temperature / 100;
  const tintN = tint / 100;

  return (
    <>
      {/* Hidden SVG filters for live preview */}
      {hasTempTint && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <title>Temperature and tint color filter</title>
          <filter id="ashim-temp-tint-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values={`${1 + tempT * 0.15 + tintN * 0.1} 0 0 0 0  0 ${1 + tempT * 0.05 - tintN * 0.15} 0 0 0  0 0 ${1 - tempT * 0.15 + tintN * 0.1} 0 0  0 0 0 1 0`}
            />
          </filter>
        </svg>
      )}
      {hasChannelChanges && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <title>Color channel filter</title>
          <filter id="ashim-channel-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values={`${red / 100} 0 0 0 0  0 ${green / 100} 0 0 0  0 0 ${blue / 100} 0 0  0 0 0 1 0`}
            />
          </filter>
        </svg>
      )}
      {sharpness > 0 && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <title>Sharpen filter</title>
          <filter id="ashim-sharpen-filter" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix={`0 ${-sharpness / 100} 0 ${-sharpness / 100} ${1 + (4 * sharpness) / 100} ${-sharpness / 100} 0 ${-sharpness / 100} 0`}
            />
          </filter>
        </svg>
      )}

      {/* Light section */}
      <SectionLabel>Light</SectionLabel>
      <div className="space-y-2">
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
          label="Exposure"
          value={exposure}
          onChange={setExposure}
          min={-100}
          max={100}
        />
      </div>

      {/* Color section */}
      <SectionLabel>Color</SectionLabel>
      <div className="space-y-2">
        <SliderControl
          label="Saturation"
          value={saturation}
          onChange={setSaturation}
          min={-100}
          max={100}
        />
        <SliderControl
          label="Temperature"
          value={temperature}
          onChange={setTemperature}
          min={-100}
          max={100}
          hint="cool / warm"
        />
        <SliderControl
          label="Tint"
          value={tint}
          onChange={setTint}
          min={-100}
          max={100}
          hint="green / magenta"
        />
        <SliderControl label="Hue" value={hue} onChange={setHue} min={-180} max={180} />
      </div>

      {/* Detail section */}
      <SectionLabel>Detail</SectionLabel>
      <div className="space-y-2">
        <SliderControl
          label="Sharpness"
          value={sharpness}
          onChange={setSharpness}
          min={0}
          max={100}
        />
      </div>

      {/* Effects section */}
      <SectionLabel>Effects</SectionLabel>
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

      {/* Color Channels (expandable) */}
      <button
        type="button"
        onClick={() => setChannelsOpen(!channelsOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        {channelsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Color Channels
        {hasChannelChanges && <span className="ml-auto text-primary text-[10px]">modified</span>}
      </button>
      {channelsOpen && (
        <div className="space-y-2 pl-1">
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

      {/* Reset */}
      {hasChanges && (
        <button
          type="button"
          onClick={() => {
            setBrightness(0);
            setContrast(0);
            setExposure(0);
            setSaturation(0);
            setTemperature(0);
            setTint(0);
            setHue(0);
            setSharpness(0);
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
    </>
  );
}

// ── ColorSettings wrapper (handles processing + download) ─────────

interface ColorSettingsProps {
  toolId: string;
  onPreviewFilter?: (filter: string) => void;
}

export function ColorSettings({ toolId, onPreviewFilter }: ColorSettingsProps) {
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
  } = useToolProcessor(toolId);

  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasChanges = Object.entries(settings).some(([key, val]) => {
    if (key === "effect") return val !== "none";
    if (key === "red" || key === "green" || key === "blue") return val !== 100;
    return val !== 0;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasChanges && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ColorControls toolId={toolId} onChange={setSettings} onPreviewFilter={onPreviewFilter} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

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
          data-testid="adjust-colors-submit"
          disabled={!hasFile || !hasChanges || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply (${files.length} files)` : "Apply"}
        </button>
      )}

      {/* Download (single-file only - batch uses Download All ZIP in tool-page) */}
      {downloadUrl && files.length <= 1 && (
        <a
          href={downloadUrl}
          download
          data-testid="adjust-colors-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}

// ── Shared sub-components ─────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  color,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  color?: string;
  hint?: string;
}) {
  const id = `color-slider-${label.toLowerCase()}`;
  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor={id} className={`text-xs ${color || "text-muted-foreground"}`}>
          {label}
          {hint && <span className="text-[10px] text-muted-foreground/60 ml-1">({hint})</span>}
        </label>
        <span className="text-xs font-mono text-foreground tabular-nums w-8 text-right">
          {value}
        </span>
      </div>
      <input
        id={id}
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
