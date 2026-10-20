import { HEX_COLOR_PATTERN, normalizeHexColor } from "@snapotter/shared";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ImageIcon,
  Package,
  Upload,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type SubjectType = "people" | "products" | "general";
type Quality = "fast" | "balanced" | "best" | "ultra";
type BackgroundType = "transparent" | "color" | "gradient" | "image";

type BgModel =
  | "birefnet-general"
  | "birefnet-general-lite"
  | "birefnet-hr-matting"
  | "birefnet-matting"
  | "birefnet-portrait"
  | "bria-rmbg"
  | "u2net";

const MODEL_MAP: Record<SubjectType, Partial<Record<Quality, BgModel>>> = {
  people: {
    fast: "u2net",
    balanced: "birefnet-general-lite",
    best: "birefnet-matting",
    ultra: "birefnet-hr-matting",
  },
  products: { fast: "u2net", balanced: "bria-rmbg", best: "birefnet-general" },
  general: { fast: "u2net", balanced: "birefnet-general-lite", best: "birefnet-general" },
};

const SUBJECT_OPTIONS: { value: SubjectType; icon: typeof User }[] = [
  { value: "people", icon: User },
  { value: "products", icon: Package },
  { value: "general", icon: ImageIcon },
];

// labelKey points into t.toolSettings["remove-background"]; the wire value stays `value`.
const ALL_QUALITY_OPTIONS: {
  value: Quality;
  labelKey: "fast" | "hd" | "max" | "ultra";
  peopleOnly?: boolean;
}[] = [
  { value: "fast", labelKey: "fast" },
  { value: "balanced", labelKey: "hd" },
  { value: "best", labelKey: "max" },
  { value: "ultra", labelKey: "ultra", peopleOnly: true },
];

const COLOR_PRESETS = [
  { color: "#FFFFFF", id: "white" },
  { color: "#000000", id: "black" },
  { color: "#FF0000", id: "red" },
  { color: "#00FF00", id: "green" },
  { color: "#0000FF", id: "blue" },
] as const;

const GRADIENT_PRESETS = [
  { color1: "#667eea", color2: "#764ba2", id: "purple" },
  { color1: "#f093fb", color2: "#f5576c", id: "pink" },
  { color1: "#4facfe", color2: "#00f2fe", id: "blue" },
  { color1: "#43e97b", color2: "#38f9d7", id: "green" },
  { color1: "#fa709a", color2: "#fee140", id: "sunset" },
  { color1: "#a18cd1", color2: "#fbc2eb", id: "lavender" },
] as const;

// ── Section label ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

// ── Shared controls (used by both standalone page and pipeline steps) ──

/** The pipeline step's controls: a step has no upload to carry a background image. */
export function RemoveBgPipelineControls(props: RemoveBgControlsProps) {
  return <RemoveBgControls {...props} allowImageBackground={false} />;
}

export interface RemoveBgControlsProps {
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
  /**
   * A background image is an uploaded file, which pipelines and multi-file
   * runs have no way to carry; the server answers 400 for it there (#1047).
   * False hides the option and treats a stored "image" as transparent.
   */
  allowImageBackground?: boolean;
  initialControls?: RemoveBgControlState;
  onControlsChange?: (controls: RemoveBgControlState) => void;
}

interface RemoveBgControlState {
  subject: SubjectType;
  quality: Quality;
  isPassport: boolean;
  chosenBgType: BackgroundType;
  bgColor: string;
  gradColor1: string;
  gradColor2: string;
  gradAngle: number;
  bgImageFile: File | null;
  blurEnabled: boolean;
  blurIntensity: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  edgeRefine: number;
  decontaminate: boolean;
  outputFormat: "png" | "webp" | "avif";
  effectsOpen: boolean;
}

interface RemovalRefineRecord {
  file: File | null;
  model: string;
  edgeRefine: number;
  decontaminate: boolean;
}

interface EffectsErrorRecord {
  file: File | null;
  downloadUrl: string;
  message: string;
}

function parseMaskDownloadUrl(downloadUrl: string | null): {
  jobId: string;
  baseName: string;
  originalUrl: string;
} | null {
  if (!downloadUrl) return null;
  const match = /\/api\/v1\/download\/([^/?#]+)\/([^/?#]+)$/.exec(downloadUrl);
  if (!match) return null;
  const jobId = match[1];
  const filename = decodeURIComponent(match[2]);
  if (!jobId || !filename) return null;
  const stripped = filename.replace(/_mask\.png$|_nobg\.png$/, "");
  const baseName = stripped || filename.replace(/\.[^.]+$/, "");
  const origFilename = `${baseName}_original.png`;
  return {
    jobId,
    baseName,
    originalUrl: appUrl(`/api/v1/download/${jobId}/${encodeURIComponent(origFilename)}`),
  };
}

function seedModelState(model: unknown): {
  subject: SubjectType;
  quality: Quality;
  isPassport: boolean;
} {
  switch (model) {
    case "birefnet-matting":
      return { subject: "people", quality: "best", isPassport: false };
    case "birefnet-hr-matting":
      return { subject: "people", quality: "ultra", isPassport: false };
    case "u2net":
      return { subject: "people", quality: "fast", isPassport: false };
    case "bria-rmbg":
      return { subject: "products", quality: "balanced", isPassport: false };
    case "birefnet-general-lite":
      return { subject: "general", quality: "balanced", isPassport: false };
    case "birefnet-general":
      return { subject: "general", quality: "best", isPassport: false };
    default:
      return { subject: "people", quality: "balanced", isPassport: true };
  }
}

function defaultControlState(settings?: Record<string, unknown>): RemoveBgControlState {
  const modelState = seedModelState(settings?.model);
  const blurEnabled = Boolean(settings?.blurEnabled);
  const shadowEnabled = Boolean(settings?.shadowEnabled);
  const edgeRefine = settings?.edgeRefine != null ? Number(settings.edgeRefine) : 0;
  const decontaminate = Boolean(settings?.decontaminate);
  return {
    subject: modelState.subject,
    quality: modelState.quality,
    isPassport: modelState.isPassport,
    chosenBgType: (settings?.backgroundType as BackgroundType) ?? "transparent",
    bgColor: settings?.backgroundColor != null ? String(settings.backgroundColor) : "#FFFFFF",
    gradColor1: settings?.gradientColor1 != null ? String(settings.gradientColor1) : "#667eea",
    gradColor2: settings?.gradientColor2 != null ? String(settings.gradientColor2) : "#764ba2",
    gradAngle: settings?.gradientAngle != null ? Number(settings.gradientAngle) : 180,
    bgImageFile: settings?._bgImageFile instanceof File ? settings._bgImageFile : null,
    blurEnabled,
    blurIntensity: settings?.blurIntensity != null ? Number(settings.blurIntensity) : 50,
    shadowEnabled,
    shadowOpacity: settings?.shadowOpacity != null ? Number(settings.shadowOpacity) : 35,
    edgeRefine,
    decontaminate,
    outputFormat: (settings?.outputFormat as "png" | "webp" | "avif") ?? "png",
    effectsOpen: Boolean(blurEnabled || shadowEnabled || edgeRefine || decontaminate),
  };
}

// Preserves RemoveBgSettings control selections, the recorded removalRefine
// state, and any active Phase 2 effectsError when ToolPage swaps its mobile and
// desktop subtrees across 768px (#2489, #2559) while the same files remain
// loaded in useFileStore.
const removeBgSession: {
  files: File[];
  controls: RemoveBgControlState;
  settings: Record<string, unknown>;
  removalRefine: RemovalRefineRecord | null;
  effectsError: EffectsErrorRecord | null;
} = {
  files: [],
  controls: defaultControlState(),
  settings: {},
  removalRefine: null,
  effectsError: null,
};

function sameFileList(a: File[], b: File[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((f, i) => f === b[i]);
}

function resetRemoveBgSession(files: File[] = []): void {
  removeBgSession.files = files;
  removeBgSession.controls = defaultControlState();
  removeBgSession.settings = {};
  removeBgSession.removalRefine = null;
  removeBgSession.effectsError = null;
}

useFileStore.subscribe((state) => {
  if (state.files.length === 0) {
    resetRemoveBgSession();
  }
});

export function RemoveBgControls({
  settings,
  onChange,
  allowImageBackground = true,
  initialControls,
  onControlsChange,
}: RemoveBgControlsProps) {
  const { t } = useTranslation();
  const seed = initialControls ?? defaultControlState(settings);
  const [subject, setSubject] = useState<SubjectType>(seed.subject);
  const [quality, setQuality] = useState<Quality>(seed.quality);
  const [isPassport, setIsPassport] = useState(seed.isPassport);

  // Background
  const [chosenBgType, setBgType] = useState<BackgroundType>(seed.chosenBgType);
  const bgType: BackgroundType =
    chosenBgType === "image" && !allowImageBackground ? "transparent" : chosenBgType;
  const [bgColor, setBgColor] = useState(seed.bgColor);
  const [gradColor1, setGradColor1] = useState(seed.gradColor1);
  const [gradColor2, setGradColor2] = useState(seed.gradColor2);
  const [gradAngle, setGradAngle] = useState(seed.gradAngle);
  const [bgImageFile, setBgImageFile] = useState<File | null>(seed.bgImageFile);

  const trimmedBgColor = bgColor.trim();
  const trimmedGradColor1 = gradColor1.trim();
  const trimmedGradColor2 = gradColor2.trim();
  const isValidBgColor = HEX_COLOR_PATTERN.test(trimmedBgColor);
  const isValidGradColor1 = HEX_COLOR_PATTERN.test(trimmedGradColor1);
  const isValidGradColor2 = HEX_COLOR_PATTERN.test(trimmedGradColor2);
  const isValidGradColor = isValidGradColor1 && isValidGradColor2;
  const isImageValid = bgImageFile !== null;
  const normalizedBgColor = isValidBgColor ? normalizeHexColor(trimmedBgColor) : null;
  const normalizedGradColor1 = isValidGradColor1 ? normalizeHexColor(trimmedGradColor1) : null;
  const normalizedGradColor2 = isValidGradColor2 ? normalizeHexColor(trimmedGradColor2) : null;

  // Effects
  const [blurEnabled, setBlurEnabled] = useState(seed.blurEnabled);
  const [blurIntensity, setBlurIntensity] = useState(seed.blurIntensity);
  const [shadowEnabled, setShadowEnabled] = useState(seed.shadowEnabled);
  const [shadowOpacity, setShadowOpacity] = useState(seed.shadowOpacity);

  // Post-processing
  const [edgeRefine, setEdgeRefine] = useState(seed.edgeRefine);
  const [decontaminate, setDecontaminate] = useState(seed.decontaminate);

  // Output
  const [outputFormat, setOutputFormat] = useState<"png" | "webp" | "avif">(seed.outputFormat);

  // Expandable sections
  const [effectsOpen, setEffectsOpen] = useState(seed.effectsOpen);

  // Seed local state from preloaded settings exactly once. Pipeline steps (e.g.
  // a template) mount this control with non-default settings; without seeding,
  // the emit effect below would overwrite them with the hardcoded defaults.
  // Mirrors the initializedRef pattern in resize-settings / convert-settings.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initialControls || !settings || initializedRef.current) return;
    initializedRef.current = true;
    if (settings.model != null) {
      const modelState = seedModelState(settings.model);
      setSubject(modelState.subject);
      setQuality(modelState.quality);
      setIsPassport(modelState.isPassport);
    }
    if (settings.backgroundType != null) setBgType(settings.backgroundType as BackgroundType);
    if (settings.backgroundColor != null) setBgColor(String(settings.backgroundColor));
    if (settings.gradientColor1 != null) setGradColor1(String(settings.gradientColor1));
    if (settings.gradientColor2 != null) setGradColor2(String(settings.gradientColor2));
    if (settings.gradientAngle != null) setGradAngle(Number(settings.gradientAngle));
    if (settings._bgImageFile instanceof File) setBgImageFile(settings._bgImageFile);
    if (settings.blurEnabled != null) setBlurEnabled(Boolean(settings.blurEnabled));
    if (settings.blurIntensity != null) setBlurIntensity(Number(settings.blurIntensity));
    if (settings.shadowEnabled != null) setShadowEnabled(Boolean(settings.shadowEnabled));
    if (settings.shadowOpacity != null) setShadowOpacity(Number(settings.shadowOpacity));
    if (settings.edgeRefine != null) setEdgeRefine(Number(settings.edgeRefine));
    if (settings.decontaminate != null) setDecontaminate(Boolean(settings.decontaminate));
    if (settings.outputFormat != null)
      setOutputFormat(settings.outputFormat as "png" | "webp" | "avif");
    // Reveal the effects section when any seeded effect is active so the
    // preloaded values are immediately visible (and adjustable).
    if (
      settings.blurEnabled ||
      settings.shadowEnabled ||
      settings.edgeRefine ||
      settings.decontaminate
    ) {
      setEffectsOpen(true);
    }
  }, [settings, initialControls]);

  // Filter quality options based on subject (Ultra only for People)
  const qualityOptions = ALL_QUALITY_OPTIONS.filter(
    (opt) => !opt.peopleOnly || subject === "people",
  );

  // If switching away from People while on Ultra, fall back to Best
  const effectiveQuality = quality === "ultra" && subject !== "people" ? "best" : quality;

  const model =
    isPassport && subject === "people" && effectiveQuality === "balanced"
      ? "birefnet-portrait"
      : MODEL_MAP[subject][effectiveQuality] || "birefnet-general";

  const onChangeRef = useRef(onChange);
  const onControlsChangeRef = useRef(onControlsChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onControlsChangeRef.current = onControlsChange;
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

    if (edgeRefine > 0) next.edgeRefine = edgeRefine;
    if (decontaminate) next.decontaminate = true;
    if (outputFormat !== "png") next.outputFormat = outputFormat;

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
    edgeRefine,
    decontaminate,
    outputFormat,
  ]);

  useEffect(() => {
    onControlsChangeRef.current?.({
      subject,
      quality,
      isPassport,
      chosenBgType,
      bgColor,
      gradColor1,
      gradColor2,
      gradAngle,
      bgImageFile,
      blurEnabled,
      blurIntensity,
      shadowEnabled,
      shadowOpacity,
      edgeRefine,
      decontaminate,
      outputFormat,
      effectsOpen,
    });
  }, [
    subject,
    quality,
    isPassport,
    chosenBgType,
    bgColor,
    gradColor1,
    gradColor2,
    gradAngle,
    bgImageFile,
    blurEnabled,
    blurIntensity,
    shadowEnabled,
    shadowOpacity,
    edgeRefine,
    decontaminate,
    outputFormat,
    effectsOpen,
  ]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground" data-testid="remove-bg-cpu-note">
        {t.toolSettings["remove-background"].cpuNote}
      </p>
      {/* Subject type */}
      <SectionLabel>{t.toolSettings["remove-background"].subject}</SectionLabel>
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
                else setIsPassport(quality === "balanced");
              }}
              className={`flex flex-col items-center gap-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                subject === opt.value
                  ? "border-primary bg-primary/10 text-primary-ink"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.toolSettings["remove-background"][opt.value]}
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
            onChange={(e) => {
              const checked = e.target.checked;
              setIsPassport(checked);
              if (checked) setQuality("balanced");
            }}
            className="rounded border-border accent-primary"
          />
          <span className="text-sm text-muted-foreground">
            {t.toolSettings["remove-background"].passportIdPhoto}
          </span>
        </label>
      )}

      {/* Quality */}
      <SectionLabel>{t.toolSettings["remove-background"].quality}</SectionLabel>
      <div className={`grid gap-1.5 ${qualityOptions.length > 3 ? "grid-cols-4" : "grid-cols-3"}`}>
        {qualityOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setQuality(opt.value);
              if (opt.value !== "balanced") setIsPassport(false);
            }}
            className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              effectiveQuality === opt.value
                ? "border-primary bg-primary/10 text-primary-ink"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {t.toolSettings["remove-background"][opt.labelKey]}
          </button>
        ))}
      </div>

      {/* Background */}
      <SectionLabel>{t.toolSettings["remove-background"].background}</SectionLabel>
      <div className="space-y-2">
        {/* Type buttons */}
        <div className="flex gap-1.5 flex-wrap">
          <BgTypeButton
            active={bgType === "transparent"}
            onClick={() => setBgType("transparent")}
            checkerboard
            label={t.toolSettings["remove-bg"].transparent}
          />
          <BgTypeButton
            active={bgType === "color"}
            onClick={() => setBgType("color")}
            color={normalizedBgColor ?? undefined}
            label={t.toolSettings["remove-bg"].color}
          />
          <BgTypeButton
            active={bgType === "gradient"}
            onClick={() => setBgType("gradient")}
            gradient={
              normalizedGradColor1 && normalizedGradColor2
                ? { color1: normalizedGradColor1, color2: normalizedGradColor2 }
                : undefined
            }
            label={t.toolSettings["remove-bg"].gradient}
          />
          {allowImageBackground && (
            <BgTypeButton
              active={bgType === "image"}
              onClick={() => setBgType("image")}
              label={t.toolSettings["remove-bg"].image}
              isImage
            />
          )}
        </div>

        {/* Color options */}
        {bgType === "color" && (
          <div className="space-y-2 ps-1">
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => setBgColor(preset.color)}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    normalizedBgColor === preset.color.toLowerCase()
                      ? "border-primary scale-110"
                      : "border-border"
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={t.toolSettings["remove-background"].colorPresets[preset.id]}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={normalizedBgColor ?? "#ffffff"}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                placeholder="#FF5500"
                aria-invalid={!isValidBgColor}
                className={`flex-1 px-2 py-1 rounded border bg-background text-xs text-foreground ${
                  !isValidBgColor ? "border-destructive" : "border-border"
                }`}
              />
            </div>
            {!isValidBgColor && (
              <p className="text-xs text-destructive-ink">
                {t.toolSettings["remove-background"].invalidHexColor}
              </p>
            )}
          </div>
        )}

        {/* Gradient options */}
        {bgType === "gradient" && (
          <div className="space-y-2 ps-1">
            <div className="flex gap-1.5 flex-wrap">
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setGradColor1(preset.color1);
                    setGradColor2(preset.color2);
                  }}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    normalizedGradColor1 === preset.color1.toLowerCase() &&
                    normalizedGradColor2 === preset.color2.toLowerCase()
                      ? "border-primary scale-110"
                      : "border-border"
                  }`}
                  style={{
                    background: `linear-gradient(180deg, ${preset.color1}, ${preset.color2})`,
                  }}
                  title={t.toolSettings["remove-background"].gradientPresets[preset.id]}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={normalizedGradColor1 ?? "#667eea"}
                onChange={(e) => setGradColor1(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
                title={t.toolSettings["remove-bg"].startColor}
              />
              <span className="text-xs text-muted-foreground">
                {t.toolSettings["remove-bg"].to}
              </span>
              <input
                type="color"
                value={normalizedGradColor2 ?? "#764ba2"}
                onChange={(e) => setGradColor2(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer"
                title={t.toolSettings["remove-bg"].endColor}
              />
            </div>
            {!isValidGradColor && (
              <p className="text-xs text-destructive-ink">
                {t.toolSettings["remove-background"].invalidHexColor}
              </p>
            )}
            <div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  {t.toolSettings["remove-bg"].direction}
                </span>
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
          <div className="space-y-1.5 ps-1">
            {bgImageFile ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground truncate flex-1">{bgImageFile.name}</span>
                <button
                  type="button"
                  onClick={() => setBgImageFile(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t.toolSettings["remove-bg"].remove}
                </button>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-foreground transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {t.toolSettings["remove-bg"].chooseBackgroundImage}
                  <input
                    type="file"
                    accept="image/*,.avif,.heic,.heif,.hif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setBgImageFile(file);
                    }}
                  />
                </label>
                {!isImageValid && (
                  <p className="text-xs text-muted-foreground">
                    {t.toolSettings["remove-background"].backgroundImageRequired}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Output format */}
      <SectionLabel>{t.toolSettings["remove-background"].outputFormat}</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {(["png", "webp", "avif"] as const).map((fmt) => (
          <button
            key={fmt}
            type="button"
            data-testid={`remove-background-format-${fmt}`}
            aria-pressed={outputFormat === fmt}
            onClick={() => setOutputFormat(fmt)}
            className={`py-2 px-2 rounded-lg border text-xs font-medium uppercase transition-colors ${
              outputFormat === fmt
                ? "border-primary bg-primary/10 text-primary-ink"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* Effects */}
      <button
        type="button"
        onClick={() => setEffectsOpen(!effectsOpen)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground w-full pt-1"
      >
        {effectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t.toolSettings["remove-bg"].effects}
        {(blurEnabled || shadowEnabled || edgeRefine > 0 || decontaminate) && (
          <span className="ms-auto text-primary-ink text-[10px] normal-case font-normal">
            {t.toolSettings["remove-bg"].active}
          </span>
        )}
      </button>

      {effectsOpen && (
        <div className="space-y-3 ps-1">
          {/* Blur */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blurEnabled}
                onChange={(e) => setBlurEnabled(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                {t.toolSettings["remove-background"].blurBackground}
              </span>
            </label>
            {blurEnabled && (
              <div className="mt-1.5 ps-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {t.toolSettings["remove-bg"].intensity}
                  </span>
                  <span className="text-xs font-mono text-foreground tabular-nums w-8 text-end">
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
              <span className="text-xs text-muted-foreground">
                {t.toolSettings["remove-background"].addShadow}
              </span>
            </label>
            {shadowEnabled && (
              <div className="mt-1.5 ps-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {t.toolSettings["remove-bg"].opacity}
                  </span>
                  <span className="text-xs font-mono text-foreground tabular-nums w-8 text-end">
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

          {/* Edge smoothing */}
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {t.toolSettings["remove-background"].edgeSmoothing}
              </span>
              <span className="text-xs font-mono text-foreground tabular-nums">
                {edgeRefine === 0
                  ? t.toolSettings["remove-background"].edgeSmoothingOff
                  : edgeRefine === 1
                    ? t.toolSettings["remove-background"].edgeSmoothingLight
                    : edgeRefine === 2
                      ? t.toolSettings["remove-background"].edgeSmoothingMedium
                      : t.toolSettings["remove-background"].edgeSmoothingStrong}
              </span>
            </div>
            <input
              type="range"
              data-testid="remove-background-edge-refine"
              min={0}
              max={3}
              step={1}
              value={edgeRefine}
              onChange={(e) => setEdgeRefine(Number(e.target.value))}
              className="w-full mt-0.5"
            />
          </div>

          {/* Color decontamination */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="remove-background-decontaminate"
                checked={decontaminate}
                onChange={(e) => setDecontaminate(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                {t.toolSettings["remove-background"].colorDecontamination}
              </span>
            </label>
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
          ? "border-primary bg-primary/10 text-primary-ink"
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
  const { t } = useTranslation();
  const { files, currentEntry } = useFileStore();
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

  const [initialControls] = useState<RemoveBgControlState>(() => {
    const currentFiles = useFileStore.getState().files;
    if (!sameFileList(removeBgSession.files, currentFiles)) {
      resetRemoveBgSession(currentFiles);
    }
    return removeBgSession.controls;
  });

  const [settings, setSettingsState] = useState<Record<string, unknown>>(
    () => removeBgSession.settings,
  );
  const sameSettings = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  };
  const setSettings = (next: Record<string, unknown>) => {
    const changed = !sameSettings(removeBgSession.settings, next);
    removeBgSession.settings = next;
    setSettingsState(next);
    if (changed && bgRemovedRef.current) {
      const store = useFileStore.getState();
      const entry = store.entries[store.selectedIndex] ?? store.entries[0];
      if (entry?.claimed && entry.processedUrl) {
        store.updateEntryById(entry.id, { processedUrl: entry.processedUrl });
      }
    }
  };
  const setControls = (next: RemoveBgControlState) => {
    removeBgSession.controls = next;
  };

  // The model and refinements the last single-file removal ran with. They are
  // sidecar options that Phase 2 cannot apply, so a change after the result
  // needs a new removal, and the panel says so (#2112, #2488).
  const [removalRefine, setRemovalRefineState] = useState<RemovalRefineRecord | null>(
    () => removeBgSession.removalRefine,
  );
  const setRemovalRefine = (next: RemovalRefineRecord | null) => {
    removeBgSession.removalRefine = next;
    setRemovalRefineState(next);
  };
  const [effectsError, setEffectsErrorState] = useState<string | null>(() => {
    const record = removeBgSession.effectsError;
    if (!record) return null;
    const loadedFiles = useFileStore.getState().files;
    const loaded = loadedFiles.length === 1 ? (loadedFiles[0] ?? null) : null;
    if (
      loaded === null ||
      record.file !== loaded ||
      processing ||
      error ||
      !downloadUrl ||
      record.downloadUrl !== downloadUrl
    ) {
      removeBgSession.effectsError = null;
      return null;
    }
    return record.message;
  });
  const downloadUrlRef = useRef(downloadUrl);
  downloadUrlRef.current = downloadUrl;
  const setEffectsError = useCallback((next: string | null, options?: { persist?: boolean }) => {
    const activeDownloadUrl = downloadUrlRef.current;
    if (next === null || options?.persist === false || !activeDownloadUrl) {
      removeBgSession.effectsError = null;
    } else {
      removeBgSession.effectsError = {
        file: useFileStore.getState().files[0] ?? null,
        downloadUrl: activeDownloadUrl,
        message: next,
      };
    }
    setEffectsErrorState(next);
  }, []);
  const runFileRef = useRef<File | null>(null);
  const expiredRerunInFlightRef = useRef(false);
  const effectsRunIdRef = useRef(0);
  const [applyingEffects, setApplyingEffects] = useState(false);

  const initialParsedDownload = !processing ? parseMaskDownloadUrl(downloadUrl) : null;

  // Two-phase state: after Phase 1 (bg removal), store job info for Phase 2 (effects)
  const [bgJobId, setBgJobId] = useState<string | null>(() => initialParsedDownload?.jobId ?? null);
  const [bgFilename, setBgFilename] = useState<string | null>(
    () => initialParsedDownload?.baseName ?? null,
  );
  const [bgOriginalUrl, setBgOriginalUrl] = useState<string | null>(
    () => initialParsedDownload?.originalUrl ?? null,
  );

  // The file a finished removal belongs to, and the file the running one was
  // started on. The result only counts while that file is the one loaded:
  // swapping files (during the run or after it) must not leave the download
  // and effects acting on another file's job (#2107).
  const [bgResultFile, setBgResultFile] = useState<File | null>(() =>
    initialParsedDownload ? (useFileStore.getState().files[0] ?? null) : null,
  );

  useEffect(() => {
    if (files.length > 0) {
      removeBgSession.files = files;
    } else {
      resetRemoveBgSession();
    }
  }, [files]);

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
        fetch(appUrl("/api/v1/preview"), {
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

  const bgType = (settings.backgroundType as string | undefined) ?? "transparent";
  const bgColor =
    typeof settings.backgroundColor === "string" ? settings.backgroundColor.trim() : "";
  const gradColor1 =
    typeof settings.gradientColor1 === "string" ? settings.gradientColor1.trim() : "";
  const gradColor2 =
    typeof settings.gradientColor2 === "string" ? settings.gradientColor2.trim() : "";
  const bgImageFile = settings._bgImageFile instanceof File ? settings._bgImageFile : undefined;

  const isValidBgColor = bgType !== "color" || HEX_COLOR_PATTERN.test(bgColor);
  const isValidGradColor =
    bgType !== "gradient" ||
    (HEX_COLOR_PATTERN.test(gradColor1) && HEX_COLOR_PATTERN.test(gradColor2));
  const isImageValid = bgType !== "image" || bgImageFile !== undefined;
  const isInputValid = isValidBgColor && isValidGradColor && isImageValid;

  const hasFile = files.length > 0;
  // A result counts while its file is the one loaded and the processor still
  // holds it: Undo clears the processed URL and has to take Phase 2 with it.
  const bgRemoved =
    bgJobId !== null &&
    !processing &&
    Boolean(downloadUrl) &&
    files.length === 1 &&
    files[0] === bgResultFile;
  const bgRemovedRef = useRef(bgRemoved);
  bgRemovedRef.current = bgRemoved;
  const bgJobIdRef = useRef(bgJobId);
  bgJobIdRef.current = bgJobId;

  // The result was made with a different model or refinements than the controls
  // now show. When the cutout arrived without a recorded run in this session,
  // the defaults are assumed: a change set afterwards may offer a re-run that
  // was not strictly needed, which costs a click, where saying nothing would
  // repeat the silent no-op.
  const activeRemovalRefine =
    removalRefine && removalRefine.file === (files[0] ?? null) ? removalRefine : null;
  const ranWith = activeRemovalRefine ?? {
    model: "birefnet-portrait",
    edgeRefine: 0,
    decontaminate: false,
  };
  const refineChanged =
    bgRemoved &&
    (String(settings.model ?? "birefnet-portrait") !== ranWith.model ||
      Number(settings.edgeRefine ?? 0) !== ranWith.edgeRefine ||
      Boolean(settings.decontaminate) !== ranWith.decontaminate);

  // Whether the user has configured any compositing effect.
  const hasEffectsToApply =
    settings.blurEnabled ||
    settings.shadowEnabled ||
    ((settings.backgroundType as string) || "transparent") !== "transparent";

  // The Phase 2 effects request is the single owner of the library save (#565):
  // it produces the final artifact the user downloads, whether that is the
  // composite (effects on) or the transparent result (effects off). Route the
  // download through it whenever effects apply, or whenever the file came from
  // the library and so needs saving. Phase 1 never saves an intermediate. This
  // keeps the skip and save decisions reading the same live state at one point,
  // so toggling effects after Phase 1 can neither drop nor double the save.
  const fromLibrary = Boolean(currentEntry?.serverFileId);
  // WebP/AVIF output is only produced by the Phase 2 effects request; Phase 1
  // always writes a PNG. Without this, choosing a non-PNG format with a
  // transparent background and no effects fell through to the plain download
  // of the Phase 1 PNG, so the chosen format was silently ignored (#720).
  const wantsNonPngOutput = ((settings.outputFormat as string) ?? "png") !== "png";
  const needsEffectsRequest = Boolean(hasEffectsToApply) || fromLibrary || wantsNonPngOutput;

  // Build CSS preview state from current settings and send to tool-page
  useEffect(() => {
    if (!bgRemoved || !onBgPreview) return;

    const blurEnabled = settings.blurEnabled as boolean;
    const blurIntensity = (settings.blurIntensity as number) ?? 50;
    const shadowEnabled = settings.shadowEnabled as boolean;
    const shadowOpacity = (settings.shadowOpacity as number) ?? 35;

    if (!blurEnabled && !shadowEnabled && bgType === "transparent") {
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
    } else if (bgType === "color" && isValidBgColor) {
      preview.containerBackground = normalizeHexColor(bgColor);
    } else if (bgType === "gradient" && isValidGradColor) {
      const c1 = normalizeHexColor(gradColor1);
      const c2 = normalizeHexColor(gradColor2);
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
    bgType,
    bgColor,
    gradColor1,
    gradColor2,
    isValidBgColor,
    isValidGradColor,
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
    effectsRunIdRef.current += 1;
    expiredRerunInFlightRef.current = false;
    setApplyingEffects(false);
    setBgJobId(null);
    setBgFilename(null);
    setBgOriginalUrl(null);
    setEffectsError(null);

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
    // Phase 1 is always an intermediate here: the Phase 2 effects request owns
    // the library save (#565), so never auto-save the transparent result.
    // The sidecar options ride on this request: Phase 2 can't apply them.
    const phase1Settings: Record<string, unknown> = { model: settings.model };
    if (settings.edgeRefine != null) phase1Settings.edgeRefine = settings.edgeRefine;
    if (settings.decontaminate != null) phase1Settings.decontaminate = settings.decontaminate;
    runFileRef.current = files[0] ?? null;
    setRemovalRefine({
      file: files[0] ?? null,
      model: String(settings.model ?? "birefnet-portrait"),
      edgeRefine: Number(settings.edgeRefine ?? 0),
      decontaminate: Boolean(settings.decontaminate),
    });
    processFiles(files, phase1Settings, { skipLibrarySave: true });
  };

  // After processFiles completes, extract jobId from downloadUrl
  useEffect(() => {
    if (!downloadUrl || processing) return;
    // Anchored on the download route so a deployment base path is tolerated but
    // a batch result's blob: URL is not mistaken for a job.
    const parsed = parseMaskDownloadUrl(downloadUrl);
    if (!parsed) return;
    // The processor writes a finished job back by entry index, so a file
    // swapped in while it ran can show that job's URL. Only the file the
    // run started on owns it; after a remount there is no run on record and
    // the URL is the loaded entry's own.
    const loaded = useFileStore.getState().files[0] ?? null;
    const runFile = runFileRef.current;
    if (runFile && runFile !== loaded) return;
    setBgResultFile(loaded);
    setBgJobId(parsed.jobId);
    // A fresh removal settles any "expired, running again" note (#2119), while
    // a remount on the same cutout preserves its Phase 2 error (#2559).
    const keepEffectsError =
      removeBgSession.effectsError !== null &&
      removeBgSession.effectsError.file === loaded &&
      removeBgSession.effectsError.downloadUrl === downloadUrl;
    expiredRerunInFlightRef.current = false;
    if (!keepEffectsError) {
      setEffectsError(null);
    }
    setBgFilename(parsed.baseName);
    setBgOriginalUrl(parsed.originalUrl);
  }, [downloadUrl, processing, setEffectsError]);

  // A removal that failed or was cancelled leaves its own error on screen; the
  // "expired, running again" note would sit beside it saying otherwise (#2119).
  useEffect(() => {
    if (error) {
      expiredRerunInFlightRef.current = false;
      setEffectsError(null);
    }
  }, [error, setEffectsError]);

  // Undo or a file swap discards the Phase 1 cutout, so any Phase 2 error from
  // it has to clear too, while keeping the 410 expired notice up for the file
  // whose automatic re-run is still in flight (#2490).
  useEffect(() => {
    if (bgRemoved) return;
    setApplyingEffects(false);
    if (
      expiredRerunInFlightRef.current &&
      (processing || Boolean(downloadUrl)) &&
      files.length === 1 &&
      files[0] === runFileRef.current
    ) {
      return;
    }
    expiredRerunInFlightRef.current = false;
    setEffectsError(null);
  }, [bgRemoved, processing, downloadUrl, files, setEffectsError]);

  // Phase 2: Apply effects and download
  const handleDownloadWithEffects = async () => {
    if (!bgRemoved || !bgJobId || !bgFilename || !isInputValid) return;

    // Library file this run derives from (when opened from the file library):
    // the effects request is the FINAL step, so it carries the save choice.
    const { entries, selectedIndex, librarySaveMode } = useFileStore.getState();
    const capturedEntry = entries[selectedIndex];
    const capturedFile = capturedEntry?.file;
    const expectedProcessedUrl = capturedEntry?.processedUrl ?? undefined;
    const settingsAtStart = { ...removeBgSession.settings };
    const runId = ++effectsRunIdRef.current;

    const isStaleEffectsRun = () => {
      const store = useFileStore.getState();
      const liveEntry = store.entries[store.selectedIndex];
      return (
        effectsRunIdRef.current !== runId ||
        bgJobIdRef.current !== bgJobId ||
        !capturedEntry ||
        !capturedFile ||
        liveEntry?.id !== capturedEntry.id ||
        liveEntry?.file !== capturedFile ||
        (expectedProcessedUrl !== undefined && liveEntry.processedUrl !== expectedProcessedUrl) ||
        (store.entries.length === 1 && !bgRemovedRef.current)
      );
    };

    setApplyingEffects(true);
    setEffectsError(null);
    useFileStore.getState().setLastSavedLibraryFileId(null);
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
        outputFormat: settings.outputFormat,
      };
      formData.append("settings", JSON.stringify(effectSettings));

      const bgImageFile = settings._bgImageFile as File | undefined;
      if (bgImageFile) {
        formData.append("backgroundImage", bgImageFile);
      }

      if (capturedEntry?.serverFileId) {
        formData.append("fileId", capturedEntry.serverFileId);
        formData.append("saveMode", librarySaveMode);
      }

      const headers = formatHeaders();
      const response = await fetch(appUrl("/api/v1/tools/image/remove-background/effects"), {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // The server no longer holds the earlier removal's mask or original
        // (#2119). Remove the background again so effects have something to
        // read; the note holds until that run's result arrives.
        if (body?.code === "BACKGROUND_REMOVAL_EXPIRED") {
          // The user may have swapped the file or undone the cutout while this
          // request ran; the removal below would then upload the old one into
          // the new entry or restart an undone run (#2490).
          if (isStaleEffectsRun() || !bgRemovedRef.current) return;
          handleRemoveBg();
          expiredRerunInFlightRef.current = true;
          setEffectsError(t.toolSettings["remove-background"].effectsExpired, {
            persist: false,
          });
          return;
        }
        throw new Error(
          failedAnswerMessage(t, body, response.status, `Effects failed: ${response.status}`),
        );
      }

      const result = resolveServerUrls(await response.json());
      // The user may have swapped the file or undone the cutout while this
      // request ran; skip updating the library id, claiming, and downloading
      // for a file that is no longer the active entry (#2243).
      if (isStaleEffectsRun()) return;
      if (typeof result?.downloadUrl !== "string" || !result.downloadUrl) {
        throw new Error(t.errors.invalidResponse);
      }
      setEffectsError(null);

      // Surface the "saved to your files" indicator and, on overwrite,
      // re-anchor so a subsequent run derives from the saved version (#565).
      const store = useFileStore.getState();
      if (result.savedFileId) {
        store.setLastSavedLibraryFileId(result.savedFileId as string);
        if (librarySaveMode === "overwrite") {
          store.updateEntryById(capturedEntry.id, { serverFileId: result.savedFileId as string });
        }
      }

      // Auto-trigger download
      const a = document.createElement("a");
      a.href = result.downloadUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (sameSettings(removeBgSession.settings, settingsAtStart)) {
        useFileStore.getState().markClaimedById(capturedEntry.id, expectedProcessedUrl);
      }
    } catch (err) {
      if (!isStaleEffectsRun() && bgRemovedRef.current) {
        setEffectsError(
          err instanceof Error
            ? err.message
            : t.toolSettings["remove-background"].effectsProcessingFailed,
        );
      }
    } finally {
      if (effectsRunIdRef.current === runId) {
        setApplyingEffects(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <RemoveBgControls
        settings={settings}
        onChange={setSettings}
        allowImageBackground={files.length <= 1}
        initialControls={initialControls}
        onControlsChange={setControls}
      />

      {/* Errors */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}
      {effectsError && <p className="text-xs text-destructive-ink">{effectsError}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && !processing && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["remove-bg"].originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["remove-bg"].processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      {/* Phase 1: Remove Background button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["remove-background"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : !bgRemoved ? (
        <button
          type="button"
          data-testid="remove-background-submit"
          onClick={handleRemoveBg}
          disabled={!hasFile || processing || !isInputValid}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings["remove-background"].submitBatch, { count: files.length })
            : t.toolSettings["remove-background"].submit}
        </button>
      ) : null}

      {/* Phase 2: Single smart download button. Routes through the effects
          request (which saves) when effects apply or the file came from the
          library; otherwise a plain instant download with no save needed. */}
      {bgRemoved && files.length <= 1 && (
        <div className="space-y-2">
          {refineChanged && (
            <div className="space-y-1.5 rounded-lg bg-muted px-3 py-2">
              <p
                data-testid="remove-background-refine-stale"
                className="text-xs text-muted-foreground"
              >
                {t.toolSettings["remove-background"].refineChanged}
              </p>
              <button
                type="button"
                data-testid="remove-background-rerun"
                onClick={handleRemoveBg}
                // Mid-request it would drop the result the effects request is
                // still rendering from.
                disabled={applyingEffects || !isInputValid}
                className="w-full py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.toolSettings["remove-background"].submit}
              </button>
            </div>
          )}
          {needsEffectsRequest ? (
            <button
              type="button"
              data-testid="remove-background-download-effects"
              onClick={handleDownloadWithEffects}
              disabled={applyingEffects || !isInputValid}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {applyingEffects ? t.toolSettings["remove-background"].rendering : t.common.download}
            </button>
          ) : (
            <ResultDownloadLink
              href={downloadUrl || ""}
              testId="remove-background-download"
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
            />
          )}
        </div>
      )}
    </div>
  );
}
