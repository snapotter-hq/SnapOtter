import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

type Strategy = "blur" | "pixelate" | "solid";
type Format = "webp" | "png" | "jpeg";

export function LqipPlaceholderSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress, resultPayload } =
    useToolProcessor("lqip-placeholder");

  const [width, setWidth] = useState(16);
  const [blur, setBlur] = useState(2);
  const [strategy, setStrategy] = useState<Strategy>("blur");
  const [format, setFormat] = useState<Format>("webp");
  const [quality, setQuality] = useState(50);
  const [copied, setCopied] = useState<string | null>(null);

  const handleProcess = () => {
    const settings = { width, blur, strategy, format, quality };
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

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  const dataUri = resultPayload?.dataUri as string | undefined;
  const resultWidth = resultPayload?.width as number | undefined;
  const resultHeight = resultPayload?.height as number | undefined;
  const resultBytes = resultPayload?.bytes as number | undefined;
  const resultHtml = resultPayload?.html as string | undefined;
  const resultCss = resultPayload?.css as string | undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Strategy */}
      <div>
        <span className="text-xs text-muted-foreground">Strategy</span>
        <div className="flex gap-1 mt-1">
          {(["blur", "pixelate", "solid"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStrategy(s)}
              className={`flex-1 text-xs py-1.5 rounded ${
                strategy === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Width */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="lqip-width" className="text-xs text-muted-foreground">
            {t.toolSettings["lqip-placeholder"].width}
          </label>
          <span className="text-xs font-mono text-foreground">{width}px</span>
        </div>
        <input
          id="lqip-width"
          type="range"
          min={4}
          max={64}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Blur (only for blur strategy) */}
      {strategy === "blur" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="lqip-blur" className="text-xs text-muted-foreground">
              {t.toolSettings["lqip-placeholder"].blur}
            </label>
            <span className="text-xs font-mono text-foreground">{blur}</span>
          </div>
          <input
            id="lqip-blur"
            type="range"
            min={0}
            max={20}
            value={blur}
            onChange={(e) => setBlur(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {/* Format */}
      <div>
        <span className="text-xs text-muted-foreground">Format</span>
        <div className="flex gap-1 mt-1">
          {(["webp", "png", "jpeg"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex-1 text-xs py-1.5 rounded ${
                format === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f === "webp" ? "WebP" : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quality (only for webp/jpeg) */}
      {format !== "png" && (
        <div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Quality</span>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["lqip-placeholder"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="lqip-placeholder-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings["lqip-placeholder"].submitBatch.replace(
                "{count}",
                String(files.length),
              )
            : t.toolSettings["lqip-placeholder"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="lqip-placeholder-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}

      {/* Output section */}
      {dataUri && (
        <div className="space-y-3 pt-2 border-t border-border">
          {/* Preview + stats */}
          <div className="flex items-start gap-3">
            <img
              src={dataUri}
              alt="LQIP preview"
              className="rounded border border-border"
              style={{ width: 96, imageRendering: "auto" }}
            />
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                {resultWidth} x {resultHeight} px
              </p>
              <p>{resultBytes} bytes</p>
            </div>
          </div>

          {/* Data URI */}
          <CopyBlock
            label="Data URI"
            value={dataUri}
            copied={copied === "dataUri"}
            onCopy={() => handleCopy(dataUri, "dataUri")}
          />

          {/* HTML snippet */}
          {resultHtml && (
            <CopyBlock
              label="HTML"
              value={resultHtml}
              copied={copied === "html"}
              onCopy={() => handleCopy(resultHtml, "html")}
            />
          )}

          {/* CSS snippet */}
          {resultCss && (
            <CopyBlock
              label="CSS"
              value={resultCss}
              copied={copied === "css"}
              onCopy={() => handleCopy(resultCss, "css")}
            />
          )}
        </div>
      )}
    </form>
  );
}

function CopyBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-success-ink" /> : <Copy className="h-3 w-3" />}
          Copy
        </button>
      </div>
      <div className="p-2 rounded bg-muted text-xs font-mono text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
        {value}
      </div>
    </div>
  );
}
