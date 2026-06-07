// apps/web/src/components/editor/panels/navigator-panel.tsx

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

const THUMBNAIL_MAX_HEIGHT = 80;
const THROTTLE_MS = 500;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 64;

export function NavigatorPanel() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const setPanOffset = useEditorStore((s) => s.setPanOffset);
  const setZoom = useEditorStore((s) => s.setZoom);

  // Track history version to know when to update the thumbnail
  const historyVersion = useEditorStore((s) => s._historyVersion);

  const [thumbnailDims, setThumbnailDims] = useState({ width: 0, height: 0 });
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  // Load the source image for the thumbnail
  useEffect(() => {
    if (!sourceImageUrl) {
      setImageEl(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageEl(img);
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  // Calculate thumbnail dimensions
  useEffect(() => {
    if (!canvasSize.width || !canvasSize.height) return;
    const aspect = canvasSize.width / canvasSize.height;
    const height = THUMBNAIL_MAX_HEIGHT;
    const width = Math.round(height * aspect);
    setThumbnailDims({ width, height });
  }, [canvasSize.width, canvasSize.height]);

  // Draw the thumbnail (throttled)
  const drawThumbnail = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = thumbnailDims.width;
    canvas.height = thumbnailDims.height;

    // Draw checkerboard background for transparency
    const checkSize = 4;
    for (let y = 0; y < canvas.height; y += checkSize) {
      for (let x = 0; x < canvas.width; x += checkSize) {
        ctx.fillStyle =
          (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0 ? "#e0e0e0" : "#ffffff";
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    // Draw image scaled to thumbnail
    ctx.drawImage(imageEl, 0, 0, thumbnailDims.width, thumbnailDims.height);
  }, [imageEl, thumbnailDims.width, thumbnailDims.height]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: historyVersion triggers thumbnail redraw on canvas changes
  useEffect(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
    }
    throttleTimerRef.current = setTimeout(() => {
      drawThumbnail();
      throttleTimerRef.current = null;
    }, THROTTLE_MS);
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, [drawThumbnail, historyVersion]);

  // Calculate the viewport rectangle on the thumbnail
  // The viewport rectangle represents what is currently visible in the editor canvas
  const getViewportRect = useCallback(() => {
    if (thumbnailDims.width === 0 || canvasSize.width === 0) {
      return { x: 0, y: 0, width: thumbnailDims.width, height: thumbnailDims.height };
    }

    const container = containerRef.current;
    if (!container) {
      return { x: 0, y: 0, width: thumbnailDims.width, height: thumbnailDims.height };
    }

    // Scale from canvas coordinates to thumbnail coordinates
    const scaleX = thumbnailDims.width / canvasSize.width;
    const scaleY = thumbnailDims.height / canvasSize.height;

    // The visible area in canvas coordinates
    // panOffset is the stage position, zoom is the stage scale
    // Visible canvas area: from (-panOffset/zoom) to ((-panOffset + viewportSize)/zoom)
    const editorContainer = container.closest("[data-testid='editor-canvas']");
    const viewportWidth = editorContainer?.clientWidth || 800;
    const viewportHeight = editorContainer?.clientHeight || 600;

    const visibleX = -panOffset.x / zoom;
    const visibleY = -panOffset.y / zoom;
    const visibleWidth = viewportWidth / zoom;
    const visibleHeight = viewportHeight / zoom;

    return {
      x: visibleX * scaleX,
      y: visibleY * scaleY,
      width: visibleWidth * scaleX,
      height: visibleHeight * scaleY,
    };
  }, [thumbnailDims, canvasSize, zoom, panOffset]);

  const viewportRect = getViewportRect();

  // Handle click on minimap to jump to position
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (isDraggingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert thumbnail coords to canvas coords
      const scaleX = canvasSize.width / thumbnailDims.width;
      const scaleY = canvasSize.height / thumbnailDims.height;
      const canvasX = clickX * scaleX;
      const canvasY = clickY * scaleY;

      // Center the viewport on this position
      const editorContainer = containerRef.current?.closest("[data-testid='editor-canvas']");
      const viewportWidth = editorContainer?.clientWidth || 800;
      const viewportHeight = editorContainer?.clientHeight || 600;

      setPanOffset({
        x: -(canvasX * zoom) + viewportWidth / 2,
        y: -(canvasY * zoom) + viewportHeight / 2,
      });
    },
    [canvasSize, thumbnailDims, zoom, setPanOffset],
  );

  // Handle drag on viewport rectangle to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;

      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { ...panOffset };

      const scaleX = canvasSize.width / thumbnailDims.width;
      const scaleY = canvasSize.height / thumbnailDims.height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        setPanOffset({
          x: startPan.x - dx * scaleX * zoom,
          y: startPan.y - dy * scaleY * zoom,
        });
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panOffset, canvasSize, thumbnailDims, zoom, setPanOffset],
  );

  const zoomPercent = Math.round(zoom * 100);

  const handleZoomSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = Number.parseFloat(e.target.value);
      setZoom(MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** t);
    },
    [setZoom],
  );

  if (!sourceImageUrl) {
    return (
      <div className="px-2 py-3 text-center text-xs text-muted-foreground border-b border-border">
        No image loaded
      </div>
    );
  }

  return (
    <div className="flex flex-col border-b border-border" ref={containerRef}>
      <button
        type="button"
        className="relative mx-auto my-2 cursor-crosshair border-0 bg-transparent p-0"
        style={{ width: thumbnailDims.width, height: thumbnailDims.height }}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          width={thumbnailDims.width}
          height={thumbnailDims.height}
          className="rounded-sm"
        />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: viewport drag handle is mouse-only */}
        <div
          className="absolute border-2 border-red-500/70 pointer-events-auto cursor-move"
          style={{
            left: Math.max(0, viewportRect.x),
            top: Math.max(0, viewportRect.y),
            width: Math.min(viewportRect.width, thumbnailDims.width - Math.max(0, viewportRect.x)),
            height: Math.min(
              viewportRect.height,
              thumbnailDims.height - Math.max(0, viewportRect.y),
            ),
          }}
          onMouseDown={handleMouseDown}
        />
      </button>

      {/* Zoom slider */}
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <button
          type="button"
          onClick={() => setZoom(Math.max(MIN_ZOOM, zoom / 1.2))}
          className="p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t.a11y.zoomOut}
        >
          <Minus size={12} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)}
          onChange={handleZoomSlider}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.2))}
          className="p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t.a11y.zoomIn}
        >
          <Plus size={12} />
        </button>
        <span className="text-[10px] text-muted-foreground w-9 text-end tabular-nums">
          {zoomPercent}%
        </span>
      </div>
    </div>
  );
}
