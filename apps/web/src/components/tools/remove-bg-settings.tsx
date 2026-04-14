import {
  ChevronDown,
  ChevronRight,
  Download,
  ImageIcon,
  Package,
  Upload,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type SubjectType = "people" | "products" | "general";
type Quality = "fast" | "balanced" | "best" | "ultra";
type BackgroundType = "transparent" | "color" | "gradient" | "image";

type BgModel =
  | "birefnet-general"
  | "birefnet-general-lite"
  | "birefnet-matting"
  | "birefnet-portrait"
  | "bria-rmbg"
  | "u2net";

const MODEL_MAP: Record<SubjectType, Partial<Record<Quality, BgModel>>> = {
  people: {
    fast: "u2net",
    balanced: "birefnet-portrait",
    best: "birefnet-portrait",
    ultra: "birefnet-matting",
  },
  products: { fast: "u2net", balanced: "bria-rmbg", best: "birefnet-general" },
  general: { fast: "u2net", balanced: "birefnet-general-lite", best: "birefnet-general" },
};

const SUBJECT_OPTIONS: { value: SubjectType; label: string; icon: typeof User }[] = [
  { value: "people", label: "People", icon: User },
  { value: "products", label: "Products", icon: Package },
  { value: "general", label: "General", icon: ImageIcon },
];

const ALL_QUALITY_OPTIONS: { value: Quality; label: string; peopleOnly?: boolean }[] = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "HD" },
  { value: "best", label: "Max" },
  { value: "ultra", label: "Ultra", peopleOnly: true },
];

const COLOR_PRESETS = [
  { color: "#FFFFFF", label: "White" },
  { color: "#000000", label: "Black" },
  { color: "#FF0000", label: "Red" },
  { color: "#00FF00", label: "Green" },
  { color: "#0000FF", label: "Blue" },
];

const GRADIENT_PRESETS = [
  { color1: "#667eea", color2: "#764ba2", label: "Purple" },
  { color1: "#f093fb", color2: "#f5576c", label: "Pink" },
  { color1: "#4facfe", color2: "#00f2fe", label: "Blue" },
  { color1: "#43e97b", color2: "#38f9d7", label: "Green" },
  { color1: "#fa709a", color2: "#fee140", label: "Sunset" },
  { color1: "#a18cd1", color2: "#fbc2eb", label: "Lavender" },
];

// ── Section label ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

// ── Shared controls (used by both standalone page and pipeline steps) ──

export interface RemoveBgControlsProps {
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
}

export function RemoveBgControls({ settings: _settings, onChange }: RemoveBgControlsProps) {
  const [subject, setSubject] = useState<SubjectType>("people");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [isPassport, setIsPassport] = useState(true);

  // Background
  const [bgType, setBgType] = useState<BackgroundType>("transparent");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [gradColor1, setGradColor1] = useState("#667eea");
  const [gradColor2, setGradColor2] = useState("#764ba2");
  const [gradAngle, setGradAngle] = useState(180);
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);

  // Effects
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [blurIntensity, setBlurIntensity] = useState(50);
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowOpacity, setShadowOpacity] = useState(35);

  // Expandable sections
  const [effectsOpen, setEffectsOpen] = useState(false);

  // Filter quality options based on subject (Ultra only for People)
  const qualityOptions = ALL_QUALITY_OPTIONS.filter(
    (opt) => !opt.peopleOnly || subject === "people",
  );

  // If switching away from People while on Ultra, fall back to Best
  const effectiveQuality = quality === "ultra" && subject !== "people" ? "best" : quality;

  const model =
    isPassport && subject === "people"
      ? "birefnet-portrait"
      : MODEL_MAP[subject][effectiveQuality] || "birefnet-general";

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Sync settings on every control change
  useEffect(() => {
    const next: Record<string, unknown> = { model, backgroundType: bgType };

    if (bgType === "color") next.backgroundColor = bgColor;
    if (bgType === "gradient") {
      next.gradientColor1 = gradColor1;
      next.gradientColor2 = gradColor2;
      next.gradientAngle = gradAngle;
    }

    // Blur: enabled as effect on transparent bg means "blur original background"
    if (blurEnabled) {
      next.blurEnabled = true;
      next.blurIntensity = blurIntensity;
    }
    if (shadowEnabled) {
      next.shadowEnabled = true;
      next.shadowOpacity = shadowOpacity;
    }

    // Pass bgImageFile reference for the standalone wrapper to include in FormData
    if (bgType === "image" && bgImageFile) {
      next._bgImageFile = bgImageFile;
    }

    onChangeRef.current(next);
  }, [
    model,
    bgType,
    bgColor,
    gradColor1,
    gradColor2,
    gradAngle,
    bgImageFile,
    blurEnabled,
    blurIntensity,
    shadowEnabled,
    shadowOpacity,
  ]);

  return (
    <div className="space-y-3">
      {/* Subject type */}
      <SectionLabel>Subject</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {SUBJECT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setSubject(opt.value);
                if (opt.value !== "people") setIsPassport(false);
                else setIsPassport(true);
              }}
              className={`flex flex-col items-center gap-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                subject === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Passport checkbox - only for people, default ON */}
      {subject === "people" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPassport}
            onChange={(e) => setIsPassport(e.target.checked)}
            className="rounded border-border accent-primary"
          />
          <span className="text-sm text-muted-foreground">Passport / ID photo</span>
        </label>
      )}

      {/* Quality */}
      <SectionLabel>Quality</SectionLabel>
      <div className={`grid gap-1.5 ${qualityOptions.length > 3 ? "grid-cols-4" : "grid-cols-3"}`}>
        {qualityOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setQuality(opt.value)}
            className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              effectiveQuality === opt.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Background */}
      <SectionLabel>Background</SectionLabel>
      <div className="space-y-2">
        {/* Type buttons */}
        <div className="flex gap-1.5 flex-wrap">
          <BgTypeButton
            active={bgType === "transparent"}
            onClick={() => setBgType("transparent")}
            checkerboard
            label="Transparent"
          />
          <BgTypeButton
            active={bgType === "color"}
            onClick={() => setBgType("color")}
            color={bgColor}
            label="Color"
          />
          <BgTypeButton
            active={bgType === "gradient"}
            onClick={() => setBgType("gradient")}
            gradient={{ color1: gradColor1, color2: gradColor2 }}
            label="Gradient"
          />
          <BgTypeButton
            active={bgType === "image"}
            onClick={() => setBgType("image")}
            label="Image"
            isImage
          />
        </div>

        {/* Color options */}
        {bgType === "color" && (
          <div className="space-y-2 pl-1">
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => setBgColor(preset.color)}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    bgColor === preset.color ? "border-primary scale-110" : "border-border"
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.label}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                placeholder="#FF5500"
                className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground"
              />
            </div>
          </div>
        )}

        {/* Gradient options */}
        {bgType === "gradient" && (
          <div className="space-y-2 pl-1">
            <div className="flex gap-1.5 flex-wrap">
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setGradColor1(preset.color1);
                    setGradColor2(preset.color2);
                  }}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    gradColor1 === preset.color1 && gradColor2 === preset.color2
                      ? "border-primary scale-110"
                      : "border-border"
                  }`}
                  style={{
                    background: `linear-gradient(180deg, ${preset.color1}, ${preset.color2})`,
                  }}
                  title={preset.label}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={gradColor1}
                onChange={(e) => setGradColor1(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
                title="Start color"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="color"
                value={gradColor2}
                onChange={(e) => setGradColor2(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
                title="End color"
              />
            </div>
            <div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Direction</span>
                <span className="text-xs font-mono text-foreground">{gradAngle}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={gradAngle}
                onChange={(e) => setGradAngle(Number(e.target.value))}
                className="w-full mt-0.5"
              />
            </div>
          </div>
        )}

        {/* Image upload */}
        {bgType === "image" && (
          <div className="pl-1">
            {bgImageFile ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground truncate flex-1">{bgImageFile.name}</span>
                <button
                  type="button"
                  onClick={() => setBgImageFile(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-foreground transition-colors">
                <Upload className="h-3.5 w-3.5" />
                Choose background image
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.hif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setBgImageFile(file);
                  }}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Effects */}
      <button
        type="button"
        onClick={() => setEffectsOpen(!effectsOpen)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground w-full pt-1"
      >
        {effectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Effects
        {(blurEnabled || shadowEnabled) && (
          <span className="ml-auto text-primary text-[10px] normal-case font-normal">active</span>
        )}
      </button>

      {effectsOpen && (
        <div className="space-y-3 pl-1">
          {/* Blur */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blurEnabled}
                onChange={(e) => setBlurEnabled(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">Blur Background</span>
            </label>
            {blurEnabled && (
              <div className="mt-1.5 pl-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Intensity</span>
                  <span className="text-xs font-mono text-foreground tabular-nums w-8 text-right">
                    {blurIntensity}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={blurIntensity}
                  onChange={(e) => setBlurIntensity(Number(e.target.value))}
                  className="w-full mt-0.5"
                />
              </div>
            )}
          </div>

          {/* Shadow */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shadowEnabled}
                onChange={(e) => setShadowEnabled(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">Add Shadow</span>
            </label>
            {shadowEnabled && (
              <div className="mt-1.5 pl-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Opacity</span>
                  <span className="text-xs font-mono text-foreground tabular-nums w-8 text-right">
                    {shadowOpacity}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={shadowOpacity}
                  onChange={(e) => setShadowOpacity(Number(e.target.value))}
                  className="w-full mt-0.5"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Background type button ──

function BgTypeButton({
  active,
  onClick,
  label,
  color,
  gradient,
  checkerboard,
  isImage,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  gradient?: { color1: string; color2: string };
  checkerboard?: boolean;
  isImage?: boolean;
}) {
  let swatchStyle: React.CSSProperties = {};
  if (checkerboard) {
    swatchStyle = {
      backgroundImage:
        "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
    };
  } else if (gradient) {
    swatchStyle = {
      background: `linear-gradient(180deg, ${gradient.color1}, ${gradient.color2})`,
    };
  } else if (color) {
    swatchStyle = { backgroundColor: color };
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50"
      }`}
    >
      {isImage ? (
        <ImageIcon className="w-4 h-4" />
      ) : (
        <span className="w-4 h-4 rounded-sm border border-border shrink-0" style={swatchStyle} />
      )}
      {label}
    </button>
  );
}

// ── Standalone tool page wrapper (two-phase flow) ──

interface RemoveBgSettingsProps {
  onBgPreview?: (state: import("@/components/common/image-viewer").BgPreviewState | null) => void;
}

export function RemoveBgSettings({ onBgPreview }: RemoveBgSettingsProps = {}) {
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
  } = useToolProcessor("remove-background");

  const [settings, setSettings] = useState<Record<string, unknown>>({});

  // Two-phase state: after Phase 1 (bg removal), store job info for Phase 2 (effects)
  const [bgJobId, setBgJobId] = useState<string | null>(null);
  const [bgFilename, setBgFilename] = useState<string | null>(null);
  const [bgOriginalUrl, setBgOriginalUrl] = useState<string | null>(null);
  const [_effectsDownloadUrl, setEffectsDownloadUrl] = useState<string | null>(null);
  const [applyingEffects, setApplyingEffects] = useState(false);
  const [effectsError, setEffectsError] = useState<string | null>(null);

  // Create a blob URL for the uploaded background image (for CSS preview).
  // HEIC/HEIF files can't be displayed by browsers, so we decode them via the
  // server preview endpoint first.
  const [bgImageBlobUrl, setBgImageBlobUrl] = useState<string | null>(null);
  const bgImageFileRef = useRef<File | null>(null);
  useEffect(() => {
    const file = settings._bgImageFile as File | undefined;
    if (file && file !== bgImageFileRef.current) {
      bgImageFileRef.current = file;
      let revoke: (() => void) | null = null;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isHeic = ext === "heic" || ext === "heif" || ext === "hif";

      if (isHeic) {
        // Decode HEIC via server preview endpoint
        const formData = new FormData();
        formData.append("file", file);
        import("@/lib/api").then(({ formatHeaders }) => {
          fetch("/api/v1/preview", {
            method: "POST",
            headers: formatHeaders(),
            body: formData,
          })
            .then((res) => (res.ok ? res.blob() : null))
            .then((blob) => {
              if (blob && bgImageFileRef.current === file) {
                const url = URL.createObjectURL(blob);
                revoke = () => URL.revokeObjectURL(url);
                setBgImageBlobUrl(url);
              }
            })
            .catch(() => {});
        });
      } else {
        const url = URL.createObjectURL(file);
        revoke = () => URL.revokeObjectURL(url);
        setBgImageBlobUrl(url);
      }

      return () => revoke?.();
    }
    if (!file && bgImageFileRef.current) {
      bgImageFileRef.current = null;
      setBgImageBlobUrl(null);
    }
  }, [settings._bgImageFile]);

  const hasFile = files.length > 0;
  const bgRemoved = bgJobId !== null && !processing;

  // Build CSS preview state from current settings and send to tool-page
  useEffect(() => {
    if (!bgRemoved || !onBgPreview) return;

    const bgType = (settings.backgroundType as string) || "transparent";
    const blurEnabled = settings.blurEnabled as boolean;
    const blurIntensity = (settings.blurIntensity as number) ?? 50;
    const shadowEnabled = settings.shadowEnabled as boolean;
    const shadowOpacity = (settings.shadowOpacity as number) ?? 35;

    // When no effects are active and background is transparent, show the
    // before/after slider instead of the CSS preview (pass null).
    const hasAnyEffect = blurEnabled || shadowEnabled || bgType !== "transparent";
    if (!hasAnyEffect) {
      onBgPreview(null);
      return;
    }

    const preview: import("@/components/common/image-viewer").BgPreviewState = {};
    const sigma = 1 + (blurIntensity / 100) * 49;

    // Determine background source and blur
    if (bgType === "image" && bgImageBlobUrl) {
      preview.backgroundSrc = bgImageBlobUrl;
      if (blurEnabled) {
        preview.backgroundBlur = `blur(${sigma}px)`;
      }
    } else if (blurEnabled && (bgType === "transparent" || bgType === "blur")) {
      preview.backgroundSrc = bgOriginalUrl || undefined;
      preview.backgroundBlur = `blur(${sigma}px)`;
    } else if (bgType === "color") {
      preview.containerBackground = (settings.backgroundColor as string) || "#FFFFFF";
    } else if (bgType === "gradient") {
      const c1 = (settings.gradientColor1 as string) || "#667eea";
      const c2 = (settings.gradientColor2 as string) || "#764ba2";
      const angle = (settings.gradientAngle as number) ?? 180;
      preview.containerBackground = `linear-gradient(${angle}deg, ${c1}, ${c2})`;
    } else {
      preview.showCheckerboard = true;
    }

    // Shadow
    if (shadowEnabled) {
      const alpha = Math.round((shadowOpacity / 100) * 255)
        .toString(16)
        .padStart(2, "0");
      preview.dropShadow = `drop-shadow(0px 10px 15px #000000${alpha})`;
    }

    onBgPreview(preview);
  }, [
    bgRemoved,
    settings.backgroundType,
    settings.backgroundColor,
    settings.gradientColor1,
    settings.gradientColor2,
    settings.gradientAngle,
    settings.blurEnabled,
    settings.blurIntensity,
    settings.shadowEnabled,
    settings.shadowOpacity,
    bgOriginalUrl,
    bgImageBlobUrl,
    onBgPreview,
  ]);

  // Clear bg preview when no bg removal is active
  useEffect(() => {
    if (!bgRemoved && onBgPreview) onBgPreview(null);
  }, [bgRemoved, onBgPreview]);

  // Phase 1: Run AI background removal
  const handleRemoveBg = () => {
    // Reset Phase 2 state
    setBgJobId(null);
    setBgFilename(null);
    setBgOriginalUrl(null);
    setEffectsDownloadUrl(null);

    if (files.length > 1) {
      processAllFiles(files, settings);
      return;
    }

    // Custom XHR to capture the extended response (jobId, maskUrl, originalUrl)
    const formData = new FormData();
    formData.append("file", files[0]);

    const cleanSettings = { ...settings };
    delete cleanSettings._bgImageFile;
    formData.append("settings", JSON.stringify({ model: cleanSettings.model }));

    const clientJobId = `bg-${Date.now()}`;
    formData.append("clientJobId", clientJobId);

    // Use processFiles for the progress/SSE flow - it handles everything
    // But we need the extended response. Override via a fetch after processFiles completes.
    // Actually, let's use processFiles and then fetch the job info.
    processFiles(files, { model: settings.model });
  };

  // After processFiles completes, extract jobId from downloadUrl
  useEffect(() => {
    if (!downloadUrl || processing) return;
    // downloadUrl format: /api/v1/download/{jobId}/{filename}
    const parts = downloadUrl.split("/");
    const jobId = parts[4]; // [0]='' [1]='api' [2]='v1' [3]='download' [4]=jobId [5]=filename
    const filename = decodeURIComponent(parts[5] || "");
    if (jobId && filename) {
      setBgJobId(jobId);
      // Derive the cached filenames from the mask filename
      const baseName = filename.replace(/_mask\.png$|_nobg\.png$/, "");
      setBgFilename(baseName || filename.replace(/\.[^.]+$/, ""));
      // Build original URL from the job
      const origFilename = `${baseName || filename.replace(/\.[^.]+$/, "")}_original.png`;
      setBgOriginalUrl(`/api/v1/download/${jobId}/${encodeURIComponent(origFilename)}`);
    }
  }, [downloadUrl, processing]);

  // Phase 2: Apply effects and download
  const handleDownloadWithEffects = async () => {
    if (!bgJobId || !bgFilename) return;

    setApplyingEffects(true);
    try {
      const formData = new FormData();
      const effectSettings: Record<string, unknown> = {
        jobId: bgJobId,
        filename: `${bgFilename}.png`,
        backgroundType: settings.backgroundType,
        backgroundColor: settings.backgroundColor,
        gradientColor1: settings.gradientColor1,
        gradientColor2: settings.gradientColor2,
        gradientAngle: settings.gradientAngle,
        blurEnabled: settings.blurEnabled,
        blurIntensity: settings.blurIntensity,
        shadowEnabled: settings.shadowEnabled,
        shadowOpacity: settings.shadowOpacity,
      };
      formData.append("settings", JSON.stringify(effectSettings));

      const bgImageFile = settings._bgImageFile as File | undefined;
      if (bgImageFile) {
        formData.append("backgroundImage", bgImageFile);
      }

      const headers = (await import("@/lib/api")).formatHeaders();
      const response = await fetch("/api/v1/tools/remove-background/effects", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.details || body?.error || `Effects failed: ${response.status}`);
      }

      const result = await response.json();
      setEffectsDownloadUrl(result.downloadUrl);
      setEffectsError(null);

      // Auto-trigger download
      const a = document.createElement("a");
      a.href = result.downloadUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setEffectsError(err instanceof Error ? err.message : "Effects processing failed");
    } finally {
      setApplyingEffects(false);
    }
  };

  const hasEffectsToApply =
    settings.blurEnabled ||
    settings.shadowEnabled ||
    ((settings.backgroundType as string) || "transparent") !== "transparent";

  return (
    <div className="space-y-4">
      <RemoveBgControls settings={settings} onChange={setSettings} />

      {/* Errors */}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {effectsError && <p className="text-xs text-red-500">{effectsError}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && !processing && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Phase 1: Remove Background button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Removing background"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : !bgRemoved ? (
        <button
          type="button"
          data-testid="remove-background-submit"
          onClick={handleRemoveBg}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Remove Background (${files.length} files)` : "Remove Background"}
        </button>
      ) : null}

      {/* Phase 2: Single smart download button */}
      {bgRemoved && files.length <= 1 && (
        <div className="space-y-2">
          {hasEffectsToApply ? (
            <button
              type="button"
              data-testid="remove-background-download-effects"
              onClick={handleDownloadWithEffects}
              disabled={applyingEffects}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {applyingEffects ? "Rendering..." : "Download"}
            </button>
          ) : (
            <a
              href={downloadUrl || ""}
              download
              data-testid="remove-background-download"
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          )}
        </div>
      )}
    </div>
  );
}
