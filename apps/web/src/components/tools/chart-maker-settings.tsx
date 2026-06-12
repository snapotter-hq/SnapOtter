import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const CHART_KINDS = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
] as const;

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

export function ChartMakerSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("chart-maker");

  const [kind, setKind] = useState("bar");
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState(960);
  const [height, setHeight] = useState(540);

  const handleProcess = () => {
    const settings: Record<string, unknown> = { kind, width, height };
    if (title.trim()) settings.title = title.trim();
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
      {/* Chart Type */}
      <div>
        <label htmlFor="chart-kind" className="text-xs text-muted-foreground">
          {t.toolSettings["chart-maker"].kind}
        </label>
        <select
          id="chart-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={INPUT_CLASS}
        >
          {CHART_KINDS.map((ck) => (
            <option key={ck.value} value={ck.value}>
              {ck.label}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="chart-title" className="text-xs text-muted-foreground">
          {t.toolSettings["chart-maker"].title}
        </label>
        <input
          id="chart-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional chart title"
          maxLength={120}
          className={INPUT_CLASS}
        />
      </div>

      {/* Width */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="chart-width" className="text-xs text-muted-foreground">
            {t.toolSettings["chart-maker"].width}
          </label>
          <span className="text-xs font-mono text-foreground">{width}px</span>
        </div>
        <input
          id="chart-width"
          type="range"
          min={320}
          max={2048}
          step={10}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Height */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="chart-height" className="text-xs text-muted-foreground">
            {t.toolSettings["chart-maker"].height}
          </label>
          <span className="text-xs font-mono text-foreground">{height}px</span>
        </div>
        <input
          id="chart-height"
          type="range"
          min={240}
          max={1536}
          step={10}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["chart-maker"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="chart-maker-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings["chart-maker"].submitBatch.replace("{count}", String(files.length))
            : t.toolSettings["chart-maker"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="chart-maker-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
