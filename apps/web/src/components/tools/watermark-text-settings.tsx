import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "tiled";

export interface WatermarkTextControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function WatermarkTextControls({
  settings: initialSettings,
  onChange,
}: WatermarkTextControlsProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("Sample Watermark");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState(50);
  const [position, setPosition] = useState<Position>("center");
  const [rotation, setRotation] = useState(0);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.text != null) setText(String(initialSettings.text));
    if (initialSettings.fontSize != null) setFontSize(Number(initialSettings.fontSize));
    if (initialSettings.color != null) setColor(String(initialSettings.color));
    if (initialSettings.opacity != null) setOpacity(Number(initialSettings.opacity));
    if (initialSettings.position != null) setPosition(initialSettings.position as Position);
    if (initialSettings.rotation != null) setRotation(Number(initialSettings.rotation));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({ text, fontSize, color, opacity, position, rotation });
  }, [text, fontSize, color, opacity, position, rotation]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="watermark-text-text" className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-text"].watermarkText}
        </label>
        <input
          id="watermark-text-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-text-font-size" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-text"].fontSize}
          </label>
          <span className="text-xs font-mono text-foreground">{fontSize}px</span>
        </div>
        <input
          id="watermark-text-font-size"
          type="range"
          min={8}
          max={200}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="watermark-text-color" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-text"].color}
          </label>
          <input
            id="watermark-text-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <label htmlFor="watermark-text-opacity" className="text-xs text-muted-foreground">
              {t.toolSettings["watermark-text"].opacity}
            </label>
            <span className="text-xs font-mono text-foreground">{opacity}%</span>
          </div>
          <input
            id="watermark-text-opacity"
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      </div>

      <div>
        <label htmlFor="watermark-text-position" className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-text"].position}
        </label>
        <select
          id="watermark-text-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="center">{t.toolSettings["watermark-text"].center}</option>
          <option value="top-left">{t.toolSettings["watermark-text"].topLeft}</option>
          <option value="top-right">{t.toolSettings["watermark-text"].topRight}</option>
          <option value="bottom-left">{t.toolSettings["watermark-text"].bottomLeft}</option>
          <option value="bottom-right">{t.toolSettings["watermark-text"].bottomRight}</option>
          <option value="tiled">{t.toolSettings["watermark-text"].tiledRepeating}</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-text-rotation" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-text"].rotation}
          </label>
          <span className="text-xs font-mono text-foreground">{rotation}&deg;</span>
        </div>
        <input
          id="watermark-text-rotation"
          type="range"
          min={-180}
          max={180}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>
    </div>
  );
}

export function WatermarkTextSettings() {
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
  } = useToolProcessor("watermark-text");

  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <WatermarkTextControls onChange={setSettings} />

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["watermark-text"].originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["watermark-text"].processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["watermark-text"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="watermark-text-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !settings.text}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings["watermark-text"].applyWatermarkBatch, {
                count: files.length,
              })
            : t.toolSettings["watermark-text"].applyWatermark}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="watermark-text-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </div>
  );
}
