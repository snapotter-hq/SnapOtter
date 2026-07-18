import { ChevronDown, ChevronRight, Download } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Method = "adaptive" | "unsharp-mask" | "high-pass";
type Denoise = "off" | "light" | "medium" | "strong";

interface Preset {
  name: string;
  sigma: number;
  m1: number;
  m2: number;
  x1: number;
  y2: number;
  y3: number;
}

const PRESETS: Preset[] = [
  { name: "Light", sigma: 0.5, m1: 0.5, m2: 1.5, x1: 2.0, y2: 8, y3: 15 },
  { name: "Medium", sigma: 1.0, m1: 1.0, m2: 3.0, x1: 2.0, y2: 12, y3: 20 },
  { name: "Strong", sigma: 1.5, m1: 1.5, m2: 5.0, x1: 2.0, y2: 15, y3: 25 },
  { name: "Portrait", sigma: 1.0, m1: 0.0, m2: 2.5, x1: 3.0, y2: 8, y3: 15 },
  { name: "Landscape", sigma: 0.8, m1: 1.0, m2: 4.0, x1: 1.5, y2: 12, y3: 20 },
  { name: "Detail", sigma: 0.5, m1: 2.0, m2: 5.0, x1: 1.0, y2: 15, y3: 25 },
  { name: "Print", sigma: 1.5, m1: 1.5, m2: 3.5, x1: 2.0, y2: 15, y3: 25 },
];

export function SharpeningSettings() {
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
  } = useToolProcessor("sharpening");

  const [method, setMethod] = useState<Method>("adaptive");
  const [sigma, setSigma] = useState(1.0);
  const [m1, setM1] = useState(1.0);
  const [m2, setM2] = useState(3.0);
  const [x1, setX1] = useState(2.0);
  const [y2, setY2] = useState(12);
  const [y3, setY3] = useState(20);
  const [amount, setAmount] = useState(100);
  const [radius, setRadius] = useState(1.0);
  const [threshold, setThreshold] = useState(0);
  const [strength, setStrength] = useState(50);
  const [kernelSize, setKernelSize] = useState<3 | 5>(3);
  const [denoise, setDenoise] = useState<Denoise>("off");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("Medium");

  const applyPreset = (preset: Preset) => {
    setMethod("adaptive");
    setSigma(preset.sigma);
    setM1(preset.m1);
    setM2(preset.m2);
    setX1(preset.x1);
    setY2(preset.y2);
    setY3(preset.y3);
    setActivePreset(preset.name);
  };

  const clearPreset = () => setActivePreset(null);

  const handleProcess = () => {
    const settings = {
      method,
      sigma,
      m1,
      m2,
      x1,
      y2,
      y3,
      amount,
      radius,
      threshold,
      strength,
      kernelSize,
      denoise,
    };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Method selector */}
      <SectionLabel>{t.toolSettings.sharpening.method}</SectionLabel>
      <div className="grid grid-cols-3 gap-1">
        {(["adaptive", "unsharp-mask", "high-pass"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => {
              setMethod(m);
              clearPreset();
            }}
            className={`text-xs py-2 rounded transition-colors ${
              method === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            {m === "adaptive" ? "Adaptive" : m === "unsharp-mask" ? "Unsharp Mask" : "High-Pass"}
          </button>
        ))}
      </div>

      {/* Presets (adaptive only) */}
      {method === "adaptive" && (
        <>
          <SectionLabel>{t.toolSettings.sharpening.presets}</SectionLabel>
          <div className="grid grid-cols-4 gap-1">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.name}
                onClick={() => applyPreset(p)}
                className={`text-xs py-1.5 rounded transition-colors ${
                  activePreset === p.name
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-primary/10"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Primary slider per method */}
      <SectionLabel>
        {method === "adaptive"
          ? "Texture Amount"
          : method === "unsharp-mask"
            ? "Amount"
            : "Strength"}
      </SectionLabel>
      <div className="space-y-2">
        {method === "adaptive" && (
          <SliderControl
            label="Texture Amount"
            value={m2}
            onChange={(v) => {
              setM2(v);
              clearPreset();
            }}
            min={0}
            max={20}
            step={0.1}
          />
        )}
        {method === "unsharp-mask" && (
          <SliderControl
            label="Amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              clearPreset();
            }}
            min={0}
            max={500}
            step={1}
            hint="%"
          />
        )}
        {method === "high-pass" && (
          <SliderControl
            label="Strength"
            value={strength}
            onChange={(v) => {
              setStrength(v);
              clearPreset();
            }}
            min={0}
            max={100}
            step={1}
          />
        )}
      </div>

      {/* Noise reduction */}
      <SectionLabel>{t.toolSettings.sharpening.noiseReduction}</SectionLabel>
      <div className="grid grid-cols-4 gap-1">
        {(["off", "light", "medium", "strong"] as const).map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => setDenoise(d)}
            className={`text-xs py-1.5 rounded capitalize transition-colors ${
              denoise === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Advanced controls */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced Controls
      </button>

      {advancedOpen && (
        <div className="space-y-2 ps-1">
          {method === "adaptive" && (
            <>
              <SliderControl
                label="Radius"
                value={sigma}
                onChange={(v) => {
                  setSigma(v);
                  clearPreset();
                }}
                min={0.5}
                max={10}
                step={0.1}
                hint="sigma"
              />
              <SliderControl
                label="Flat Protection"
                value={m1}
                onChange={(v) => {
                  setM1(v);
                  clearPreset();
                }}
                min={0}
                max={10}
                step={0.1}
                hint="smooth areas"
              />
              <SliderControl
                label="Detail Threshold"
                value={x1}
                onChange={(v) => {
                  setX1(v);
                  clearPreset();
                }}
                min={0}
                max={10}
                step={0.1}
                hint="flat vs texture"
              />
              <SliderControl
                label="Halo Limit (Light)"
                value={y2}
                onChange={(v) => {
                  setY2(v);
                  clearPreset();
                }}
                min={0}
                max={50}
                step={1}
              />
              <SliderControl
                label="Halo Limit (Dark)"
                value={y3}
                onChange={(v) => {
                  setY3(v);
                  clearPreset();
                }}
                min={0}
                max={50}
                step={1}
              />
            </>
          )}
          {method === "unsharp-mask" && (
            <>
              <SliderControl
                label="Radius"
                value={radius}
                onChange={(v) => {
                  setRadius(v);
                  clearPreset();
                }}
                min={0.1}
                max={5}
                step={0.1}
                hint="px"
              />
              <SliderControl
                label="Threshold"
                value={threshold}
                onChange={(v) => {
                  setThreshold(v);
                  clearPreset();
                }}
                min={0}
                max={255}
                step={1}
                hint="edge sensitivity"
              />
            </>
          )}
          {method === "high-pass" && (
            <>
              <SectionLabel>Kernel Size</SectionLabel>
              <div className="grid grid-cols-2 gap-1">
                {([3, 5] as const).map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => {
                      setKernelSize(k);
                      clearPreset();
                    }}
                    className={`text-xs py-1.5 rounded transition-colors ${
                      kernelSize === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-primary/10"
                    }`}
                  >
                    {k}x{k}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          label={t.toolSettings.sharpening.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="sharpening-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.sharpening.submitBatch, { count: files.length })
            : t.toolSettings.sharpening.submit}
        </button>
      )}

      {downloadUrl && files.length <= 1 && (
        <a
          href={downloadUrl}
          download
          data-testid="sharpening-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
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
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
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
  step,
  color,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  color?: string;
  hint?: string;
}) {
  const id = `sharpen-slider-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const displayValue = step && step < 1 ? value.toFixed(1) : String(value);
  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor={id} className={`text-xs ${color || "text-muted-foreground"}`}>
          {label}
          {hint && <span className="text-[10px] text-muted-foreground ms-1">({hint})</span>}
        </label>
        <span className="text-xs font-mono text-foreground tabular-nums w-10 text-end">
          {displayValue}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-0.5"
      />
    </div>
  );
}
