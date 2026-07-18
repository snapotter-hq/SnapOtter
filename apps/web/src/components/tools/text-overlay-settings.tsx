import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export interface TextOverlayControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function TextOverlayControls({
  settings: initialSettings,
  onChange,
}: TextOverlayControlsProps) {
  const { t } = useTranslation();
  const ts = t.toolSettings["text-overlay"];
  const [text, setText] = useState(ts.defaultText);
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#FFFFFF");
  const [position, setPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [backgroundBox, setBackgroundBox] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#000000");
  const [shadow, setShadow] = useState(true);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.text != null) setText(String(initialSettings.text));
    if (initialSettings.fontSize != null) setFontSize(Number(initialSettings.fontSize));
    if (initialSettings.color != null) setColor(String(initialSettings.color));
    if (initialSettings.position != null)
      setPosition(initialSettings.position as "top" | "center" | "bottom");
    if (initialSettings.backgroundBox != null)
      setBackgroundBox(Boolean(initialSettings.backgroundBox));
    if (initialSettings.backgroundColor != null)
      setBackgroundColor(String(initialSettings.backgroundColor));
    if (initialSettings.shadow != null) setShadow(Boolean(initialSettings.shadow));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({
      text,
      fontSize,
      color,
      position,
      backgroundBox,
      backgroundColor,
      shadow,
    });
  }, [text, fontSize, color, position, backgroundBox, backgroundColor, shadow]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="text-overlay-text" className="text-xs text-muted-foreground">
          {ts.text}
        </label>
        <input
          id="text-overlay-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="text-overlay-font-size" className="text-xs text-muted-foreground">
            {ts.fontSize}
          </label>
          <span className="text-xs font-mono text-foreground">{fontSize}px</span>
        </div>
        <input
          id="text-overlay-font-size"
          type="range"
          min={8}
          max={200}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="text-overlay-color" className="text-xs text-muted-foreground">
          {ts.color}
        </label>
        <input
          id="text-overlay-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border"
        />
      </div>

      <div>
        <label htmlFor="text-overlay-position" className="text-xs text-muted-foreground">
          {ts.position}
        </label>
        <select
          id="text-overlay-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as "top" | "center" | "bottom")}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="top">{ts.top}</option>
          <option value="center">{ts.center}</option>
          <option value="bottom">{ts.bottom}</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={shadow}
          onChange={(e) => setShadow(e.target.checked)}
          className="rounded"
        />
        {ts.shadow}
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={backgroundBox}
          onChange={(e) => setBackgroundBox(e.target.checked)}
          className="rounded"
        />
        {ts.backgroundBox}
      </label>

      {backgroundBox && (
        <div>
          <label htmlFor="text-overlay-box-color" className="text-xs text-muted-foreground">
            {ts.backgroundColor}
          </label>
          <input
            id="text-overlay-box-color"
            type="color"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
      )}
    </div>
  );
}

export function TextOverlaySettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["text-overlay"];
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
  } = useToolProcessor("text-overlay");

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
      <TextOverlayControls onChange={setSettings} />

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
          label={ts.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="text-overlay-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !settings.text}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? format(ts.submitBatch, { count: files.length }) : ts.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="text-overlay-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {ts.download}
        </a>
      )}
    </div>
  );
}
