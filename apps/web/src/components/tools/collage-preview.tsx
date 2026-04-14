import { Download, ImagePlus, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { type CollageTemplate, getTemplateById } from "@/lib/collage-templates";
import { cn } from "@/lib/utils";
import { useCollageStore } from "@/stores/collage-store";

// Checkerboard pattern for transparent background
const CHECKER_BG = "repeating-conic-gradient(#e0e0e0 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px";

/** Aspect ratio to numeric multiplier (height = width * multiplier). */
function getAspectMultiplier(ar: string): number | null {
  const map: Record<string, number> = {
    "1:1": 1,
    "4:3": 3 / 4,
    "3:2": 2 / 3,
    "16:9": 9 / 16,
    "9:16": 16 / 9,
    "4:5": 5 / 4,
  };
  return map[ar] ?? null;
}

export function CollagePreview() {
  const images = useCollageStore((s) => s.images);
  const templateId = useCollageStore((s) => s.templateId);
  const phase = useCollageStore((s) => s.phase);
  const resultUrl = useCollageStore((s) => s.resultUrl);

  const template = getTemplateById(templateId);

  if (phase === "upload" || images.length === 0) {
    return <UploadArea />;
  }

  if (phase === "processing") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Creating your collage...</p>
      </div>
    );
  }

  if (phase === "result" && resultUrl) {
    return <ResultView />;
  }

  if (!template) return null;

  return (
    <div className="flex flex-col h-full w-full">
      <CollageCanvas template={template} />
      <ImageStrip />
    </div>
  );
}

/** Dropzone for initial image upload. */
function UploadArea() {
  const addImages = useCollageStore((s) => s.addImages);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) addImages(files);
    },
    [addImages],
  );

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.heic,.heif,.hif";
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) addImages(files);
    };
    input.click();
  };

  return (
    <section
      aria-label="File drop zone"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors min-h-[400px] mx-auto max-w-2xl w-full",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
      )}
    >
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="text-3xl font-bold text-muted-foreground/30">
          <span className="text-primary/30">ashim</span>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg border border-primary text-primary hover:bg-primary/5 transition-colors text-sm font-medium"
        >
          <Upload className="h-4 w-4" />
          Upload images for collage
        </button>
        <p className="text-sm text-muted-foreground">Drop 2 or more images here to get started</p>
      </div>
    </section>
  );
}

/** The live CSS Grid collage canvas. */
function CollageCanvas({ template }: { template: CollageTemplate }) {
  const store = useCollageStore();
  const {
    images,
    cellAssignments,
    cellTransforms,
    gap,
    cornerRadius,
    backgroundColor,
    aspectRatio,
    selectedCell,
  } = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const arMultiplier = getAspectMultiplier(aspectRatio);

  // Calculate canvas aspect ratio style
  const aspectStyle: React.CSSProperties = arMultiplier
    ? { aspectRatio: `1 / ${arMultiplier}` }
    : {};

  const bgIsTransparent = backgroundColor === "transparent";

  return (
    <div
      className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-auto"
      role="none"
      onClick={() => store.setSelectedCell(null)}
      onKeyDown={(e) => e.key === "Escape" && store.setSelectedCell(null)}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-[800px] max-h-full"
        style={aspectStyle}
      >
        <div
          className="w-full h-full rounded-lg overflow-hidden shadow-lg"
          style={{
            background: bgIsTransparent ? CHECKER_BG : backgroundColor,
            display: "grid",
            gridTemplateColumns: template.gridTemplateColumns,
            gridTemplateRows: template.gridTemplateRows,
            gap: `${gap}px`,
            padding: `${gap}px`,
            ...(arMultiplier ? { aspectRatio: `1 / ${arMultiplier}` } : { aspectRatio: "4 / 3" }),
          }}
        >
          {template.cells.map((cell, i) => {
            const imgIndex = cellAssignments[i] ?? -1;
            const img = imgIndex >= 0 ? images[imgIndex] : null;
            const transform = cellTransforms[i] ?? { panX: 0, panY: 0, zoom: 1 };
            const isSelected = selectedCell === i;

            return (
              <CollageCell
                key={`${template.id}-${cell.gridColumn}-${cell.gridRow}`}
                cellIndex={i}
                image={img}
                transform={transform}
                cornerRadius={cornerRadius}
                isSelected={isSelected}
                gridColumn={cell.gridColumn}
                gridRow={cell.gridRow}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A single cell in the collage grid with pan/zoom support. */
function CollageCell({
  cellIndex,
  image,
  transform,
  cornerRadius,
  isSelected,
  gridColumn,
  gridRow,
}: {
  cellIndex: number;
  image: { blobUrl: string } | null;
  transform: { panX: number; panY: number; zoom: number };
  cornerRadius: number;
  isSelected: boolean;
  gridColumn: string;
  gridRow: string;
}) {
  const store = useCollageStore();
  const cellRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!image) return;
      e.preventDefault();
      e.stopPropagation();
      store.setSelectedCell(cellIndex);
      isDragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: transform.panX,
        panY: transform.panY,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const dx = ev.clientX - dragStart.current.x;
        const dy = ev.clientY - dragStart.current.y;
        const rect = cellRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Convert pixel drag to percentage of cell size
        const panX = Math.max(
          -100,
          Math.min(100, dragStart.current.panX + (dx / rect.width) * 100),
        );
        const panY = Math.max(
          -100,
          Math.min(100, dragStart.current.panY + (dy / rect.height) * 100),
        );
        store.setCellTransform(cellIndex, { panX, panY });
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [cellIndex, image, store, transform.panX, transform.panY],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!image) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(1, Math.min(3, transform.zoom + delta));
      store.setCellTransform(cellIndex, { zoom: newZoom });
    },
    [cellIndex, image, store, transform.zoom],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      store.resetCellTransform(cellIndex);
    },
    [cellIndex, store],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      store.setSelectedCell(cellIndex);
    },
    [cellIndex, store],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: cell requires drag/zoom interactions incompatible with button element
    <div
      ref={cellRef}
      role="button"
      tabIndex={0}
      aria-label={`Collage cell ${cellIndex + 1}`}
      className={cn(
        "relative overflow-hidden cursor-grab active:cursor-grabbing transition-shadow",
        isSelected && "ring-2 ring-primary ring-offset-1",
        !image && "border-2 border-dashed border-border/50",
      )}
      style={{
        gridColumn,
        gridRow,
        borderRadius: `${cornerRadius}px`,
        minHeight: 0,
      }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick(e as unknown as React.MouseEvent);
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      {image ? (
        <img
          src={image.blobUrl}
          alt=""
          draggable={false}
          className="w-full h-full object-cover select-none pointer-events-none"
          style={{
            transform: `translate(${transform.panX}%, ${transform.panY}%) scale(${transform.zoom})`,
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30">
          <ImagePlus className="h-6 w-6 text-muted-foreground/30" />
        </div>
      )}
      {isSelected && image && transform.zoom > 1 && (
        <div className="absolute bottom-1 right-1 bg-background/80 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">
          {Math.round(transform.zoom * 100)}%
        </div>
      )}
    </div>
  );
}

/** Thumbnail strip at the bottom for managing images. */
function ImageStrip() {
  const store = useCollageStore();
  const { images } = store;

  const handleAddMore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.heic,.heif,.hif";
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) store.addImages(files);
    };
    input.click();
  }, [store]);

  return (
    <div className="shrink-0 border-t border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        {images.map((img, i) => (
          <div
            key={img.id}
            className="relative shrink-0 w-14 h-14 rounded-md overflow-hidden border border-border group"
          >
            <img src={img.blobUrl} alt={img.file.name} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => store.removeImage(i)}
              className="absolute top-0 right-0 bg-black/60 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center truncate px-0.5">
              {i + 1}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddMore}
          className="shrink-0 w-14 h-14 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center transition-colors"
        >
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

/** Result view after collage is created. */
function ResultView() {
  const store = useCollageStore();
  const { resultUrl, resultSize, originalSize } = store;

  if (!resultUrl) return null;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
        <img
          src={resultUrl}
          alt="Collage result"
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        />
        {originalSize != null && resultSize != null && (
          <div className="absolute top-3 right-3 flex gap-2">
            <span className="bg-background/80 border border-border px-2 py-0.5 rounded text-xs text-muted-foreground">
              {(originalSize / 1024).toFixed(0)} KB in
            </span>
            <span className="bg-background/80 border border-border px-2 py-0.5 rounded text-xs text-muted-foreground">
              {(resultSize / 1024).toFixed(0)} KB out
            </span>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-background px-4 py-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => store.setPhase("editing")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Back to editor
        </button>
        <a
          href={resultUrl}
          download
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    </div>
  );
}
