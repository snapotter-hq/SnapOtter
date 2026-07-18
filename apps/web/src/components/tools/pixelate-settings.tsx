import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type PixelateMode = "whole" | "selection";

export function PixelateSettings({
  onImageOverlay,
  onImageStyle,
}: {
  onImageOverlay?: (children: React.ReactNode) => void;
  onImageStyle?: (style: React.CSSProperties | null) => void;
}) {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const blobUrl = entry?.blobUrl;
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("pixelate");

  const [blockSize, setBlockSize] = useState(12);
  const [mode, setMode] = useState<PixelateMode>("whole");

  // Natural image dimensions (for converting normalized box to pixel region)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!blobUrl) {
      setDims(null);
      return;
    }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = blobUrl;
  }, [blobUrl]);

  // Normalized selection box in 0..1 (default centered 40x40%)
  const [boxX, setBoxX] = useState(0.3);
  const [boxY, setBoxY] = useState(0.3);
  const [boxW, setBoxW] = useState(0.4);
  const [boxH, setBoxH] = useState(0.4);

  // Refs for latest values (stable pointer-event handlers read from these)
  const boxXRef = useRef(boxX);
  const boxYRef = useRef(boxY);
  const boxWRef = useRef(boxW);
  const boxHRef = useRef(boxH);
  useEffect(() => {
    boxXRef.current = boxX;
  }, [boxX]);
  useEffect(() => {
    boxYRef.current = boxY;
  }, [boxY]);
  useEffect(() => {
    boxWRef.current = boxW;
  }, [boxW]);
  useEffect(() => {
    boxHRef.current = boxH;
  }, [boxH]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ref-to-latest for overlay/style callbacks (avoids stale closures)
  const onOverlayRef = useRef(onImageOverlay);
  useEffect(() => {
    onOverlayRef.current = onImageOverlay;
  });
  const onStyleRef = useRef(onImageStyle);
  useEffect(() => {
    onStyleRef.current = onImageStyle;
  });

  // Stable pointer-event handlers (read state from refs, never go stale)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: boxXRef.current,
      origY: boxYRef.current,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - dragRef.current.startX) / rect.width;
    const dy = (e.clientY - dragRef.current.startY) / rect.height;
    const nx = Math.min(Math.max(dragRef.current.origX + dx, 0), 1 - boxWRef.current);
    const ny = Math.min(Math.max(dragRef.current.origY + dy, 0), 1 - boxHRef.current);
    setBoxX(nx);
    setBoxY(ny);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Clamp box position when width/height sliders change
  useEffect(() => {
    setBoxX((prev) => Math.min(prev, 1 - boxW));
    setBoxY((prev) => Math.min(prev, 1 - boxH));
  }, [boxW, boxH]);

  // Manage overlay and imageWrapperStyle based on mode
  useEffect(() => {
    if (mode !== "selection") {
      onOverlayRef.current?.(null);
      onStyleRef.current?.(null);
      return;
    }

    // Activate the image wrapper div so overlay children render
    onStyleRef.current?.({});

    const overlay = (
      <div
        ref={(el: HTMLDivElement | null) => {
          containerRef.current = el;
        }}
        style={{
          position: "absolute" as const,
          inset: 0,
          zIndex: 10,
          pointerEvents: "none" as const,
        }}
      >
        <div
          data-testid="pixelate-selection-box"
          style={{
            position: "absolute" as const,
            left: `${boxX * 100}%`,
            top: `${boxY * 100}%`,
            width: `${boxW * 100}%`,
            height: `${boxH * 100}%`,
            border: "2px solid hsl(var(--primary))",
            background: "hsl(var(--primary) / 0.08)",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
            cursor: "move",
            touchAction: "none" as const,
            pointerEvents: "auto" as const,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    );

    onOverlayRef.current?.(overlay);

    return () => {
      onOverlayRef.current?.(null);
      onStyleRef.current?.(null);
    };
  }, [mode, boxX, boxY, boxW, boxH, handlePointerDown, handlePointerMove, handlePointerUp]);

  const handleProcess = () => {
    const settings: Record<string, unknown> = { blockSize };
    if (mode === "selection" && dims) {
      const W = dims.w;
      const H = dims.h;
      const left = Math.round(boxX * W);
      const top = Math.round(boxY * H);
      const width = Math.max(1, Math.min(Math.round(boxW * W), W - left));
      const height = Math.max(1, Math.min(Math.round(boxH * H), H - top));
      settings.region = { left, top, width, height };
    }
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
      {/* Mode toggle */}
      <div>
        <span className="text-xs text-muted-foreground">Mode</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            data-testid="pixelate-mode-whole"
            onClick={() => setMode("whole")}
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${
              mode === "whole"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Whole image
          </button>
          <button
            type="button"
            data-testid="pixelate-mode-selection"
            onClick={() => setMode("selection")}
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${
              mode === "selection"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Selection
          </button>
        </div>
      </div>

      {/* Block Size */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="pixelate-block-size" className="text-xs text-muted-foreground">
            {t.toolSettings.pixelate.blockSize}
          </label>
          <span className="text-xs font-mono text-foreground">{blockSize}px</span>
        </div>
        <input
          id="pixelate-block-size"
          type="range"
          min={2}
          max={128}
          value={blockSize}
          onChange={(e) => setBlockSize(Number(e.target.value))}
          className="w-full mt-1"
        />
        {mode === "whole" && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Applies pixelation to the full image
          </p>
        )}
      </div>

      {/* Selection region controls */}
      {mode === "selection" && (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="pixelate-region-width" className="text-xs text-muted-foreground">
                Width
              </label>
              <span className="text-xs font-mono text-foreground">{Math.round(boxW * 100)}%</span>
            </div>
            <input
              id="pixelate-region-width"
              data-testid="pixelate-region-width"
              type="range"
              min={10}
              max={100}
              value={Math.round(boxW * 100)}
              onChange={(e) => setBoxW(Number(e.target.value) / 100)}
              className="w-full mt-1"
            />
          </div>
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="pixelate-region-height" className="text-xs text-muted-foreground">
                Height
              </label>
              <span className="text-xs font-mono text-foreground">{Math.round(boxH * 100)}%</span>
            </div>
            <input
              id="pixelate-region-height"
              data-testid="pixelate-region-height"
              type="range"
              min={10}
              max={100}
              value={Math.round(boxH * 100)}
              onChange={(e) => setBoxH(Number(e.target.value) / 100)}
              className="w-full mt-1"
            />
          </div>
          {hasFile && (
            <p className="text-[10px] text-muted-foreground">
              Drag the selection box on the image to reposition
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.pixelate.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="pixelate-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.pixelate.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.pixelate.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="pixelate-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
