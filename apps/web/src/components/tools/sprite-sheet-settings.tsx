import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function SpriteSheetSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("sprite-sheet");

  const [columns, setColumns] = useState(4);
  const [padding, setPadding] = useState(0);
  const [background, setBackground] = useState("#ffffff");

  const handleProcess = () => {
    const settings = { columns, padding, background };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Columns */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="sprite-columns" className="text-xs text-muted-foreground">
            {t.toolSettings["sprite-sheet"].columns}
          </label>
          <span className="text-xs font-mono text-foreground">{columns}</span>
        </div>
        <input
          id="sprite-columns"
          type="range"
          min={1}
          max={16}
          value={columns}
          onChange={(e) => setColumns(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Padding */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="sprite-padding" className="text-xs text-muted-foreground">
            {t.toolSettings["sprite-sheet"].padding}
          </label>
          <span className="text-xs font-mono text-foreground">{padding}px</span>
        </div>
        <input
          id="sprite-padding"
          type="range"
          min={0}
          max={64}
          value={padding}
          onChange={(e) => setPadding(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Background Color */}
      <div>
        <label htmlFor="sprite-background" className="text-xs text-muted-foreground">
          {t.toolSettings["sprite-sheet"].background}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="sprite-background"
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["sprite-sheet"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="sprite-sheet-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {t.toolSettings["sprite-sheet"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="sprite-sheet-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
