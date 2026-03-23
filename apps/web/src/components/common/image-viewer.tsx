import { useState, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize, Minimize2 } from "lucide-react";
import { formatFileSize } from "@/lib/download";

interface ImageViewerProps {
  src: string;
  filename: string;
  fileSize: number;
  cssRotate?: number;
  cssFlipH?: boolean;
  cssFlipV?: boolean;
}

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300];
const DEFAULT_ZOOM = 100;

export function ImageViewer({ src, filename, fileSize, cssRotate, cssFlipH, cssFlipV }: ImageViewerProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<"fit" | "actual">("fit");
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const isSvg = filename.toLowerCase().endsWith(".svg");

  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setNaturalWidth(imgRef.current.naturalWidth);
      setNaturalHeight(imgRef.current.naturalHeight);
    }
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = ZOOM_STEPS.find((s) => s > prev);
      return next ?? prev;
    });
    setFitMode("actual");
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < prev);
      return next ?? prev;
    });
    setFitMode("actual");
  }, []);

  const fitToContainer = useCallback(() => {
    setFitMode("fit");
    setZoom(DEFAULT_ZOOM);
  }, []);

  const actualSize = useCallback(() => {
    setFitMode("actual");
    setZoom(100);
  }, []);

  // Reset zoom on src change
  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
    setFitMode("fit");
    setNaturalWidth(null);
    setNaturalHeight(null);
  }, [src]);

  const previewTransform = [
    cssRotate ? `rotate(${cssRotate}deg)` : "",
    cssFlipH ? "scaleX(-1)" : "",
    cssFlipV ? "scaleY(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const imageStyle =
    fitMode === "fit"
      ? {
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain" as const,
          ...(previewTransform && { transform: previewTransform }),
        }
      : {
          transform: `scale(${zoom / 100})${previewTransform ? ` ${previewTransform}` : ""}`,
          transformOrigin: "center center",
        };

  return (
    <div className="flex flex-col w-full h-full max-w-3xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1 py-2 px-3 border-b border-border shrink-0">
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_STEPS[0]}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center tabular-nums">
          {fitMode === "fit" ? "Fit" : `${zoom}%`}
        </span>
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={fitToContainer}
          className={`px-2 py-1 rounded text-xs ${fitMode === "fit" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Fit to view"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={actualSize}
          className={`px-2 py-1 rounded text-xs ${fitMode === "actual" && zoom === 100 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Actual size (100%)"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto bg-muted/20 p-4"
      >
        {isSvg ? (
          <img
            ref={imgRef}
            src={src}
            alt={filename}
            onLoad={handleImageLoad}
            className="select-none"
            style={imageStyle}
            draggable={false}
          />
        ) : (
          <img
            ref={imgRef}
            src={src}
            alt={filename}
            onLoad={handleImageLoad}
            className="select-none rounded-sm"
            style={imageStyle}
            draggable={false}
          />
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
        <span className="truncate mr-2">{filename}</span>
        <div className="flex items-center gap-3 shrink-0">
          {naturalWidth != null && naturalHeight != null && (
            <span>
              {naturalWidth} x {naturalHeight}
            </span>
          )}
          <span>{formatFileSize(fileSize)}</span>
        </div>
      </div>
    </div>
  );
}
