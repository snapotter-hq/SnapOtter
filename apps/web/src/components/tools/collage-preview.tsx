import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDrag, usePinch } from "@use-gesture/react";
import {
  Download,
  Expand,
  GripVertical,
  ImagePlus,
  Loader2,
  Maximize,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { type CollageTemplate, getTemplateById } from "@/lib/collage-templates";
import { cn } from "@/lib/utils";
import type { CellTransform, CollageImage } from "@/stores/collage-store";
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

function displayUrl(img: CollageImage): string {
  return img.previewBlobUrl ?? img.blobUrl;
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
    return <ProcessingView />;
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

function ProcessingView() {
  const progress = useCollageStore((s) => s.progress);
  const label = progress < 80 ? "Uploading images..." : "Processing collage...";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
      <div className="w-full max-w-xs space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          <span className="font-mono">{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
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

  const arMultiplier = getAspectMultiplier(aspectRatio);
  const aspectStyle: React.CSSProperties = arMultiplier
    ? { aspectRatio: `1 / ${arMultiplier}` }
    : {};

  const bgIsTransparent = backgroundColor === "transparent";

  const [activeDragCell, setActiveDragCell] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const cellIndex = event.active.data.current?.cellIndex as number | undefined;
    if (cellIndex != null) setActiveDragCell(cellIndex);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragCell(null);
      const { active, over } = event;
      if (!over) return;
      const fromCell = active.data.current?.cellIndex as number;
      const toCell = over.data.current?.cellIndex as number;
      if (fromCell == null || toCell == null || fromCell === toCell) return;

      const toImgIdx = cellAssignments[toCell] ?? -1;
      if (toImgIdx >= 0) {
        store.swapCells(fromCell, toCell);
      } else {
        const fromImgIdx = cellAssignments[fromCell];
        if (fromImgIdx == null || fromImgIdx < 0) return;
        store.setCellAssignment(toCell, fromImgIdx);
        store.setCellAssignment(fromCell, -1);
      }
    },
    [cellAssignments, store],
  );

  const activeDragImage =
    activeDragCell != null
      ? (() => {
          const imgIdx = cellAssignments[activeDragCell] ?? -1;
          return imgIdx >= 0 ? images[imgIdx] : null;
        })()
      : null;

  return (
    <div
      className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-auto"
      role="none"
      onClick={() => store.setSelectedCell(null)}
      onKeyDown={(e) => e.key === "Escape" && store.setSelectedCell(null)}
    >
      <div className="relative w-full max-w-[800px] max-h-full" style={aspectStyle}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
              const transform = cellTransforms[i] ?? {
                panX: 0,
                panY: 0,
                zoom: 1,
                objectFit: "cover" as const,
              };
              const isSelected = selectedCell === i;
              const isDragSource = activeDragCell === i;

              return (
                <CollageCell
                  key={`${template.id}-${cell.gridColumn}-${cell.gridRow}`}
                  cellIndex={i}
                  image={img}
                  transform={transform}
                  cornerRadius={cornerRadius}
                  isSelected={isSelected}
                  isDragSource={isDragSource}
                  gridColumn={cell.gridColumn}
                  gridRow={cell.gridRow}
                  backgroundColor={backgroundColor}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragImage ? (
              <div className="w-20 h-20 rounded-lg overflow-hidden shadow-xl border-2 border-primary opacity-90">
                <img
                  src={displayUrl(activeDragImage)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

/** A single cell in the collage grid with use-gesture pan/zoom/pinch and dnd-kit reorder. */
function CollageCell({
  cellIndex,
  image,
  transform,
  cornerRadius,
  isSelected,
  isDragSource,
  gridColumn,
  gridRow,
  backgroundColor,
}: {
  cellIndex: number;
  image: CollageImage | null;
  transform: CellTransform;
  cornerRadius: number;
  isSelected: boolean;
  isDragSource: boolean;
  gridColumn: string;
  gridRow: string;
  backgroundColor: string;
}) {
  const store = useCollageStore();
  const cellRef = useRef<HTMLDivElement>(null);
  const [controlsVisible, setControlsVisible] = useState(false);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cell-drop-${cellIndex}`,
    data: { cellIndex },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `cell-drag-${cellIndex}`,
    data: { cellIndex },
    disabled: !image,
  });

  useEffect(() => {
    if (isSelected && image) setControlsVisible(true);
    if (!isSelected) setControlsVisible(false);
  }, [isSelected, image]);

  const bindDrag = useDrag(
    ({
      movement: [mx, my],
      first,
      memo,
    }: {
      movement: [number, number];
      first: boolean;
      memo?: { panX: number; panY: number };
    }) => {
      if (!image || !isSelected) return memo;
      if (first) memo = { panX: transform.panX, panY: transform.panY };
      const rect = cellRef.current?.getBoundingClientRect();
      if (!rect || !memo) return memo;
      const panX = Math.max(-200, Math.min(200, memo.panX + (mx / rect.width) * 100));
      const panY = Math.max(-200, Math.min(200, memo.panY + (my / rect.height) * 100));
      store.setCellTransform(cellIndex, { panX, panY });
      return memo;
    },
    { pointer: { touch: true }, filterTaps: true },
  );

  const bindPinch = usePinch(
    ({ offset: [scale] }: { offset: [number, number] }) => {
      if (!image || !isSelected) return;
      const zoom = Math.max(1, Math.min(10, scale));
      store.setCellTransform(cellIndex, { zoom });
    },
    {
      scaleBounds: { min: 1, max: 10 },
      from: () => [transform.zoom, 0],
    },
  );

  const zoomRef = useRef(transform.zoom);
  zoomRef.current = transform.zoom;

  useEffect(() => {
    const el = cellRef.current;
    if (!el || !image || !isSelected) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const zoom = Math.max(1, Math.min(10, zoomRef.current + delta));
      store.setCellTransform(cellIndex, { zoom });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [image, isSelected, cellIndex, store]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      store.setSelectedCell(cellIndex);
    },
    [cellIndex, store],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      store.resetCellTransform(cellIndex);
    },
    [cellIndex, store],
  );

  const handleZoomSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      store.setCellTransform(cellIndex, { zoom: Number.parseFloat(e.target.value) });
    },
    [cellIndex, store],
  );

  const handleToggleFit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = transform.objectFit === "cover" ? "contain" : "cover";
      store.setCellTransform(cellIndex, { objectFit: next });
    },
    [cellIndex, store, transform.objectFit],
  );

  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      store.resetCellTransform(cellIndex);
    },
    [cellIndex, store],
  );

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      cellRef.current = node;
      setDropRef(node);
    },
    [setDropRef],
  );

  const isLoading = image?.previewLoading ?? false;

  return (
    // biome-ignore lint/a11y/useSemanticElements: cell requires drag/zoom interactions incompatible with button element
    <div
      ref={mergedRef}
      role="button"
      tabIndex={0}
      aria-label={`Collage cell ${cellIndex + 1}`}
      className={cn(
        "relative overflow-hidden transition-shadow",
        isSelected && "ring-2 ring-primary ring-offset-1",
        isOver && !isSelected && "ring-2 ring-blue-500",
        !image && "border-2 border-dashed border-border/50",
        image && !isSelected && "cursor-grab",
        image && isSelected && "cursor-grab active:cursor-grabbing",
        isDragSource && "opacity-50",
      )}
      style={{
        gridColumn,
        gridRow,
        borderRadius: `${cornerRadius}px`,
        minHeight: 0,
        touchAction: isSelected ? "none" : "auto",
        backgroundColor: transform.objectFit === "contain" ? backgroundColor : undefined,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick(e as unknown as React.MouseEvent);
      }}
      {...(isSelected ? { ...bindDrag(), ...bindPinch() } : {})}
    >
      {image ? (
        isLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : (
          <img
            src={displayUrl(image)}
            alt=""
            draggable={false}
            className={cn(
              "w-full h-full select-none pointer-events-none",
              transform.objectFit === "contain" ? "object-contain" : "object-cover",
            )}
            style={{
              transform: `translate(${transform.panX}%, ${transform.panY}%) scale(${transform.zoom})`,
            }}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30">
          <ImagePlus className="h-6 w-6 text-muted-foreground/30" />
        </div>
      )}

      {/* Top bar — drag handle + fit/fill toggle */}
      {isSelected && image && !isLoading && (
        <div
          role="toolbar"
          aria-label="Image controls"
          className="absolute top-1.5 right-1.5 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleToggleFit}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium backdrop-blur-sm transition-colors",
              transform.objectFit === "contain"
                ? "bg-blue-500/80 text-white hover:bg-blue-500/90"
                : "bg-black/50 text-white hover:bg-black/70",
            )}
            title={transform.objectFit === "cover" ? "Fit entire image" : "Fill cell"}
          >
            {transform.objectFit === "contain" ? (
              <>
                <Maximize className="h-3.5 w-3.5" />
                Fit
              </>
            ) : (
              <>
                <Expand className="h-3.5 w-3.5" />
                Fill
              </>
            )}
          </button>
          <button
            type="button"
            ref={setDragRef}
            {...listeners}
            {...attributes}
            aria-label="Drag to reorder"
            className="bg-black/50 backdrop-blur-sm text-white rounded p-1 cursor-grab active:cursor-grabbing hover:bg-black/70 transition-colors"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Zoom controls overlay — bottom of selected cells */}
      {isSelected && image && !isLoading && (
        <div
          role="toolbar"
          aria-label="Zoom controls"
          className={cn(
            "absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
            controlsVisible ? "opacity-100" : "opacity-0",
          )}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="range"
            min="1"
            max="10"
            step="0.1"
            value={transform.zoom}
            onChange={handleZoomSlider}
            className="flex-1 h-1.5 accent-white cursor-pointer"
          />
          <span className="text-white text-xs font-mono w-8 text-right shrink-0">
            {transform.zoom.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="text-white hover:text-white/80 transition-colors shrink-0"
            title="Reset position and zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
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
            {img.previewLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              </div>
            ) : (
              <img
                src={displayUrl(img)}
                alt={img.file.name}
                className="w-full h-full object-cover"
              />
            )}
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
