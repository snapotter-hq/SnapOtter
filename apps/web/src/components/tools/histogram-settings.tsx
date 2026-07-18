import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const CHART_W = 280;
const CHART_H = 150;

type ChannelKey = "r" | "g" | "b" | "lum";

const CHANNEL_META: Record<ChannelKey, { label: string; fill: string; dot: string }> = {
  r: { label: "R", fill: "rgba(239,68,68,0.5)", dot: "bg-red-500" },
  g: { label: "G", fill: "rgba(34,197,94,0.5)", dot: "bg-green-500" },
  b: { label: "B", fill: "rgba(59,130,246,0.5)", dot: "bg-blue-500" },
  lum: { label: "L", fill: "rgba(120,120,120,0.5)", dot: "bg-neutral-400" },
};

const ALL_CHANNELS: ChannelKey[] = ["r", "g", "b", "lum"];

function buildPath(bins: number[], maxVal: number, scale: "linear" | "log"): string {
  if (maxVal === 0) return "";
  const xStep = CHART_W / 255;
  const pts: string[] = [`M 0,${CHART_H}`];
  for (let i = 0; i < 256; i++) {
    const x = (i * xStep).toFixed(1);
    const v = bins[i];
    const norm = scale === "log" ? Math.log(1 + v) / Math.log(1 + maxVal) : v / maxVal;
    const y = (CHART_H - norm * CHART_H).toFixed(1);
    pts.push(`L ${x},${y}`);
  }
  pts.push(`L ${CHART_W},${CHART_H} Z`);
  return pts.join(" ");
}

type ChannelStats = { mean: number; median: number; stdev: number };

export function HistogramSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress, resultPayload } =
    useToolProcessor("histogram");

  const [visible, setVisible] = useState<Record<ChannelKey, boolean>>({
    r: true,
    g: true,
    b: true,
    lum: false,
  });
  const [scale, setScale] = useState<"linear" | "log">("linear");

  const bins = resultPayload?.bins as Record<ChannelKey, number[]> | undefined;
  const stats = resultPayload?.stats as Record<ChannelKey, ChannelStats> | undefined;

  const maxVal = useMemo(() => {
    if (!bins) return 0;
    let m = 0;
    for (const ch of ALL_CHANNELS) {
      if (!visible[ch]) continue;
      for (const v of bins[ch]) {
        if (v > m) m = v;
      }
    }
    return m;
  }, [bins, visible]);

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, {});
    } else {
      processFiles(files, {});
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  const toggleChannel = (ch: ChannelKey) => {
    setVisible((prev) => ({ ...prev, [ch]: !prev[ch] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Generates an RGB histogram chart showing the color distribution of the image.
      </p>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.histogram.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="histogram-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.histogram.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.histogram.submit}
        </button>
      )}

      {bins && (
        <div className="space-y-3" data-testid="histogram-chart">
          {/* Channel toggles + scale switch */}
          <div className="flex items-center gap-1.5">
            {ALL_CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                data-testid={`histogram-toggle-${ch}`}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  visible[ch]
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground opacity-50"
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${CHANNEL_META[ch].dot}`} />
                {CHANNEL_META[ch].label}
              </button>
            ))}
            <div className="ms-auto flex gap-0.5 rounded bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setScale("linear")}
                data-testid="histogram-scale-linear"
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  scale === "linear"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Lin
              </button>
              <button
                type="button"
                onClick={() => setScale("log")}
                data-testid="histogram-scale-log"
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  scale === "log"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Log
              </button>
            </div>
          </div>

          {/* SVG histogram */}
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full rounded bg-neutral-900"
            preserveAspectRatio="none"
            role="img"
            aria-label="Histogram chart"
            data-testid="histogram-svg"
          >
            {ALL_CHANNELS.filter((ch) => visible[ch]).map((ch) => (
              <path
                key={ch}
                d={buildPath(bins[ch], maxVal, scale)}
                fill={CHANNEL_META[ch].fill}
                stroke="none"
              />
            ))}
          </svg>

          {/* Stats readout */}
          {stats && (
            <div
              className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground"
              data-testid="histogram-stats"
            >
              {ALL_CHANNELS.filter((ch) => visible[ch]).map((ch) => (
                <div key={ch} className="flex items-center gap-1">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${CHANNEL_META[ch].dot}`}
                  />
                  <span>
                    {CHANNEL_META[ch].label}: {stats[ch].mean} / {stats[ch].median} /{" "}
                    {stats[ch].stdev}
                  </span>
                </div>
              ))}
              <p className="col-span-2 text-[9px] text-muted-foreground mt-0.5">
                mean / median / stdev
              </p>
            </div>
          )}
        </div>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="histogram-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
