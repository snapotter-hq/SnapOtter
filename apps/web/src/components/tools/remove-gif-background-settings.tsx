import { Download, ImageIcon, Upload } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Quality = "fast" | "balanced" | "best";
type OutputFormat = "webp" | "apng" | "gif";
type BackgroundType = "transparent" | "color" | "gradient" | "blur" | "image";

// Animation multiplies per-frame cost, so default to the fast model.
const QUALITY_MODEL: Record<Quality, string> = {
  fast: "u2net",
  balanced: "birefnet-general-lite",
  best: "birefnet-general",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</p>;
}

function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RemoveGifBackgroundSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["remove-gif-background"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("remove-gif-background");

  const [quality, setQuality] = useState<Quality>("fast");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webp");
  const [backgroundType, setBackgroundType] = useState<BackgroundType>("transparent");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [gradientColor1, setGradientColor1] = useState("#4f46e5");
  const [gradientColor2, setGradientColor2] = useState("#ec4899");
  const [gradientAngle, setGradientAngle] = useState(90);
  const [blurIntensity, setBlurIntensity] = useState(30);
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowOpacity, setShadowOpacity] = useState(50);
  const [edgeRefine, setEdgeRefine] = useState(0);
  const [decontaminate, setDecontaminate] = useState(false);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const hasFile = files.length > 0;
  const needsBgImage = backgroundType === "image" && !bgFile;

  const handleProcess = () => {
    const settings: Record<string, unknown> = {
      model: QUALITY_MODEL[quality],
      outputFormat,
      backgroundType,
      edgeRefine,
      decontaminate,
    };
    if (backgroundType === "color") settings.backgroundColor = backgroundColor;
    if (backgroundType === "gradient") {
      settings.gradientColor1 = gradientColor1;
      settings.gradientColor2 = gradientColor2;
      settings.gradientAngle = gradientAngle;
    }
    if (backgroundType === "blur") settings.blurIntensity = blurIntensity;
    if (backgroundType === "image" && bgFile) settings._bgImageFile = bgFile;
    if (shadowEnabled) {
      settings.shadowEnabled = true;
      settings.shadowOpacity = shadowOpacity;
    }
    if (files.length > 1) processAllFiles(files, settings);
    else processFiles(files, settings);
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>{s.quality}</SectionLabel>
        <OptionRow<Quality>
          value={quality}
          onChange={setQuality}
          options={[
            { value: "fast", label: s.qualityFast },
            { value: "balanced", label: s.qualityBalanced },
            { value: "best", label: s.qualityBest },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{s.qualityNote}</p>
      </div>

      <div>
        <SectionLabel>{s.outputFormat}</SectionLabel>
        <OptionRow<OutputFormat>
          value={outputFormat}
          onChange={setOutputFormat}
          options={[
            { value: "webp", label: s.formatWebp },
            { value: "apng", label: s.formatApng },
            { value: "gif", label: s.formatGif },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {outputFormat === "gif" ? s.gifCaveat : s.formatWebpHint}
        </p>
      </div>

      <div>
        <SectionLabel>{s.background}</SectionLabel>
        <OptionRow<BackgroundType>
          value={backgroundType}
          onChange={setBackgroundType}
          options={[
            { value: "transparent", label: s.bgTransparent },
            { value: "color", label: s.bgColor },
            { value: "gradient", label: s.bgGradient },
            { value: "blur", label: s.bgBlur },
            { value: "image", label: s.bgImage },
          ]}
        />

        {backgroundType === "color" && (
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
            />
            <span className="text-muted-foreground">{backgroundColor}</span>
          </label>
        )}

        {backgroundType === "gradient" && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={gradientColor1}
                  onChange={(e) => setGradientColor1(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                />
                {s.gradientStart}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={gradientColor2}
                  onChange={(e) => setGradientColor2(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                />
                {s.gradientEnd}
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              {format(s.gradientAngle, { deg: gradientAngle })}
              <input
                type="range"
                min={0}
                max={360}
                value={gradientAngle}
                onChange={(e) => setGradientAngle(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
          </div>
        )}

        {backgroundType === "blur" && (
          <label className="mt-2 block text-xs text-muted-foreground">
            {format(s.blurStrength, { value: blurIntensity })}
            <input
              type="range"
              min={0}
              max={100}
              value={blurIntensity}
              onChange={(e) => setBlurIntensity(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        )}

        {backgroundType === "image" && (
          <div className="mt-2">
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setBgFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              {bgFile ? <ImageIcon className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {bgFile ? bgFile.name : s.uploadBg}
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={shadowEnabled}
            onChange={(e) => setShadowEnabled(e.target.checked)}
          />
          {s.shadow}
        </label>
        {shadowEnabled && (
          <label className="mt-1.5 block text-xs text-muted-foreground">
            {format(s.shadowStrength, { value: shadowOpacity })}
            <input
              type="range"
              min={0}
              max={100}
              value={shadowOpacity}
              onChange={(e) => setShadowOpacity(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <SectionLabel>{s.advanced}</SectionLabel>
        <label className="block text-xs text-muted-foreground">
          {edgeRefine === 0 ? s.edgeRefineOff : format(s.edgeRefine, { level: edgeRefine })}
          <input
            type="range"
            min={0}
            max={3}
            value={edgeRefine}
            onChange={(e) => setEdgeRefine(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={decontaminate}
            onChange={(e) => setDecontaminate(e.target.checked)}
          />
          {s.decontaminate}
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{s.frameNote}</p>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="remove-gif-background-submit"
          onClick={handleProcess}
          disabled={!hasFile || needsBgImage}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {files.length > 1 ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}

      {downloadUrl && !processing && files.length <= 1 && (
        <a
          href={downloadUrl}
          download
          data-testid="remove-gif-background-download"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          {s.download}
        </a>
      )}
    </div>
  );
}
