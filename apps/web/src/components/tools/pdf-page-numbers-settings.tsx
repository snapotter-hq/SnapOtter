import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Position = "bl" | "bc" | "br" | "tl" | "tc" | "tr";

export function PdfPageNumbersSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["pdf-page-numbers"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("pdf-page-numbers");

  const [position, setPosition] = useState<Position>("bc");
  const [fontSize, setFontSize] = useState(10);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { position, fontSize };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="pn-position" className="text-xs text-muted-foreground">
          {s.position}
        </label>
        <select
          id="pn-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="bl">Bottom Left</option>
          <option value="bc">Bottom Center</option>
          <option value="br">Bottom Right</option>
          <option value="tl">Top Left</option>
          <option value="tc">Top Center</option>
          <option value="tr">Top Right</option>
        </select>
      </div>

      <div>
        <label htmlFor="pn-font-size" className="text-xs text-muted-foreground">
          {s.fontSize}
        </label>
        <input
          id="pn-font-size"
          type="number"
          min={6}
          max={24}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

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
          data-testid="pdf-page-numbers-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
