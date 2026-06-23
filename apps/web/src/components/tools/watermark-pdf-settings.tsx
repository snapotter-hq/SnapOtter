import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Position = "tl" | "tc" | "tr" | "l" | "c" | "r" | "bl" | "bc" | "br";

export function WatermarkPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["watermark-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("watermark-pdf");

  const [text, setText] = useState("");
  const [position, setPosition] = useState<Position>("c");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { text, position, fontSize, opacity, rotation };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="wm-text" className="text-xs text-muted-foreground">
          {s.text}
        </label>
        <input
          id="wm-text"
          type="text"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wm-position" className="text-xs text-muted-foreground">
          {s.position}
        </label>
        <select
          id="wm-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="tl">Top Left</option>
          <option value="tc">Top Center</option>
          <option value="tr">Top Right</option>
          <option value="l">Left</option>
          <option value="c">Center</option>
          <option value="r">Right</option>
          <option value="bl">Bottom Left</option>
          <option value="bc">Bottom Center</option>
          <option value="br">Bottom Right</option>
        </select>
      </div>

      <div>
        <label htmlFor="wm-font-size" className="text-xs text-muted-foreground">
          {s.fontSize}
        </label>
        <input
          id="wm-font-size"
          type="number"
          min={6}
          max={72}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wm-opacity" className="text-xs text-muted-foreground">
          {s.opacity}
        </label>
        <input
          id="wm-opacity"
          type="number"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wm-rotation" className="text-xs text-muted-foreground">
          {s.rotation}
        </label>
        <input
          id="wm-rotation"
          type="number"
          min={-180}
          max={180}
          step={1}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

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
          data-testid="watermark-pdf-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !text}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface WatermarkPdfControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function WatermarkPdfControls({ settings: initial, onChange }: WatermarkPdfControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["watermark-pdf"];
  const [text, setText] = useState("");
  const [position, setPosition] = useState<Position>("c");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.text != null) setText(String(initial.text));
    if (initial.position != null) setPosition(initial.position as Position);
    if (initial.fontSize != null) setFontSize(Number(initial.fontSize));
    if (initial.opacity != null) setOpacity(Number(initial.opacity));
    if (initial.rotation != null) setRotation(Number(initial.rotation));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ text, position, fontSize, opacity, rotation });
  }, [text, position, fontSize, opacity, rotation]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="wmc-text" className="text-xs text-muted-foreground">
          {s.text}
        </label>
        <input
          id="wmc-text"
          type="text"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="wmc-position" className="text-xs text-muted-foreground">
          {s.position}
        </label>
        <select
          id="wmc-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="tl">Top Left</option>
          <option value="tc">Top Center</option>
          <option value="tr">Top Right</option>
          <option value="l">Left</option>
          <option value="c">Center</option>
          <option value="r">Right</option>
          <option value="bl">Bottom Left</option>
          <option value="bc">Bottom Center</option>
          <option value="br">Bottom Right</option>
        </select>
      </div>
      <div>
        <label htmlFor="wmc-font-size" className="text-xs text-muted-foreground">
          {s.fontSize}
        </label>
        <input
          id="wmc-font-size"
          type="number"
          min={6}
          max={72}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="wmc-opacity" className="text-xs text-muted-foreground">
          {s.opacity}
        </label>
        <input
          id="wmc-opacity"
          type="number"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="wmc-rotation" className="text-xs text-muted-foreground">
          {s.rotation}
        </label>
        <input
          id="wmc-rotation"
          type="number"
          min={-180}
          max={180}
          step={1}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
