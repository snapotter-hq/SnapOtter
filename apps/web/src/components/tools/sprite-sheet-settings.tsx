import { Check, ClipboardCopy, Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

type OutputFormat = "png" | "webp" | "jpeg";

interface Frame {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function SpriteSheetSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, progress, resultPayload } =
    useToolProcessor("sprite-sheet");

  const [columns, setColumns] = useState(4);
  const [padding, setPadding] = useState(0);
  const [background, setBackground] = useState("#ffffff");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(90);
  const [copiedExport, setCopiedExport] = useState<"css" | "json" | null>(null);

  const handleProcess = () => {
    const settings = { columns, padding, background, format, quality };
    // sprite-sheet packs every image into ONE sheet, so all files go in a
    // single request. It is a MULTI_FILE tool, so processFiles appends them
    // all; processAllFiles would wrongly fan out to the per-file batch route.
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

      {/* Format */}
      <div>
        <span className="text-xs text-muted-foreground">Format</span>
        <div className="flex gap-1 mt-1">
          {(["png", "webp", "jpeg"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex-1 text-xs py-1.5 rounded ${
                format === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`sprite-sheet-format-${f}`}
            >
              {f === "webp" ? "WebP" : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quality (webp/jpeg only) */}
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
            data-testid="sprite-sheet-quality"
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}

      {/* Coordinate map output */}
      {Array.isArray(resultPayload?.frames) && (
        <SpriteOutput
          payload={resultPayload}
          format={format}
          copiedExport={copiedExport}
          setCopiedExport={setCopiedExport}
        />
      )}
    </form>
  );
}

function SpriteOutput({
  payload,
  format,
  copiedExport,
  setCopiedExport,
}: {
  payload: Record<string, unknown>;
  format: OutputFormat;
  copiedExport: "css" | "json" | null;
  setCopiedExport: (v: "css" | "json" | null) => void;
}) {
  const frames = payload.frames as Frame[];
  const cols = payload.cols as number;
  const rows = payload.rows as number;
  const cellWidth = payload.cellWidth as number;
  const cellHeight = payload.cellHeight as number;
  const canvasWidth = payload.canvasWidth as number;
  const canvasHeight = payload.canvasHeight as number;

  const ext = format === "jpeg" ? "jpg" : format;

  const copyCss = async () => {
    const base = `.sprite {\n  background-image: url('sprite.${ext}');\n  background-repeat: no-repeat;\n  display: inline-block;\n}`;
    const rules = frames
      .map(
        (f) =>
          `.sprite-${f.index} {\n  width: ${f.width}px;\n  height: ${f.height}px;\n  background-position: -${f.left}px -${f.top}px;\n}`,
      )
      .join("\n");
    const ok = await copyToClipboard(`${base}\n${rules}`);
    if (ok) {
      setCopiedExport("css");
      setTimeout(() => setCopiedExport(null), 1500);
    }
  };

  const copyJson = async () => {
    const ok = await copyToClipboard(
      JSON.stringify(
        { frames, cols, rows, cellWidth, cellHeight, canvasWidth, canvasHeight },
        null,
        2,
      ),
    );
    if (ok) {
      setCopiedExport("json");
      setTimeout(() => setCopiedExport(null), 1500);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border" data-testid="sprite-sheet-output">
      <p className="text-xs text-muted-foreground">
        {cols} x {rows} grid · {cellWidth} x {cellHeight}px cells · {canvasWidth} x {canvasHeight}px
        canvas
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={copyCss}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
          data-testid="sprite-sheet-copy-css"
        >
          {copiedExport === "css" ? (
            <Check className="h-3 w-3 text-success-ink" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
          Copy CSS
        </button>
        <button
          type="button"
          onClick={copyJson}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
          data-testid="sprite-sheet-copy-json"
        >
          {copiedExport === "json" ? (
            <Check className="h-3 w-3 text-success-ink" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
          Copy JSON
        </button>
      </div>
    </div>
  );
}
