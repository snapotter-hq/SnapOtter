import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Position = "tl" | "tc" | "tr" | "l" | "c" | "r" | "bl" | "bc" | "br";

export function WatermarkVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["watermark-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("watermark-video");

  const [text, setText] = useState("");
  const [position, setPosition] = useState<Position>("br");
  const [fontSize, setFontSize] = useState(36);
  const [opacity, setOpacity] = useState(0.5);
  const [color, setColor] = useState("#ffffff");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { text, position, fontSize, opacity, color };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="wmv-text" className="text-xs text-muted-foreground">
          {s.text}
        </label>
        <input
          id="wmv-text"
          type="text"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wmv-position" className="text-xs text-muted-foreground">
          {s.position}
        </label>
        <select
          id="wmv-position"
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
        <label htmlFor="wmv-font-size" className="text-xs text-muted-foreground">
          {s.fontSize}
        </label>
        <input
          id="wmv-font-size"
          type="number"
          min={8}
          max={120}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wmv-opacity" className="text-xs text-muted-foreground">
          {s.opacity}
        </label>
        <input
          id="wmv-opacity"
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
        <label htmlFor="wmv-color" className="text-xs text-muted-foreground">
          {s.color}
        </label>
        <input
          id="wmv-color"
          type="text"
          maxLength={7}
          placeholder="#RRGGBB"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s.colorHint}</p>
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
          data-testid="watermark-video-submit"
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
