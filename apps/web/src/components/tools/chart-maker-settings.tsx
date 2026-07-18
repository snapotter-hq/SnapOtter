import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const { processFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("chart-maker");

  const [kind, setKind] = useState("bar");
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState(960);
  const [height, setHeight] = useState(540);

  const handleProcess = () => {
    const settings: Record<string, unknown> = { kind, width, height };
    if (title.trim()) settings.title = title.trim();
    processFiles(files, settings);
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

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          {t.toolSettings["chart-maker"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="chart-maker-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}

type ChartKind = "bar" | "line" | "pie";

export interface ChartMakerControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ChartMakerControls({ settings: initial, onChange }: ChartMakerControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["chart-maker"];
  const [kind, setKind] = useState<ChartKind>("bar");
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState(960);
  const [height, setHeight] = useState(540);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.kind != null) setKind(initial.kind as ChartKind);
    if (initial.title != null) setTitle(String(initial.title));
    if (initial.width != null) setWidth(Number(initial.width));
    if (initial.height != null) setHeight(Number(initial.height));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const out: Record<string, unknown> = { kind, width, height };
    if (title.trim()) out.title = title.trim();
    onChangeRef.current?.(out);
  }, [kind, title, width, height]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cm-kind" className="text-xs text-muted-foreground">
          {s.kind}
        </label>
        <select
          id="cm-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ChartKind)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {CHART_KINDS.map((ck) => (
            <option key={ck.value} value={ck.value}>
              {ck.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cm-title" className="text-xs text-muted-foreground">
          {s.title}
        </label>
        <input
          id="cm-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional chart title"
          maxLength={120}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="cm-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="cm-width"
          type="number"
          min={320}
          max={2048}
          step={10}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="cm-height" className="text-xs text-muted-foreground">
          {s.height}
        </label>
        <input
          id="cm-height"
          type="number"
          min={240}
          max={1536}
          step={10}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
