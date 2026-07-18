import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type OutputFormat = "png" | "webp";

export function BlurBackgroundSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("blur-background");

  const [intensity, setIntensity] = useState(50);
  const [feather, setFeather] = useState(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");

  const ts = t.toolSettings["blur-background"];
  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { intensity, feather, format: outputFormat };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Intensity */}
      <div>
        <label htmlFor="blur-bg-intensity" className="mb-1.5 block text-sm font-medium">
          {ts.intensity}: {intensity}%
        </label>
        <input
          id="blur-bg-intensity"
          data-testid="blur-bg-intensity"
          type="range"
          min={1}
          max={100}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Edge Feather */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="blur-bg-feather" className="text-sm font-medium">
            Edge Feather
          </label>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {feather === 0 ? "Off" : `${feather}px`}
          </span>
        </div>
        <input
          id="blur-bg-feather"
          data-testid="blur-bg-feather"
          type="range"
          min={0}
          max={20}
          value={feather}
          onChange={(e) => setFeather(Number(e.target.value))}
          className="w-full"
        />
        <p className="mt-0.5 text-xs text-muted-foreground">
          Softens the edge between subject and blurred background
        </p>
      </div>

      {/* Output Format */}
      <div>
        <p className="mb-1.5 text-sm font-medium">Output Format</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["png", "webp"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              data-testid={`blur-bg-format-${fmt}`}
              onClick={() => setOutputFormat(fmt)}
              className={`rounded-lg border py-2 px-2 text-xs font-medium uppercase transition-colors ${
                outputFormat === fmt
                  ? "border-primary bg-primary/10 text-primary-ink"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Progress / Submit */}
      {processing && progress ? (
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
          type="submit"
          data-testid="blur-bg-submit"
          disabled={!hasFile || processing}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted w-full rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(ts.submitBatch, { count: files.length }) : ts.submit}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="text-destructive rounded-md bg-red-50 p-3 text-sm dark:bg-red-950">
          {error}
        </div>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="blur-bg-download"
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
