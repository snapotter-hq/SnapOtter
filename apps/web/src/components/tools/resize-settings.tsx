import { SOCIAL_MEDIA_PRESETS } from "@snapotter/shared";
import { Download, Info, Link, Unlink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type ResizeTab = "presets" | "custom" | "scale";
type FitMode = "cover" | "contain" | "fill";

const FIT_LABELS: Record<FitMode, string> = {
  cover: "Crop to fit",
  contain: "Fit inside",
  fill: "Stretch",
};

// Group presets by platform
const platforms = [...new Set(SOCIAL_MEDIA_PRESETS.map((p) => p.platform))];

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

export interface ResizeControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ResizeControls({ settings: initialSettings, onChange }: ResizeControlsProps) {
  const [tab, setTab] = useState<ResizeTab>("custom");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [percentage, setPercentage] = useState<string>("50");
  const [fit, setFit] = useState<FitMode>("cover");
  const [lockAspect, setLockAspect] = useState(true);
  const [withoutEnlargement, setWithoutEnlargement] = useState(false);
  const [contentAware, setContentAware] = useState(false);
  const [protectFaces, setProtectFaces] = useState(false);
  const [blurRadius, setBlurRadius] = useState(4);
  const [sobelThreshold, setSobelThreshold] = useState(2);
  const [squareMode, setSquareMode] = useState(false);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.width != null) setWidth(String(initialSettings.width));
    if (initialSettings.height != null) setHeight(String(initialSettings.height));
    if (initialSettings.percentage != null) setPercentage(String(initialSettings.percentage));
    if (initialSettings.fit != null) setFit(initialSettings.fit as FitMode);
    if (initialSettings.withoutEnlargement != null)
      setWithoutEnlargement(Boolean(initialSettings.withoutEnlargement));
    if (initialSettings.contentAware != null)
      setContentAware(Boolean(initialSettings.contentAware));
    if (initialSettings.protectFaces != null)
      setProtectFaces(Boolean(initialSettings.protectFaces));
    if (initialSettings.blurRadius != null) setBlurRadius(Number(initialSettings.blurRadius));
    if (initialSettings.sobelThreshold != null)
      setSobelThreshold(Number(initialSettings.sobelThreshold));
    if (initialSettings.square != null) setSquareMode(Boolean(initialSettings.square));
    // Infer tab from settings
    if (initialSettings.percentage != null) setTab("scale");
    else if (initialSettings.contentAware) setTab("custom");
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const settings: Record<string, unknown> = {};
    if (contentAware) {
      settings.contentAware = true;
      if (!squareMode) {
        if (width) settings.width = Number(width);
        if (height) settings.height = Number(height);
      }
      settings.protectFaces = protectFaces;
      settings.blurRadius = blurRadius;
      settings.sobelThreshold = sobelThreshold;
      settings.square = squareMode;
    } else if (tab === "scale") {
      settings.percentage = Number(percentage);
    } else {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
      settings.fit = tab === "presets" ? "cover" : fit;
      settings.withoutEnlargement = withoutEnlargement;
    }
    onChangeRef.current?.(settings);
  }, [
    tab,
    width,
    height,
    percentage,
    fit,
    withoutEnlargement,
    contentAware,
    protectFaces,
    blurRadius,
    sobelThreshold,
    squareMode,
  ]);

  const handlePreset = (preset: (typeof SOCIAL_MEDIA_PRESETS)[number]) => {
    const key = `${preset.platform}-${preset.name}`;
    if (selectedPreset === key) {
      setSelectedPreset(null);
      setWidth("");
      setHeight("");
    } else {
      setSelectedPreset(key);
      setWidth(String(preset.width));
      setHeight(String(preset.height));
    }
  };

  const tabClass = (t: ResizeTab) =>
    `flex-1 text-xs py-1.5 rounded ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  const dimensionInputs = (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="resize-width" className="text-xs text-muted-foreground">
          Width (px)
        </label>
        <input
          id="resize-width"
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          placeholder="Auto"
          disabled={squareMode && contentAware}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
        />
      </div>
      <button
        type="button"
        onClick={() => setLockAspect(!lockAspect)}
        className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
        title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
      >
        {lockAspect ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
      </button>
      <div className="flex-1">
        <label htmlFor="resize-height" className="text-xs text-muted-foreground">
          Height (px)
        </label>
        <input
          id="resize-height"
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Auto"
          disabled={squareMode && contentAware}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
        />
      </div>
    </div>
  );

  const enlargementCheckbox = (
    <label className="flex items-center gap-1.5 text-xs text-foreground">
      <input
        type="checkbox"
        checked={withoutEnlargement}
        onChange={(e) => setWithoutEnlargement(e.target.checked)}
        className="rounded"
      />
      <span>Limit to original size</span>
      <HintIcon text="If your image is already smaller than the target, keep it as-is instead of scaling it up" />
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Standard resize tabs */}
      {!contentAware && (
        <>
          {/* Tab selector */}
          <div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setTab("custom")} className={tabClass("custom")}>
                Custom Size
              </button>
              <button type="button" onClick={() => setTab("scale")} className={tabClass("scale")}>
                Scale
              </button>
              <button
                type="button"
                onClick={() => setTab("presets")}
                className={tabClass("presets")}
              >
                Presets
              </button>
            </div>
          </div>

          {/* Presets tab */}
          {tab === "presets" && (
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
                          onClick={() => handlePreset(preset)}
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

              {enlargementCheckbox}
            </div>
          )}

          {/* Custom Size tab */}
          {tab === "custom" && (
            <div className="space-y-3">
              {dimensionInputs}

              {/* Fit mode */}
              <div>
                <p className="text-xs text-muted-foreground">Fit Mode</p>
                <div className="flex gap-1 mt-1">
                  {(Object.keys(FIT_LABELS) as FitMode[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFit(f)}
                      className={`flex-1 text-xs py-1.5 rounded ${fit === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {FIT_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>

              {enlargementCheckbox}
            </div>
          )}

          {/* Scale tab */}
          {tab === "scale" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="resize-scale" className="text-xs text-muted-foreground">
                  Scale (%)
                </label>
                <input
                  id="resize-scale"
                  type="number"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  min={1}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
              <div className="flex gap-1">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentage(String(pct))}
                    className={`flex-1 text-xs py-1.5 rounded ${
                      percentage === String(pct)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Content-aware section - positioned below standard resize */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Content-aware</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={contentAware}
            onClick={() => setContentAware(!contentAware)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              contentAware ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                contentAware ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Content-aware options (expanded when toggled) */}
        {contentAware && (
          <div className="mt-3 space-y-3">
            {/* Dimensions */}
            {dimensionInputs}

            {/* Square mode */}
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={squareMode}
                onChange={(e) => setSquareMode(e.target.checked)}
                className="rounded"
              />
              Resize to square
            </label>

            {/* Face protection */}
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={protectFaces}
                onChange={(e) => setProtectFaces(e.target.checked)}
                className="rounded"
              />
              Protect faces
            </label>

            {/* Blur radius */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="blur-radius" className="text-xs text-muted-foreground">
                  Smoothing
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{blurRadius}</span>
              </div>
              <input
                id="blur-radius"
                type="range"
                min={0}
                max={20}
                value={blurRadius}
                onChange={(e) => setBlurRadius(Number(e.target.value))}
                className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
              />
            </div>

            {/* Sobel threshold */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="sobel-threshold" className="text-xs text-muted-foreground">
                  Edge sensitivity
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{sobelThreshold}</span>
              </div>
              <input
                id="sobel-threshold"
                type="range"
                min={1}
                max={20}
                value={sobelThreshold}
                onChange={(e) => setSobelThreshold(Number(e.target.value))}
                className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResizeSettings() {
  const { files } = useFileStore();
  const standardResize = useToolProcessor("resize");
  const contentAwareResize = useToolProcessor("content-aware-resize");

  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [isContentAware, setIsContentAware] = useState(false);

  const handleSettingsChange = useCallback((newSettings: Record<string, unknown>) => {
    setSettings(newSettings);
    setIsContentAware(!!newSettings.contentAware);
  }, []);

  const active = isContentAware ? contentAwareResize : standardResize;
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } = active;

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const tab = settings.percentage !== undefined ? "scale" : "other";
  const canProcess =
    hasFile &&
    !processing &&
    (isContentAware
      ? Boolean(settings.width) || Boolean(settings.height) || Boolean(settings.square)
      : tab === "scale"
        ? Number(settings.percentage) > 0
        : Boolean(settings.width) || Boolean(settings.height));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ResizeControls onChange={handleSettingsChange} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Resizing"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="resize-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Resize (${files.length} files)` : "Resize"}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="resize-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
