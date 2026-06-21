import { Download } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

// ── Presets ──────────────────────────────────────────────────────────

interface BorderPreset {
  name: string;
  borderWidth: number;
  borderColor: string;
  padding: number;
  paddingColor: string;
  cornerRadius: number;
  shadow: boolean;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  shadowOpacity: number;
}

const PRESETS: BorderPreset[] = [
  {
    name: "Clean White",
    borderWidth: 40,
    borderColor: "#FFFFFF",
    padding: 0,
    paddingColor: "#FFFFFF",
    cornerRadius: 0,
    shadow: false,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 5,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
  {
    name: "Gallery Black",
    borderWidth: 30,
    borderColor: "#1A1A1A",
    padding: 12,
    paddingColor: "#FFFFFF",
    cornerRadius: 0,
    shadow: false,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 5,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
  {
    name: "Shadow",
    borderWidth: 0,
    borderColor: "#FFFFFF",
    padding: 20,
    paddingColor: "#FFFFFF",
    cornerRadius: 0,
    shadow: true,
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
  {
    name: "Rounded",
    borderWidth: 20,
    borderColor: "#FFFFFF",
    padding: 0,
    paddingColor: "#FFFFFF",
    cornerRadius: 30,
    shadow: true,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowColor: "#000000",
    shadowOpacity: 30,
  },
  {
    name: "Polaroid",
    borderWidth: 0,
    borderColor: "#FFFFFF",
    padding: 40,
    paddingColor: "#FFFFFF",
    cornerRadius: 4,
    shadow: true,
    shadowBlur: 12,
    shadowOffsetX: 2,
    shadowOffsetY: 6,
    shadowColor: "#000000",
    shadowOpacity: 35,
  },
  {
    name: "Vintage",
    borderWidth: 12,
    borderColor: "#8B7355",
    padding: 8,
    paddingColor: "#F5F0E8",
    cornerRadius: 0,
    shadow: false,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 5,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
  {
    name: "Minimal",
    borderWidth: 2,
    borderColor: "#D4D4D4",
    padding: 0,
    paddingColor: "#FFFFFF",
    cornerRadius: 0,
    shadow: false,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 5,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
  {
    name: "Cinematic",
    borderWidth: 2,
    borderColor: "#333333",
    padding: 30,
    paddingColor: "#0A0A0A",
    cornerRadius: 0,
    shadow: false,
    shadowBlur: 15,
    shadowOffsetX: 0,
    shadowOffsetY: 5,
    shadowColor: "#000000",
    shadowOpacity: 40,
  },
];

// ── Color Swatches ───────────────────────────────────────────────────

const COLOR_SWATCHES = ["#FFFFFF", "#000000", "#333333", "#F5F5F5", "#8B7355"];

function ColorSwatches({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (color: string) => void;
  id: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          onClick={() => onChange(swatch)}
          className={`h-6 w-6 rounded-full border-2 transition-all ${
            value.toUpperCase() === swatch
              ? "ring-2 ring-primary ring-offset-1 border-transparent"
              : "border-border hover:border-foreground/30"
          }`}
          style={{ backgroundColor: swatch }}
          title={swatch}
        />
      ))}
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 rounded-full border border-border cursor-pointer appearance-none bg-transparent"
        title="Custom color"
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function buildPreviewStyle(s: {
  borderWidth: number;
  borderColor: string;
  padding: number;
  paddingColor: string;
  cornerRadius: number;
  shadow: boolean;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  shadowOpacity: number;
}): React.CSSProperties {
  const sc = hexToRgb(s.shadowColor);
  return {
    border: s.borderWidth > 0 ? `${s.borderWidth}px solid ${s.borderColor}` : undefined,
    padding: s.padding > 0 ? `${s.padding}px` : undefined,
    backgroundColor: s.padding > 0 ? s.paddingColor : undefined,
    borderRadius: s.cornerRadius > 0 ? `${s.cornerRadius}px` : undefined,
    boxShadow: s.shadow
      ? `${s.shadowOffsetX}px ${s.shadowOffsetY}px ${s.shadowBlur}px rgba(${sc.r},${sc.g},${sc.b},${s.shadowOpacity / 100})`
      : undefined,
  };
}

// ── Controls ─────────────────────────────────────────────────────────

export interface BorderControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
  onImageStyle?: (style: React.CSSProperties | null) => void;
}

export function BorderControls({
  settings: initialSettings,
  onChange,
  onImageStyle,
}: BorderControlsProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [borderWidth, setBorderWidth] = useState(10);
  const [borderColor, setBorderColor] = useState("#000000");
  const [padding, setPadding] = useState(0);
  const [paddingColor, setPaddingColor] = useState("#FFFFFF");
  const [cornerRadius, setCornerRadius] = useState(0);
  const [shadow, setShadow] = useState(false);
  const [shadowBlur, setShadowBlur] = useState(15);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(5);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowOpacity, setShadowOpacity] = useState(40);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.borderWidth != null) setBorderWidth(Number(initialSettings.borderWidth));
    if (initialSettings.borderColor != null) setBorderColor(String(initialSettings.borderColor));
    if (initialSettings.padding != null) setPadding(Number(initialSettings.padding));
    if (initialSettings.paddingColor != null) setPaddingColor(String(initialSettings.paddingColor));
    if (initialSettings.cornerRadius != null) setCornerRadius(Number(initialSettings.cornerRadius));
    if (initialSettings.shadow != null) setShadow(Boolean(initialSettings.shadow));
    if (initialSettings.shadowBlur != null) setShadowBlur(Number(initialSettings.shadowBlur));
    if (initialSettings.shadowOffsetX != null)
      setShadowOffsetX(Number(initialSettings.shadowOffsetX));
    if (initialSettings.shadowOffsetY != null)
      setShadowOffsetY(Number(initialSettings.shadowOffsetY));
    if (initialSettings.shadowColor != null) setShadowColor(String(initialSettings.shadowColor));
    if (initialSettings.shadowOpacity != null)
      setShadowOpacity(Number(initialSettings.shadowOpacity));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const onImageStyleRef = useRef(onImageStyle);
  useEffect(() => {
    onImageStyleRef.current = onImageStyle;
  });

  useEffect(() => {
    const vals = {
      borderWidth,
      borderColor,
      padding,
      paddingColor,
      cornerRadius,
      shadow,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      shadowColor,
      shadowOpacity,
    };
    onChangeRef.current?.(vals);
    onImageStyleRef.current?.(buildPreviewStyle(vals));
  }, [
    borderWidth,
    borderColor,
    padding,
    paddingColor,
    cornerRadius,
    shadow,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    shadowColor,
    shadowOpacity,
  ]);

  const applyPreset = (preset: BorderPreset) => {
    setSelectedPreset(preset.name);
    setBorderWidth(preset.borderWidth);
    setBorderColor(preset.borderColor);
    setPadding(preset.padding);
    setPaddingColor(preset.paddingColor);
    setCornerRadius(preset.cornerRadius);
    setShadow(preset.shadow);
    setShadowBlur(preset.shadowBlur);
    setShadowOffsetX(preset.shadowOffsetX);
    setShadowOffsetY(preset.shadowOffsetY);
    setShadowColor(preset.shadowColor);
    setShadowOpacity(preset.shadowOpacity);
  };

  const clearPreset = () => setSelectedPreset(null);

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Presets</p>
        <div className="grid grid-cols-4 gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`text-[11px] py-1.5 rounded transition-colors ${
                selectedPreset === preset.name
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Border */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-width" className="text-xs text-muted-foreground">
            Border Width
          </label>
          <span className="text-xs font-mono text-foreground">{borderWidth}px</span>
        </div>
        <input
          id="border-width"
          type="range"
          min={0}
          max={200}
          value={borderWidth}
          onChange={(e) => {
            setBorderWidth(Number(e.target.value));
            clearPreset();
          }}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="border-color" className="text-xs text-muted-foreground">
          Border Color
        </label>
        <ColorSwatches
          id="border-color"
          value={borderColor}
          onChange={(c) => {
            setBorderColor(c);
            clearPreset();
          }}
        />
      </div>

      <div className="border-t border-border" />

      {/* Padding */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-padding" className="text-xs text-muted-foreground">
            Padding
          </label>
          <span className="text-xs font-mono text-foreground">{padding}px</span>
        </div>
        <input
          id="border-padding"
          type="range"
          min={0}
          max={200}
          value={padding}
          onChange={(e) => {
            setPadding(Number(e.target.value));
            clearPreset();
          }}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="padding-color" className="text-xs text-muted-foreground">
          Padding Color
        </label>
        <ColorSwatches
          id="padding-color"
          value={paddingColor}
          onChange={(c) => {
            setPaddingColor(c);
            clearPreset();
          }}
        />
      </div>

      <div className="border-t border-border" />

      {/* Corner Radius */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-corner-radius" className="text-xs text-muted-foreground">
            Corner Radius
          </label>
          <span className="text-xs font-mono text-foreground">{cornerRadius}px</span>
        </div>
        <input
          id="border-corner-radius"
          type="range"
          min={0}
          max={200}
          value={cornerRadius}
          onChange={(e) => {
            setCornerRadius(Number(e.target.value));
            clearPreset();
          }}
          className="w-full mt-1"
        />
      </div>

      <div className="border-t border-border" />

      {/* Shadow */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Shadow</span>
          <button
            type="button"
            role="switch"
            aria-checked={shadow}
            onClick={() => {
              setShadow(!shadow);
              clearPreset();
            }}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              shadow ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                shadow ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {shadow && (
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex justify-between items-center">
                <label htmlFor="shadow-blur" className="text-xs text-muted-foreground">
                  Blur
                </label>
                <span className="text-xs font-mono text-foreground">{shadowBlur}px</span>
              </div>
              <input
                id="shadow-blur"
                type="range"
                min={1}
                max={50}
                value={shadowBlur}
                onChange={(e) => {
                  setShadowBlur(Number(e.target.value));
                  clearPreset();
                }}
                className="w-full mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-center">
                  <label htmlFor="shadow-offset-x" className="text-xs text-muted-foreground">
                    Offset X
                  </label>
                  <span className="text-xs font-mono text-foreground">{shadowOffsetX}</span>
                </div>
                <input
                  id="shadow-offset-x"
                  type="range"
                  min={-50}
                  max={50}
                  value={shadowOffsetX}
                  onChange={(e) => {
                    setShadowOffsetX(Number(e.target.value));
                    clearPreset();
                  }}
                  className="w-full mt-1"
                />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label htmlFor="shadow-offset-y" className="text-xs text-muted-foreground">
                    Offset Y
                  </label>
                  <span className="text-xs font-mono text-foreground">{shadowOffsetY}</span>
                </div>
                <input
                  id="shadow-offset-y"
                  type="range"
                  min={-50}
                  max={50}
                  value={shadowOffsetY}
                  onChange={(e) => {
                    setShadowOffsetY(Number(e.target.value));
                    clearPreset();
                  }}
                  className="w-full mt-1"
                />
              </div>
            </div>

            <div>
              <label htmlFor="shadow-color" className="text-xs text-muted-foreground">
                Shadow Color
              </label>
              <ColorSwatches
                id="shadow-color"
                value={shadowColor}
                onChange={(c) => {
                  setShadowColor(c);
                  clearPreset();
                }}
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label htmlFor="shadow-opacity" className="text-xs text-muted-foreground">
                  Opacity
                </label>
                <span className="text-xs font-mono text-foreground">{shadowOpacity}%</span>
              </div>
              <input
                id="shadow-opacity"
                type="range"
                min={0}
                max={100}
                value={shadowOpacity}
                onChange={(e) => {
                  setShadowOpacity(Number(e.target.value));
                  clearPreset();
                }}
                className="w-full mt-1"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings Panel ───────────────────────────────────────────────────

export function BorderSettings({
  onImageStyle,
}: {
  onImageStyle?: (style: React.CSSProperties | null) => void;
}) {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("border");

  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleSettingsChange = useCallback((s: Record<string, unknown>) => {
    setSettings(s);
  }, []);

  const hasFile = files.length > 0;
  const hasEffect =
    Number(settings.borderWidth) > 0 ||
    Number(settings.padding) > 0 ||
    Number(settings.cornerRadius) > 0 ||
    Boolean(settings.shadow);
  const canProcess = hasFile && !processing && hasEffect;

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <BorderControls onChange={handleSettingsChange} onImageStyle={onImageStyle} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Applying border"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="border-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply Border (${files.length} files)` : "Apply Border"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="border-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
