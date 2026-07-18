import { useGesture } from "@use-gesture/react";
import { FileImage, Maximize, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Point, resolvePanStart } from "@/components/common/image-viewer-drag";
import { useTranslation } from "@/contexts/i18n-context";
import { formatFileSize } from "@/lib/download";
import { cn } from "@/lib/utils";

export interface BgPreviewState {
  /** URL of the original image (for blur background) */
  backgroundSrc?: string;
  /** CSS blur filter value for the background, e.g. "blur(15px)" */
  backgroundBlur?: string;
  /** CSS background for the container (color, gradient), e.g. "#FFFFFF" or "linear-gradient(...)" */
  containerBackground?: string;
  /** CSS drop-shadow filter for the subject */
  dropShadow?: string;
  /** Whether to show checkered (transparent) background */
  showCheckerboard?: boolean;
}

interface ImageViewerProps {
  src: string;
  filename: string;
  fileSize: number;
  originalWidth?: number | null;
  originalHeight?: number | null;
  cssRotate?: number;
  cssFlipH?: boolean;
  cssFlipV?: boolean;
  cssFilter?: string;
  bgPreview?: BgPreviewState;
  imageWrapperStyle?: React.CSSProperties;
  imageWrapperChildren?: React.ReactNode;
}

const ZOOM_STEPS = [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000];
const DEFAULT_ZOOM = 100;

export function ImageViewer({
  src,
  filename,
  fileSize,
  originalWidth,
  originalHeight,
  cssRotate,
  cssFlipH,
  cssFlipV,
  cssFilter,
  bgPreview,
  imageWrapperStyle,
  imageWrapperChildren,
}: ImageViewerProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<"fit" | "actual">("fit");
  const [loadError, setLoadError] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef(zoom);
  const fitModeRef = useRef(fitMode);

  // Keep refs in sync for gesture callbacks
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    fitModeRef.current = fitMode;
  }, [fitMode]);

  const isSvg = filename.toLowerCase().endsWith(".svg");

  const handleImageLoad = useCallback(() => {
    setLoadError(false);
    if (imgRef.current) {
      setNaturalWidth(imgRef.current.naturalWidth);
      setNaturalHeight(imgRef.current.naturalHeight);
    }
  }, []);

  const handleImageError = useCallback(() => {
    setLoadError(true);
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
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const actualSize = useCallback(() => {
    setFitMode("actual");
    setZoom(100);
  }, []);

  // Reset state on src change
  // biome-ignore lint/correctness/useExhaustiveDependencies: src is a prop that triggers state reset
  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
    setFitMode("fit");
    setNaturalWidth(null);
    setNaturalHeight(null);
    setLoadError(false);
    setPanOffset({ x: 0, y: 0 });
  }, [src]);

  // Gesture handlers for pinch-to-zoom, ctrl+wheel zoom, and drag-to-pan
  const initialZoomRef = useRef<number | null>(null);
  const bind = useGesture(
    {
      onPinch: ({ first, offset: [scale], memo }) => {
        if (first) {
          initialZoomRef.current = zoomRef.current;
        }
        const base = initialZoomRef.current ?? zoomRef.current;
        const newZoom = Math.max(10, Math.min(1000, base * scale));
        setZoom(newZoom);
        setFitMode("actual");
        return memo;
      },
      onWheel: ({ event, delta: [, dy] }) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        const direction = dy < 0 ? 1 : -1;
        setZoom((prev) => {
          const factor = direction > 0 ? 1.1 : 1 / 1.1;
          return Math.max(10, Math.min(1000, prev * factor));
        });
        setFitMode("actual");
      },
      onDrag: ({ movement: [mx, my], first, memo }) => {
        if (fitModeRef.current !== "actual") return;
        const start = resolvePanStart(first, memo as Point | undefined, panOffset);
        setPanOffset({ x: start.x + mx, y: start.y + my });
        return start;
      },
    },
    {
      wheel: { eventOptions: { passive: false } },
      drag: { filterTaps: true },
    },
  );

  const previewTransform = [
    cssRotate ? `rotate(${cssRotate}deg)` : "",
    cssFlipH ? "scaleX(-1)" : "",
    cssFlipV ? "scaleY(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const checkerBg = bgPreview?.showCheckerboard
    ? { background: "repeating-conic-gradient(#d0d0d0 0% 25%, #f0f0f0 0% 50%) 0 0 / 20px 20px" }
    : {};

  const imageStyle =
    fitMode === "fit"
      ? {
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain" as const,
          ...checkerBg,
          ...(previewTransform && {
            transform: previewTransform,
            transition: "transform 0.25s ease, filter 0.15s ease",
          }),
          ...(cssFilter && { filter: cssFilter, transition: "filter 0.15s ease" }),
        }
      : {
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})${previewTransform ? ` ${previewTransform}` : ""}`,
          transformOrigin: "center center",
          ...checkerBg,
          ...(previewTransform && { transition: "transform 0.25s ease, filter 0.15s ease" }),
          ...(cssFilter && { filter: cssFilter, transition: "filter 0.15s ease" }),
        };

  return (
    <div className="flex flex-col w-full h-full max-w-3xl mx-auto min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1 py-2 px-3 border-b border-border shrink-0">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_STEPS[0]}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
          aria-label={t.a11y.zoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center tabular-nums">
          {fitMode === "fit" ? "Fit" : `${zoom}%`}
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
          aria-label={t.a11y.zoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          type="button"
          onClick={fitToContainer}
          className={`px-2 py-1 rounded text-xs ${fitMode === "fit" ? "bg-primary/10 text-primary-ink" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Fit to view"
          aria-label={t.a11y.fitToView}
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={actualSize}
          className={`px-2 py-1 rounded text-xs ${fitMode === "actual" && zoom === 100 ? "bg-primary/10 text-primary-ink" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Actual size (100%)"
          aria-label={t.a11y.actualSize}
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        {...bind()}
        className={cn(
          "flex-1 flex items-center justify-center overflow-auto p-4",
          fitMode === "actual" && "touch-none",
        )}
        style={{ backgroundColor: "hsl(var(--muted) / 0.2)" }}
      >
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <FileImage className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preview not available</p>
            <p className="text-xs text-muted-foreground">{filename}</p>
          </div>
        ) : bgPreview?.backgroundSrc || bgPreview?.containerBackground ? (
          /* Layered bg-removal preview: background layer + subject layer */
          <div
            className="relative rounded-sm overflow-hidden"
            style={{
              ...(fitMode === "fit"
                ? { maxWidth: "100%", maxHeight: "100%" }
                : { transform: `scale(${zoom / 100})`, transformOrigin: "center center" }),
              display: "inline-block",
            }}
          >
            {/* Background layer: blurred original or solid/gradient */}
            {bgPreview.backgroundSrc ? (
              <img
                src={bgPreview.backgroundSrc}
                alt="background"
                className="block select-none"
                style={{
                  ...(fitMode === "fit"
                    ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const }
                    : {}),
                  filter: bgPreview.backgroundBlur || undefined,
                  transition: "filter 0.15s ease",
                }}
                draggable={false}
              />
            ) : (
              /* Solid color or gradient - use subject dimensions */
              <img
                src={src}
                alt="background-sizer"
                className="block select-none invisible"
                style={
                  fitMode === "fit"
                    ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const }
                    : {}
                }
                draggable={false}
              />
            )}

            {/* Container background (color or gradient) behind subject but on top of bg image */}
            {bgPreview.containerBackground && !bgPreview.backgroundSrc && (
              <div
                className="absolute inset-0"
                style={{ background: bgPreview.containerBackground }}
              />
            )}

            {/* Subject layer: transparent PNG with optional drop shadow */}
            <img
              ref={imgRef}
              src={src}
              alt={filename}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="absolute inset-0 w-full h-full select-none"
              style={{
                objectFit: "contain" as const,
                filter: bgPreview.dropShadow || undefined,
                transition: "filter 0.15s ease",
              }}
              draggable={false}
            />
          </div>
        ) : imageWrapperStyle ? (
          <div
            style={{
              ...imageWrapperStyle,
              display: "inline-flex",
              flexDirection: "column" as const,
              position: imageWrapperChildren ? ("relative" as const) : undefined,
              boxSizing: "border-box" as const,
              overflow: "hidden",
              maxWidth: "100%",
              maxHeight: "100%",
              transition: "all 0.15s ease",
            }}
          >
            {imageWrapperChildren}
            <img
              ref={imgRef}
              src={src}
              alt={filename}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="select-none"
              style={{
                display: "block",
                flex: "0 1 auto",
                minHeight: 0,
                maxWidth: "100%",
                objectFit: "contain" as const,
              }}
              draggable={false}
            />
          </div>
        ) : (
          <img
            ref={imgRef}
            src={src}
            alt={filename}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`select-none${isSvg ? "" : " rounded-sm"}`}
            style={imageStyle}
            draggable={false}
          />
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
        <span className="truncate me-2">{filename}</span>
        <div className="flex items-center gap-3 shrink-0">
          {(originalWidth || naturalWidth) != null && (originalHeight || naturalHeight) != null && (
            <span>
              {originalWidth || naturalWidth} x {originalHeight || naturalHeight}
            </span>
          )}
          <span>{formatFileSize(fileSize)}</span>
        </div>
      </div>
    </div>
  );
}
