import { BASE_CONFIG, CONVERSION_PRESET_BY_ID } from "@snapotter/shared";
import { Download } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

/** Target formats that honor a quality knob (lossy raster encodings). */
const LOSSY = new Set(["jpg", "jpeg", "webp", "avif"]);

/**
 * One settings panel shared by every conversion preset. Reads the active tool
 * id from the route (the /:section/:toolId param), looks up the preset and its
 * base settingsKind from shared metadata, and renders the matching controls:
 * a quality slider for lossy raster/svg targets, a quality select for
 * convert-video, page size + orientation for image-to-pdf, nothing otherwise.
 */
export function ConversionPresetSettings() {
  const { t } = useTranslation();
  const params = useParams<{ toolId: string }>();
  const toolId = params.toolId ?? "";
  const preset = CONVERSION_PRESET_BY_ID[toolId];
  const kind = preset ? BASE_CONFIG[preset.base].settingsKind : "none";

  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor(toolId);

  const [quality, setQuality] = useState(85);
  const [videoQuality, setVideoQuality] = useState<"high" | "balanced" | "small">("balanced");
  const [pageSize, setPageSize] = useState<"A4" | "Letter" | "A3" | "A5">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const hasFile = files.length > 0;
  const targetIsLossy = preset ? LOSSY.has(String(preset.locked.format ?? "")) : false;

  const buildSettings = (): Record<string, unknown> => {
    if (kind === "quality" && targetIsLossy) return { quality };
    if (kind === "video") return { quality: videoQuality };
    if (kind === "pdf") return { pageSize, orientation };
    return {};
  };

  const handleProcess = () => {
    const settings = buildSettings();
    if (files.length > 1) processAllFiles(files, settings);
    else processFiles(files, settings);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {kind === "quality" && targetIsLossy && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="preset-quality" className="text-xs text-muted-foreground">
              Quality
            </label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            id="preset-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {kind === "video" && (
        <div>
          <label htmlFor="preset-vq" className="text-xs text-muted-foreground">
            Quality
          </label>
          <select
            id="preset-vq"
            value={videoQuality}
            onChange={(e) => setVideoQuality(e.target.value as "high" | "balanced" | "small")}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          >
            <option value="high">High</option>
            <option value="balanced">Balanced</option>
            <option value="small">Small</option>
          </select>
        </div>
      )}

      {kind === "pdf" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="preset-page" className="text-xs text-muted-foreground">
              Page size
            </label>
            <select
              id="preset-page"
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as "A4" | "Letter" | "A3" | "A5")}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="A3">A3</option>
              <option value="A5">A5</option>
            </select>
          </div>
          <div>
            <label htmlFor="preset-orient" className="text-xs text-muted-foreground">
              Orientation
            </label>
            <select
              id="preset-orient"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape")}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.convert.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="preset-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {files.length > 1
            ? format(t.toolSettings.convert.submitBatch, { count: files.length })
            : t.toolSettings.convert.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="preset-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
