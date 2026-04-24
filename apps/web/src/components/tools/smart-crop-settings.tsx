import { SMART_CROP_FACE_PRESETS, SOCIAL_MEDIA_PRESETS } from "@snapotter/shared";
import { ArrowLeftRight, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type CropMode = "subject" | "face" | "trim";
type SubjectTab = "presets" | "custom";

const platforms = [...new Set(SOCIAL_MEDIA_PRESETS.map((p) => p.platform))];

const ASPECT_PRESETS = [
  { label: "1:1", w: 1080, h: 1080 },
  { label: "4:3", w: 1440, h: 1080 },
  { label: "3:2", w: 1620, h: 1080 },
  { label: "16:9", w: 1920, h: 1080 },
  { label: "4:5", w: 1080, h: 1350 },
  { label: "9:16", w: 1080, h: 1920 },
];

function HintIcon({ text }: { text: string }) {
  return (
    <span className="relative group">
      <Info className="h-3 w-3 text-muted-foreground" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded bg-foreground px-2 py-1.5 text-[11px] leading-tight text-background opacity-0 transition-opacity group-hover:opacity-100 z-10">
        {text}
      </span>
    </span>
  );
}

export interface SmartCropControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function SmartCropControls({ settings: initialSettings, onChange }: SmartCropControlsProps) {
  const [mode, setMode] = useState<CropMode>("subject");
  const [subjectTab, setSubjectTab] = useState<SubjectTab>("custom");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Subject mode state
  const [strategy, setStrategy] = useState<"attention" | "entropy">("attention");

  // Face mode state
  const [facePreset, setFacePreset] = useState("head-shoulders");
  const [sensitivity, setSensitivity] = useState(50);

  // Shared subject/face state
  const [width, setWidth] = useState("1080");
  const [height, setHeight] = useState("1080");
  const [padding, setPadding] = useState(0);

  // Trim mode state
  const [threshold, setThreshold] = useState(30);
  const [padToSquare, setPadToSquare] = useState(false);
  const [padColor, setPadColor] = useState("#ffffff");
  const [targetSize, setTargetSize] = useState("1000");

  // Shared
  const [quality, setQuality] = useState(95);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.mode != null) setMode(initialSettings.mode as CropMode);
    if (initialSettings.strategy != null)
      setStrategy(initialSettings.strategy as "attention" | "entropy");
    if (initialSettings.facePreset != null) setFacePreset(String(initialSettings.facePreset));
    if (initialSettings.sensitivity != null)
      setSensitivity(Number(initialSettings.sensitivity) * 100);
    if (initialSettings.width != null) setWidth(String(initialSettings.width));
    if (initialSettings.height != null) setHeight(String(initialSettings.height));
    if (initialSettings.padding != null) setPadding(Number(initialSettings.padding));
    if (initialSettings.threshold != null) setThreshold(Number(initialSettings.threshold));
    if (initialSettings.padToSquare != null) setPadToSquare(Boolean(initialSettings.padToSquare));
    if (initialSettings.padColor != null) setPadColor(String(initialSettings.padColor));
    if (initialSettings.targetSize != null) setTargetSize(String(initialSettings.targetSize));
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (mode === "subject") {
      onChangeRef.current?.({
        mode: "subject",
        strategy,
        width: Number(width),
        height: Number(height),
        padding,
        quality,
      });
    } else if (mode === "face") {
      onChangeRef.current?.({
        mode: "face",
        facePreset,
        sensitivity: sensitivity / 100,
        width: Number(width),
        height: Number(height),
        padding,
        quality,
      });
    } else {
      onChangeRef.current?.({
        mode: "trim",
        threshold,
        padToSquare,
        padColor,
        quality,
        ...(padToSquare ? { targetSize: Number(targetSize) } : {}),
      });
    }
  }, [
    mode,
    strategy,
    facePreset,
    sensitivity,
    width,
    height,
    padding,
    threshold,
    padToSquare,
    padColor,
    targetSize,
    quality,
  ]);

  const handleSocialPreset = (preset: (typeof SOCIAL_MEDIA_PRESETS)[number]) => {
    const key = `${preset.platform}-${preset.name}`;
    if (selectedPreset === key) {
      setSelectedPreset(null);
      setWidth("1080");
      setHeight("1080");
    } else {
      setSelectedPreset(key);
      setWidth(String(preset.width));
      setHeight(String(preset.height));
    }
  };

  const handleAspectPreset = (p: (typeof ASPECT_PRESETS)[number]) => {
    setWidth(String(p.w));
    setHeight(String(p.h));
    setSelectedPreset(null);
  };

  const swapDimensions = () => {
    const tmp = width;
    setWidth(height);
    setHeight(tmp);
    setSelectedPreset(null);
  };

  const modeTabClass = (m: CropMode) =>
    `flex-1 text-xs py-1.5 rounded ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  const subTabClass = (t: SubjectTab) =>
    `flex-1 text-[11px] py-1 rounded ${subjectTab === t ? "bg-primary/15 text-foreground font-medium" : "text-muted-foreground"}`;

  // Shared dimension inputs with swap button
  const dimensionInputs = (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="sc-width" className="text-xs text-muted-foreground">
          Width (px)
        </label>
        <input
          id="sc-width"
          type="number"
          value={width}
          onChange={(e) => {
            setWidth(e.target.value);
            setSelectedPreset(null);
          }}
          min={1}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <button
        type="button"
        onClick={swapDimensions}
        className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
        title="Swap width and height"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <label htmlFor="sc-height" className="text-xs text-muted-foreground">
          Height (px)
        </label>
        <input
          id="sc-height"
          type="number"
          value={height}
          onChange={(e) => {
            setHeight(e.target.value);
            setSelectedPreset(null);
          }}
          min={1}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );

  // Quick aspect ratio buttons
  const aspectButtons = (
    <div className="flex gap-1">
      {ASPECT_PRESETS.map((p) => {
        const isActive = width === String(p.w) && height === String(p.h);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => handleAspectPreset(p)}
            className={`flex-1 text-[11px] py-1.5 rounded ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );

  // Quality slider (shared)
  const qualitySlider = (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="sc-quality" className="text-xs text-muted-foreground">
          Output Quality
        </label>
        <span className="text-xs text-muted-foreground tabular-nums">{quality}%</span>
      </div>
      <input
        id="sc-quality"
        type="range"
        min={1}
        max={100}
        value={quality}
        onChange={(e) => setQuality(Number(e.target.value))}
        className="w-full mt-1"
      />
      <p className="text-[10px] text-muted-foreground mt-0.5">
        For JPEG and WebP outputs. PNG is always lossless.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("subject")}
          className={modeTabClass("subject")}
        >
          Subject Focus
        </button>
        <button type="button" onClick={() => setMode("face")} className={modeTabClass("face")}>
          Face Focus
        </button>
        <button type="button" onClick={() => setMode("trim")} className={modeTabClass("trim")}>
          Auto Trim
        </button>
      </div>

      {/* ─── Subject Focus ─── */}
      {mode === "subject" && (
        <div className="space-y-4">
          {/* Sub-tabs: Presets / Custom */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSubjectTab("custom")}
              className={subTabClass("custom")}
            >
              Custom Size
            </button>
            <button
              type="button"
              onClick={() => setSubjectTab("presets")}
              className={subTabClass("presets")}
            >
              Social Presets
            </button>
          </div>

          {subjectTab === "presets" ? (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {platforms.map((platform) => (
                <div key={platform}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{platform}</p>
                  <div className="space-y-1">
                    {SOCIAL_MEDIA_PRESETS.filter((p) => p.platform === platform).map((preset) => {
                      const key = `${preset.platform}-${preset.name}`;
                      const isSelected = selectedPreset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleSocialPreset(preset)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded border text-sm transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          <span>{preset.name}</span>
                          <span className="text-xs tabular-nums">
                            {preset.width} x {preset.height}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {dimensionInputs}
              {aspectButtons}
            </>
          )}

          {/* Strategy toggle */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs text-muted-foreground">Detection Strategy</span>
              <HintIcon text="Attention finds the most visually salient region. Entropy finds the area with most detail and information." />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setStrategy("attention")}
                className={`flex-1 text-xs py-1.5 rounded ${strategy === "attention" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                Attention
              </button>
              <button
                type="button"
                onClick={() => setStrategy("entropy")}
                className={`flex-1 text-xs py-1.5 rounded ${strategy === "entropy" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                Entropy
              </button>
            </div>
          </div>

          {/* Padding slider */}
          <div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <label htmlFor="sc-padding" className="text-xs text-muted-foreground">
                  Padding
                </label>
                <HintIcon text="Extra breathing room around the focus area" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{padding}%</span>
            </div>
            <input
              id="sc-padding"
              type="range"
              min={0}
              max={30}
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          {qualitySlider}

          <p className="text-[10px] text-muted-foreground">
            Detects the most interesting region using saliency analysis and crops to your target
            size.
          </p>
        </div>
      )}

      {/* ─── Face Focus ─── */}
      {mode === "face" && (
        <div className="space-y-4">
          {/* Face preset buttons */}
          <div>
            <span className="text-xs text-muted-foreground">Framing</span>
            <div className="flex gap-1 mt-1">
              {SMART_CROP_FACE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFacePreset(p.id)}
                  className={`flex-1 text-[11px] py-1.5 rounded ${facePreset === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target size */}
          {dimensionInputs}
          {aspectButtons}

          {/* Sensitivity slider */}
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="sc-sensitivity" className="text-xs text-muted-foreground">
                Detection Sensitivity
              </label>
              <span className="text-xs font-mono text-foreground">{sensitivity}%</span>
            </div>
            <input
              id="sc-sensitivity"
              type="range"
              min={10}
              max={90}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full mt-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>More faces</span>
              <span>Fewer false positives</span>
            </div>
          </div>

          {/* Padding slider */}
          <div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <label htmlFor="sc-face-padding" className="text-xs text-muted-foreground">
                  Face Padding
                </label>
                <HintIcon text="Extra space around detected faces" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{padding}%</span>
            </div>
            <input
              id="sc-face-padding"
              type="range"
              min={0}
              max={50}
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          {qualitySlider}

          <p className="text-[10px] text-muted-foreground">
            Uses AI face detection to keep faces properly framed. Falls back to Subject Focus if no
            faces are detected.
          </p>
        </div>
      )}

      {/* ─── Auto Trim ─── */}
      {mode === "trim" && (
        <div className="space-y-4">
          {/* Threshold */}
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="sc-threshold" className="text-xs text-muted-foreground">
                Tolerance
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">{threshold}</span>
            </div>
            <input
              id="sc-threshold"
              type="range"
              min={0}
              max={128}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              How different a border pixel can be from the edge color and still be trimmed. Higher =
              more aggressive.
            </p>
          </div>

          {/* Pad to square */}
          <div className="flex items-center gap-2">
            <input
              id="sc-pad-square"
              type="checkbox"
              checked={padToSquare}
              onChange={(e) => setPadToSquare(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="sc-pad-square" className="text-sm text-foreground">
              Pad to square
            </label>
          </div>

          {padToSquare && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="sc-target-size" className="text-xs text-muted-foreground">
                  Target size (px)
                </label>
                <input
                  id="sc-target-size"
                  type="number"
                  value={targetSize}
                  onChange={(e) => setTargetSize(e.target.value)}
                  min={1}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
              <div>
                <label htmlFor="sc-pad-color" className="text-xs text-muted-foreground">
                  Pad color
                </label>
                <input
                  id="sc-pad-color"
                  type="color"
                  value={padColor}
                  onChange={(e) => setPadColor(e.target.value)}
                  className="w-12 h-[34px] mt-0.5 rounded border border-border bg-background cursor-pointer"
                />
              </div>
            </div>
          )}

          {qualitySlider}

          <p className="text-[10px] text-muted-foreground">
            Removes uniform-color borders around your subject. Enable "Pad to square" for e-commerce
            ready images.
          </p>
        </div>
      )}
    </div>
  );
}

export function SmartCropSettings() {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("smart-crop");

  const [settings, setSettings] = useState<Record<string, unknown>>({
    mode: "subject",
    strategy: "attention",
    width: 1080,
    height: 1080,
    padding: 0,
    quality: 95,
  });

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const mode = settings.mode as string;
  const canProcess = mode === "trim" || (Number(settings.width) > 0 && Number(settings.height) > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && canProcess && !processing) handleProcess();
  };

  const buttonLabel =
    mode === "face" ? "Face Crop" : mode === "trim" ? "Trim Borders" : "Smart Crop";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SmartCropControls onChange={setSettings} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Smart cropping"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="smart-crop-submit"
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `${buttonLabel} (${files.length} files)` : buttonLabel}
        </button>
      )}
    </form>
  );
}
