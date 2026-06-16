import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type BgType = "color" | "gradient";
type OutputFormat = "png" | "webp";

export function BackgroundReplaceSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("background-replace");

  const [backgroundType, setBackgroundType] = useState<BgType>("color");
  const [color, setColor] = useState("#ffffff");
  const [gradientColor1, setGradientColor1] = useState("#ffffff");
  const [gradientColor2, setGradientColor2] = useState("#000000");
  const [gradientAngle, setGradientAngle] = useState(180);
  const [feather, setFeather] = useState(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");

  const ts = t.toolSettings["background-replace"];
  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = {
      backgroundType,
      color,
      ...(backgroundType === "gradient" && {
        gradientColor1,
        gradientColor2,
        gradientAngle,
      }),
      feather,
      format: outputFormat,
    };
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
      {/* Background Type Toggle */}
      <div>
        <span className="mb-1.5 block text-sm font-medium">Background Type</span>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {(["color", "gradient"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBackgroundType(type)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                backgroundType === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type === "color" ? "Color" : "Gradient"}
            </button>
          ))}
        </div>
      </div>

      {/* Solid Color Picker */}
      {backgroundType === "color" && (
        <div>
          <label htmlFor="bg-replace-color" className="mb-1.5 block text-sm font-medium">
            {ts.color}
          </label>
          <div className="flex items-center gap-3">
            <input
              id="bg-replace-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-border"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor(v);
              }}
              className="border-border bg-background w-28 rounded-md border px-3 py-2 font-mono text-sm"
              maxLength={7}
            />
          </div>
        </div>
      )}

      {/* Gradient Controls */}
      {backgroundType === "gradient" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="bg-replace-grad1"
                className="mb-1.5 block text-xs text-muted-foreground"
              >
                Color 1
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="bg-replace-grad1"
                  type="color"
                  value={gradientColor1}
                  onChange={(e) => setGradientColor1(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border"
                />
                <input
                  type="text"
                  value={gradientColor1}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setGradientColor1(v);
                  }}
                  className="border-border bg-background w-full rounded-md border px-2 py-1.5 font-mono text-xs"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="bg-replace-grad2"
                className="mb-1.5 block text-xs text-muted-foreground"
              >
                Color 2
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="bg-replace-grad2"
                  type="color"
                  value={gradientColor2}
                  onChange={(e) => setGradientColor2(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border"
                />
                <input
                  type="text"
                  value={gradientColor2}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setGradientColor2(v);
                  }}
                  className="border-border bg-background w-full rounded-md border px-2 py-1.5 font-mono text-xs"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          <div>
            <label
              htmlFor="bg-replace-angle"
              className="mb-1.5 block text-xs text-muted-foreground"
            >
              Angle: {gradientAngle}°
            </label>
            <input
              id="bg-replace-angle"
              type="range"
              min={0}
              max={360}
              value={gradientAngle}
              onChange={(e) => setGradientAngle(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}

      {/* Edge Feather */}
      <div>
        <label htmlFor="bg-replace-feather" className="mb-1.5 block text-sm font-medium">
          Edge Feather: {feather}px
        </label>
        <input
          id="bg-replace-feather"
          type="range"
          min={0}
          max={20}
          value={feather}
          onChange={(e) => setFeather(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Output Format Toggle */}
      <div>
        <span className="mb-1.5 block text-sm font-medium">Output Format</span>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {(["png", "webp"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setOutputFormat(fmt)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                outputFormat === fmt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
