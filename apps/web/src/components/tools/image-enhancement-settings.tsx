import {
  Download,
  FileText,
  Moon,
  Mountain,
  Sparkles,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type EnhancementMode = "auto" | "portrait" | "landscape" | "low-light" | "food" | "document";

interface AnalysisScores {
  exposure: number;
  contrast: number;
  whiteBalance: number;
  saturation: number;
  sharpness: number;
  noise: number;
}

interface CorrectionParams {
  brightness: number;
  contrast: number;
  temperature: number;
  saturation: number;
  sharpness: number;
  denoise: number;
}

interface AnalysisData {
  scores: AnalysisScores;
  corrections: CorrectionParams;
  issues: string[];
  suggestedMode: EnhancementMode;
}

const MODES: { value: EnhancementMode; label: string; icon: typeof Sparkles }[] = [
  { value: "auto", label: "Auto", icon: Sparkles },
  { value: "portrait", label: "Portrait", icon: User },
  { value: "landscape", label: "Landscape", icon: Mountain },
  { value: "low-light", label: "Low Light", icon: Moon },
  { value: "food", label: "Food", icon: UtensilsCrossed },
  { value: "document", label: "Document", icon: FileText },
];

const PRESET_MULTIPLIERS: Record<EnhancementMode, Record<string, number>> = {
  auto: {
    brightness: 1.0,
    contrast: 1.0,
    temperature: 1.0,
    saturation: 1.0,
    sharpness: 1.0,
    denoise: 1.0,
  },
  portrait: {
    brightness: 0.8,
    contrast: 0.7,
    temperature: 1.2,
    saturation: 0.6,
    sharpness: 0.5,
    denoise: 1.5,
  },
  landscape: {
    brightness: 1.0,
    contrast: 1.3,
    temperature: 1.0,
    saturation: 1.4,
    sharpness: 1.5,
    denoise: 0.5,
  },
  "low-light": {
    brightness: 1.8,
    contrast: 1.5,
    temperature: 1.0,
    saturation: 0.8,
    sharpness: 1.2,
    denoise: 2.0,
  },
  food: {
    brightness: 0.8,
    contrast: 1.1,
    temperature: 1.3,
    saturation: 1.3,
    sharpness: 1.2,
    denoise: 0.5,
  },
  document: {
    brightness: 1.5,
    contrast: 2.0,
    temperature: 1.0,
    saturation: 0.0,
    sharpness: 2.0,
    denoise: 2.0,
  },
};

const ISSUE_LABELS: Record<string, string> = {
  underexposed: "Low Exposure",
  overexposed: "Overexposed",
  "low-contrast": "Flat Contrast",
  "color-cast": "Color Cast",
  desaturated: "Desaturated",
  "soft-focus": "Soft Focus",
  noisy: "Noisy",
};

const ISSUE_TO_TOGGLE: Record<string, string> = {
  underexposed: "exposure",
  overexposed: "exposure",
  "low-contrast": "contrast",
  "color-cast": "whiteBalance",
  desaturated: "saturation",
  "soft-focus": "sharpness",
  noisy: "denoise",
};

interface ImageEnhancementControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
  onPreviewFilter?: (filter: string) => void;
}

export function ImageEnhancementControls({
  settings: _initialSettings,
  onChange,
  onPreviewFilter,
}: ImageEnhancementControlsProps) {
  const { files } = useFileStore();
  const [mode, setMode] = useState<EnhancementMode>("auto");
  const [intensity, setIntensity] = useState(50);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    exposure: true,
    contrast: true,
    whiteBalance: true,
    saturation: true,
    sharpness: true,
    denoise: true,
  });

  const analyzeAbortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Analyze image when files change
  useEffect(() => {
    if (files.length === 0) {
      setAnalysis(null);
      return;
    }

    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    setAnalyzing(true);
    const formData = new FormData();
    formData.append("file", files[0]);

    fetch("/api/v1/tools/image-enhancement/analyze", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Analysis failed"))))
      .then((data: AnalysisData) => {
        setAnalysis(data);
        if (data.suggestedMode !== "auto") {
          setMode(data.suggestedMode);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Analysis error:", err);
        }
      })
      .finally(() => setAnalyzing(false));

    return () => controller.abort();
  }, [files]);

  // Emit settings when mode/intensity/toggles change
  useEffect(() => {
    onChangeRef.current?.({ mode, intensity, corrections: toggles });
  }, [mode, intensity, toggles]);

  // CSS filter preview
  useEffect(() => {
    if (!onPreviewFilter || !analysis) {
      onPreviewFilter?.("");
      return;
    }

    const presets = PRESET_MULTIPLIERS[mode];
    const scale = intensity / 50;
    const c = analysis.corrections;
    const parts: string[] = [];

    if (toggles.exposure && Math.abs(c.brightness) > 2) {
      const adj = c.brightness * (presets.brightness ?? 1) * scale;
      parts.push(`brightness(${1 + adj / 100})`);
    }
    if (toggles.contrast && Math.abs(c.contrast) > 2) {
      const adj = c.contrast * (presets.contrast ?? 1) * scale;
      parts.push(`contrast(${1 + adj / 100})`);
    }
    if (toggles.saturation && Math.abs(c.saturation) > 2) {
      const adj = c.saturation * (presets.saturation ?? 1) * scale;
      parts.push(`saturate(${1 + adj / 100})`);
    }
    if (toggles.whiteBalance && Math.abs(c.temperature) > 2) {
      parts.push("url(#snapotter-enhance-temp-filter)");
    }
    if (toggles.sharpness && c.sharpness > 2) {
      parts.push("url(#snapotter-enhance-sharpen-filter)");
    }

    onPreviewFilter(parts.join(" "));
  }, [analysis, mode, intensity, toggles, onPreviewFilter]);

  const toggleCorrection = (key: string) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const tempAdj = analysis
    ? (analysis.corrections.temperature * (PRESET_MULTIPLIERS[mode].temperature ?? 1) * intensity) /
      50 /
      100
    : 0;
  const sharpAdj = analysis
    ? (analysis.corrections.sharpness * (PRESET_MULTIPLIERS[mode].sharpness ?? 1) * intensity) /
      50 /
      100
    : 0;

  return (
    <>
      {/* Hidden SVG filters for preview */}
      {toggles.whiteBalance && Math.abs(tempAdj) > 0.02 && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <title>White balance temperature filter</title>
          <filter id="snapotter-enhance-temp-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values={`${1 + tempAdj * 0.15} 0 0 0 0  0 ${1 + tempAdj * 0.05} 0 0 0  0 0 ${1 - tempAdj * 0.15} 0 0  0 0 0 1 0`}
            />
          </filter>
        </svg>
      )}
      {toggles.sharpness && sharpAdj > 0.02 && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <title>Sharpen filter</title>
          <filter id="snapotter-enhance-sharpen-filter" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix={`0 ${-sharpAdj} 0 ${-sharpAdj} ${1 + 4 * sharpAdj} ${-sharpAdj} 0 ${-sharpAdj} 0`}
            />
          </filter>
        </svg>
      )}

      {/* Mode selector */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Enhancement Mode
      </p>
      <div className="grid grid-cols-3 gap-1">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex items-center justify-center gap-1 text-xs py-2 rounded transition-colors ${
              mode === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Intensity slider */}
      <div className="pt-1">
        <div className="flex justify-between items-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Intensity
          </p>
          <span className="text-xs font-mono text-foreground tabular-nums">{intensity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Analysis badges */}
      {analyzing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <div className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" />
          Analyzing image...
        </div>
      )}

      {analysis && !analyzing && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Detected Issues
          </p>
          {analysis.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Image looks good. Fine-tune with the intensity slider.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {analysis.issues.map((issue) => {
                const toggleKey = ISSUE_TO_TOGGLE[issue];
                const isEnabled = toggleKey ? toggles[toggleKey] !== false : true;
                return (
                  <button
                    key={issue}
                    type="button"
                    onClick={() => toggleKey && toggleCorrection(toggleKey)}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-colors ${
                      isEnabled
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground line-through"
                    }`}
                  >
                    {ISSUE_LABELS[issue] || issue}
                    {isEnabled && toggleKey && <X className="h-2.5 w-2.5 opacity-60" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Score indicators */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-1 pt-1">
            {(
              [
                ["Exposure", analysis.scores.exposure],
                ["Contrast", analysis.scores.contrast],
                ["White Bal", analysis.scores.whiteBalance],
                ["Saturation", analysis.scores.saturation],
                ["Sharpness", analysis.scores.sharpness],
                ["Noise", analysis.scores.noise],
              ] as const
            ).map(([label, score]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score < 35 ? "bg-amber-500" : score > 65 ? "bg-blue-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground/60 w-10 shrink-0">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Wrapper with process/download flow

export function ImageEnhancementSettings({
  onPreviewFilter,
}: {
  onPreviewFilter?: (filter: string) => void;
}) {
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
  } = useToolProcessor("image-enhancement");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const hasFile = files.length > 0;

  const handleProcess = () => {
    if (files.length > 1) {
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
      <ImageEnhancementControls onChange={setSettings} onPreviewFilter={onPreviewFilter} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Enhanced: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={files.length > 1 ? `Enhancing ${files.length} images` : "Enhancing image"}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="image-enhancement-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Enhance (${files.length} files)` : "Enhance"}
        </button>
      )}

      {downloadUrl && files.length <= 1 && (
        <a
          href={downloadUrl}
          download
          data-testid="image-enhancement-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
