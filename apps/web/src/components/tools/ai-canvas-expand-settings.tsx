import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Tier = "fast" | "balanced" | "high";

const TIERS: { id: Tier; label: string; desc: string }[] = [
  { id: "fast", label: "Fast", desc: "Quick preview, fewer AI passes" },
  { id: "balanced", label: "Balanced", desc: "Good quality, moderate speed" },
  { id: "high", label: "High Quality", desc: "Best results, slower" },
];

const EXTEND_PRESETS = [
  { label: "16:9", aspect: 16 / 9 },
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "9:16", aspect: 9 / 16 },
  { label: "4:5", aspect: 4 / 5 },
];

export function AiCanvasExpandSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("ai-canvas-expand");

  const [extendTop, setExtendTop] = useState(0);
  const [extendRight, setExtendRight] = useState(0);
  const [extendBottom, setExtendBottom] = useState(0);
  const [extendLeft, setExtendLeft] = useState(0);
  const [tier, setTier] = useState<Tier>("balanced");
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );

  const firstFile = files[0];
  useEffect(() => {
    if (!firstFile) {
      setImgDimensions(null);
      return;
    }
    const url = URL.createObjectURL(firstFile);
    const img = new Image();
    img.onload = () => setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [firstFile]);

  const handleExtendPreset = useCallback(
    (targetAspect: number) => {
      if (!imgDimensions) return;
      const { width: w, height: h } = imgDimensions;
      const currentAspect = w / h;
      let top = 0;
      let right = 0;
      let bottom = 0;
      let left = 0;
      if (targetAspect > currentAspect) {
        const newWidth = Math.round(h * targetAspect);
        const extra = newWidth - w;
        left = Math.round(extra / 2);
        right = extra - left;
      } else {
        const newHeight = Math.round(w / targetAspect);
        const extra = newHeight - h;
        top = Math.round(extra / 2);
        bottom = extra - top;
      }
      setExtendTop(top);
      setExtendRight(right);
      setExtendBottom(bottom);
      setExtendLeft(left);
    },
    [imgDimensions],
  );

  const hasFile = files.length > 0;
  const hasExtension = extendTop > 0 || extendRight > 0 || extendBottom > 0 || extendLeft > 0;

  const handleProcess = () => {
    const settings = { extendTop, extendRight, extendBottom, extendLeft, tier };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasExtension && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quality tier */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Quality</p>
        <div className="grid grid-cols-3 gap-1">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`tier-${t.id}`}
              onClick={() => setTier(t.id)}
              className={`text-xs py-2 rounded transition-colors ${
                tier === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {TIERS.find((t) => t.id === tier)?.desc}
        </p>
      </div>

      {/* Aspect ratio presets */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Extend to aspect ratio</p>
        <div className="flex flex-wrap gap-1">
          {EXTEND_PRESETS.map(({ label, aspect }) => (
            <button
              key={label}
              type="button"
              onClick={() => handleExtendPreset(aspect)}
              className="px-2 py-1.5 rounded text-xs bg-muted text-muted-foreground hover:bg-primary/20 hover:text-foreground transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-side extension */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Extend by (pixels)</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="cac-top" className="text-[10px] text-muted-foreground">
              Top
            </label>
            <input
              id="cac-top"
              type="number"
              value={extendTop}
              onChange={(e) => setExtendTop(Math.max(0, Number(e.target.value)))}
              min={0}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="cac-right" className="text-[10px] text-muted-foreground">
              Right
            </label>
            <input
              id="cac-right"
              type="number"
              value={extendRight}
              onChange={(e) => setExtendRight(Math.max(0, Number(e.target.value)))}
              min={0}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="cac-bottom" className="text-[10px] text-muted-foreground">
              Bottom
            </label>
            <input
              id="cac-bottom"
              type="number"
              value={extendBottom}
              onChange={(e) => setExtendBottom(Math.max(0, Number(e.target.value)))}
              min={0}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="cac-left" className="text-[10px] text-muted-foreground">
              Left
            </label>
            <input
              id="cac-left"
              type="number"
              value={extendLeft}
              onChange={(e) => setExtendLeft(Math.max(0, Number(e.target.value)))}
              min={0}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Output size display */}
      {imgDimensions &&
        (extendTop > 0 || extendRight > 0 || extendBottom > 0 || extendLeft > 0) && (
          <p className="text-xs text-muted-foreground">
            New size: {imgDimensions.width + extendLeft + extendRight} x{" "}
            {imgDimensions.height + extendTop + extendBottom}
          </p>
        )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["ai-canvas-expand"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="ai-canvas-expand-submit"
          disabled={!hasFile || !hasExtension || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings["ai-canvas-expand"].submitBatch, { count: files.length })
            : t.toolSettings["ai-canvas-expand"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="ai-canvas-expand-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
