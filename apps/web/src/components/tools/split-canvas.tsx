import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useSplitStore } from "@/stores/split-store";

/**
 * SplitCanvas renders the uploaded image with a live SVG grid overlay
 * showing exactly where the splits will happen.
 */
export function SplitCanvas() {
  const { originalBlobUrl, selectedFileName, files, currentEntry } = useFileStore();
  const { getEffectiveGrid, imageDimensions, setImageDimensions, mode, tileWidth, tileHeight } =
    useSplitStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const src = originalBlobUrl;
  const filename = selectedFileName ?? files[0]?.name ?? "image";

  // Get effective grid
  const grid = getEffectiveGrid();

  // Track rendered image size for SVG overlay positioning
  const updateDisplaySize = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return;
    const img = imgRef.current;
    if (img.naturalWidth === 0) return;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    // Image is scaled to fit within container (object-contain behavior)
    const scale = Math.min(containerW / imgW, containerH / imgH, 1);
    setDisplaySize({
      width: Math.round(imgW * scale),
      height: Math.round(imgH * scale),
    });
  }, []);

  const handleImageLoad = useCallback(() => {
    setLoadError(false);
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth;
      const h = imgRef.current.naturalHeight;
      setImageDimensions({ width: w, height: h });
      updateDisplaySize();
    }
  }, [setImageDimensions, updateDisplaySize]);

  // Reset error when blob URL changes (e.g., HEIC decoded preview ready)
  // biome-ignore lint/correctness/useExhaustiveDependencies: src is a prop that triggers state reset
  useEffect(() => {
    setLoadError(false);
    setDisplaySize(null);
  }, [src]);

  // Re-measure on window resize
  useEffect(() => {
    const observer = new ResizeObserver(() => updateDisplaySize());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize]);

  // Re-measure when grid changes (in case image dimensions affect tile-size calculation)
  // biome-ignore lint/correctness/useExhaustiveDependencies: grid.columns and grid.rows trigger re-measurement of display
  useEffect(() => {
    updateDisplaySize();
  }, [grid.columns, grid.rows, updateDisplaySize]);

  if (!src) return null;

  // Show spinner while HEIC/HEIF preview is being decoded server-side
  if (currentEntry?.previewLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Generating preview...</p>
        <p className="text-xs text-muted-foreground/60">{filename}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-4">
        <p className="text-sm text-muted-foreground">Cannot preview this image format</p>
        <p className="text-xs text-muted-foreground">{filename}</p>
      </div>
    );
  }

  // Compute grid line positions as percentages
  const cols = grid.columns;
  const rows = grid.rows;

  // For tile-size mode, lines are at tile boundaries (may not be evenly spaced)
  const colPositions: number[] = [];
  const rowPositions: number[] = [];

  if (mode === "tile-size" && imageDimensions) {
    for (let c = 1; c < cols; c++) {
      const pos = Math.min((c * tileWidth) / imageDimensions.width, 1);
      if (pos < 1) colPositions.push(pos * 100);
    }
    for (let r = 1; r < rows; r++) {
      const pos = Math.min((r * tileHeight) / imageDimensions.height, 1);
      if (pos < 1) rowPositions.push(pos * 100);
    }
  } else {
    for (let c = 1; c < cols; c++) {
      colPositions.push((c / cols) * 100);
    }
    for (let r = 1; r < rows; r++) {
      rowPositions.push((r / rows) * 100);
    }
  }

  // Compute tile label positions and dimensions
  const tileLabels: Array<{
    key: string;
    cx: number;
    cy: number;
    label: string;
    dimLabel: string;
  }> = [];

  if (imageDimensions) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const num = r * cols + c + 1;

        let left: number, top: number, w: number, h: number;
        if (mode === "tile-size") {
          left = c * tileWidth;
          top = r * tileHeight;
          w = c === cols - 1 ? imageDimensions.width - left : tileWidth;
          h = r === rows - 1 ? imageDimensions.height - top : tileHeight;
        } else {
          const cellW = Math.floor(imageDimensions.width / cols);
          const cellH = Math.floor(imageDimensions.height / rows);
          left = c * cellW;
          top = r * cellH;
          w = c === cols - 1 ? imageDimensions.width - left : cellW;
          h = r === rows - 1 ? imageDimensions.height - top : cellH;
        }

        const cx = ((left + w / 2) / imageDimensions.width) * 100;
        const cy = ((top + h / 2) / imageDimensions.height) * 100;

        tileLabels.push({
          key: `${r}-${c}`,
          cx,
          cy,
          label: `${num}`,
          dimLabel: `${w}x${h}`,
        });
      }
    }
  }

  const showLabels = cols * rows <= 100;
  const showDimLabels = cols * rows <= 25;

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <div className="relative inline-block max-w-full max-h-full">
        <img
          ref={imgRef}
          src={src}
          alt={filename}
          onLoad={handleImageLoad}
          onError={() => setLoadError(true)}
          className="max-w-full max-h-full object-contain block"
          style={displaySize ? { width: displaySize.width, height: displaySize.height } : undefined}
          draggable={false}
        />

        {/* SVG grid overlay */}
        {displaySize && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={displaySize.width}
            height={displaySize.height}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <title>Split grid overlay</title>
            {/* Vertical lines */}
            {colPositions.map((x) => (
              <line
                key={`v-${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={100}
                stroke="rgba(239, 68, 68, 0.8)"
                strokeWidth={0.3}
                strokeDasharray="1.5,1"
              />
            ))}
            {/* Horizontal lines */}
            {rowPositions.map((y) => (
              <line
                key={`h-${y}`}
                x1={0}
                y1={y}
                x2={100}
                y2={y}
                stroke="rgba(239, 68, 68, 0.8)"
                strokeWidth={0.3}
                strokeDasharray="1.5,1"
              />
            ))}
            {/* Border */}
            <rect
              x={0}
              y={0}
              width={100}
              height={100}
              fill="none"
              stroke="rgba(239, 68, 68, 0.6)"
              strokeWidth={0.3}
            />
          </svg>
        )}

        {/* Tile number labels */}
        {displaySize && showLabels && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: displaySize.width, height: displaySize.height }}
          >
            {tileLabels.map((t) => (
              <div
                key={t.key}
                className="absolute flex flex-col items-center justify-center"
                style={{
                  left: `${t.cx}%`,
                  top: `${t.cy}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span className="bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded tabular-nums">
                  {t.label}
                </span>
                {showDimLabels && (
                  <span className="bg-black/50 text-white/80 text-[9px] px-1 py-px rounded mt-0.5 tabular-nums">
                    {t.dimLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image info bar */}
      {imageDimensions && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 border border-border rounded-full px-3 py-1 text-[11px] text-muted-foreground tabular-nums backdrop-blur-sm">
          {imageDimensions.width} x {imageDimensions.height}px . {cols}x{rows} grid . {cols * rows}{" "}
          tiles
        </div>
      )}
    </div>
  );
}
