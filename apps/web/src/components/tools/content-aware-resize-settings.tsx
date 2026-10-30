import { MAX_CONTENT_AWARE_RESIZE_PIXELS, MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { HintIcon } from "@/components/common/hint-icon";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { isContentAwareAreaWithinLimit, isDimensionWithinLimit } from "@/lib/dimension-limits";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export interface ContentAwareResizeControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ContentAwareResizeControls({
  settings: initialSettings,
  onChange,
}: ContentAwareResizeControlsProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
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
    if (initialSettings.protectFaces != null)
      setProtectFaces(Boolean(initialSettings.protectFaces));
    if (initialSettings.blurRadius != null) setBlurRadius(Number(initialSettings.blurRadius));
    if (initialSettings.sobelThreshold != null)
      setSobelThreshold(Number(initialSettings.sobelThreshold));
    if (initialSettings.square != null) setSquareMode(Boolean(initialSettings.square));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const dimensionsActive = !squareMode;
  const widthValue = width === "" ? undefined : Number(width);
  const heightValue = height === "" ? undefined : Number(height);
  const widthOverLimit =
    dimensionsActive && widthValue !== undefined && !isDimensionWithinLimit(widthValue);
  const heightOverLimit =
    dimensionsActive && heightValue !== undefined && !isDimensionWithinLimit(heightValue);
  // Seam carving caps the product at 25 MP, far below the plain resize budget.
  const areaOverLimit =
    dimensionsActive &&
    widthValue !== undefined &&
    heightValue !== undefined &&
    isDimensionWithinLimit(widthValue) &&
    isDimensionWithinLimit(heightValue) &&
    !isContentAwareAreaWithinLimit(widthValue, heightValue);
  const dimensionsOverLimit = widthOverLimit || heightOverLimit || areaOverLimit;
  const dimensionError = dimensionsOverLimit ? (
    <p id="car-dimension-error" className="mt-1 text-xs text-destructive-ink">
      {widthOverLimit || heightOverLimit
        ? format(t.toolSettings["content-aware-resize"].maxDimensionExceeded, {
            max: MAX_RESIZE_OUTPUT_DIMENSION,
          })
        : format(t.toolSettings["content-aware-resize"].areaExceeded, {
            max: MAX_CONTENT_AWARE_RESIZE_PIXELS,
          })}
    </p>
  ) : null;

  useEffect(() => {
    const settings: Record<string, unknown> = {};
    if (!squareMode) {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
    }
    settings.protectFaces = protectFaces;
    settings.blurRadius = blurRadius;
    settings.sobelThreshold = sobelThreshold;
    settings.square = squareMode;
    onChangeRef.current?.(settings);
  }, [width, height, protectFaces, blurRadius, sobelThreshold, squareMode]);

  return (
    <div className="space-y-4">
      {/* Dimensions */}
      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="car-width" className="text-xs text-muted-foreground">
              {t.toolSettings["content-aware-resize"].widthPx}
            </label>
            <input
              id="car-width"
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder={t.toolSettings["content-aware-resize"].auto}
              disabled={squareMode}
              min={1}
              max={MAX_RESIZE_OUTPUT_DIMENSION}
              aria-invalid={widthOverLimit || undefined}
              aria-describedby={dimensionsOverLimit ? "car-dimension-error" : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="car-height" className="text-xs text-muted-foreground">
              {t.toolSettings["content-aware-resize"].heightPx}
            </label>
            <input
              id="car-height"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder={t.toolSettings["content-aware-resize"].auto}
              disabled={squareMode}
              min={1}
              max={MAX_RESIZE_OUTPUT_DIMENSION}
              aria-invalid={heightOverLimit || undefined}
              aria-describedby={dimensionsOverLimit ? "car-dimension-error" : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
            />
          </div>
        </div>
        {dimensionError}
      </div>

      {/* Square mode */}
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={squareMode}
          onChange={(e) => setSquareMode(e.target.checked)}
          className="rounded"
        />
        {t.toolSettings["content-aware-resize"].resizeToSquare}
      </label>

      {/* Face protection. HintIcon is a button, so it sits beside the label,
          not inside it (labels must not contain other interactive elements). */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={protectFaces}
            onChange={(e) => setProtectFaces(e.target.checked)}
            className="rounded"
          />
          <span>{t.toolSettings["content-aware-resize"].protectFaces}</span>
        </label>
        <HintIcon text={t.toolSettings["content-aware-resize"].protectFacesHint} />
      </div>

      {/* Blur radius */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="car-blur-radius" className="text-xs text-muted-foreground">
            {t.toolSettings["content-aware-resize"].smoothing}
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">{blurRadius}</span>
        </div>
        <input
          id="car-blur-radius"
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
          <label htmlFor="car-sobel-threshold" className="text-xs text-muted-foreground">
            {t.toolSettings["content-aware-resize"].edgeSensitivity}
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">{sobelThreshold}</span>
        </div>
        <input
          id="car-sobel-threshold"
          type="range"
          min={1}
          max={20}
          value={sobelThreshold}
          onChange={(e) => setSobelThreshold(Number(e.target.value))}
          className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
      </div>
    </div>
  );
}

export function ContentAwareResizeSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("content-aware-resize");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleSettingsChange = useCallback((newSettings: Record<string, unknown>) => {
    setSettings(newSettings);
  }, []);

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const dimensionInvalid = [settings.width, settings.height].some(
    (value) => typeof value === "number" && !isDimensionWithinLimit(value),
  );
  const areaInvalid =
    typeof settings.width === "number" &&
    typeof settings.height === "number" &&
    isDimensionWithinLimit(settings.width) &&
    isDimensionWithinLimit(settings.height) &&
    !isContentAwareAreaWithinLimit(settings.width, settings.height);
  const canProcess =
    hasFile &&
    !processing &&
    !dimensionInvalid &&
    !areaInvalid &&
    (Boolean(settings.width) || Boolean(settings.height) || Boolean(settings.square));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ContentAwareResizeControls onChange={handleSettingsChange} />

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["content-aware-resize"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="content-aware-resize-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings["content-aware-resize"].submitBatch, { count: files.length })
            : t.toolSettings["content-aware-resize"].submit}
        </button>
      )}

      {downloadUrl && (
        <ResultDownloadLink href={downloadUrl} testId="content-aware-resize-download" />
      )}
    </form>
  );
}
