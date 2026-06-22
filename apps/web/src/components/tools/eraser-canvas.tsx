import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ZoomToolbar } from "@/components/common/zoom-toolbar";
import { useZoomPan } from "@/hooks/use-zoom-pan";
import { renderSize } from "@/hooks/zoom-pan-math";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; size: number };
type ImageStrokeData = {
  strokes: Stroke[];
  canvasSize: { w: number; h: number };
  naturalSize: { w: number; h: number };
};

export interface EraserCanvasRef {
  exportMask: () => Promise<Blob | null>;
  exportAllMasks: () => Promise<Map<string, Blob>>;
  getMaskCenter: () => number | null;
  clear: () => void;
  clearAll: () => void;
  undo: () => void;
}

interface EraserCanvasProps {
  imageSrc: string;
  brushSize: number;
  onStrokeChange: (hasStrokes: boolean) => void;
  onMaskedCountChange?: (count: number) => void;
}

export const EraserCanvas = forwardRef<EraserCanvasRef, EraserCanvasProps>(function EraserCanvas(
  { imageSrc, brushSize, onStrokeChange, onMaskedCountChange },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const naturalRef = useRef({ w: 0, h: 0 });

  const strokesRef = useRef<Stroke[]>([]);
  const allStrokesRef = useRef<Map<string, ImageStrokeData>>(new Map());
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);

  // Cursor position for brush preview
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  // Zoom & pan. Sizes become available once the image is measured.
  const sizes =
    canvasSize && naturalRef.current.w
      ? { natural: { ...naturalRef.current }, fitted: { w: canvasSize.w, h: canvasSize.h } }
      : null;
  const zp = useZoomPan({ sizes, viewportRef: wrapperRef, resetKey: imageSrc });
  const { isPanMode, beginPan, movePan, endPan, toContent } = zp;

  // Mask backing-store resolution: natural res (capped) so the overlay stays crisp when zoomed.
  const renderDims = sizes ? renderSize(sizes) : null;

  // Measure and fit image to container
  const measure = useCallback(() => {
    const img = imgRef.current;
    const wrapper = wrapperRef.current;
    if (!img || !wrapper || !img.naturalWidth) return;

    naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    const scale = Math.min(
      wrapper.clientWidth / img.naturalWidth,
      wrapper.clientHeight / img.naturalHeight,
    );
    setCanvasSize({
      w: Math.floor(img.naturalWidth * scale),
      h: Math.floor(img.naturalHeight * scale),
    });
  }, []);

  // Acquire the mask context with the backing-store scale applied, so all drawing
  // happens in fitted (canvasSize) coordinates but renders at natural resolution.
  const prepCtx = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(canvas.width / canvasSize.w, 0, 0, canvas.height / canvasSize.h, 0, 0);
    return ctx;
  }, [canvasSize]);

  // Persist current strokes to the per-image map
  const persistStrokes = useCallback(() => {
    if (!canvasSize || !naturalRef.current.w) return;
    const map = allStrokesRef.current;
    if (strokesRef.current.length > 0) {
      map.set(imageSrc, {
        strokes: [...strokesRef.current],
        canvasSize: { ...canvasSize },
        naturalSize: { ...naturalRef.current },
      });
    } else {
      map.delete(imageSrc);
    }
  }, [imageSrc, canvasSize]);

  // Restore strokes when image changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: imageSrc triggers intentional restore
  useEffect(() => {
    const saved = allStrokesRef.current.get(imageSrc);
    if (saved) {
      strokesRef.current = [...saved.strokes];
      naturalRef.current = saved.naturalSize;
    } else {
      strokesRef.current = [];
    }
    currentPointsRef.current = [];
    onStrokeChange(strokesRef.current.length > 0);
    setCanvasSize(saved?.canvasSize ?? null);
    onMaskedCountChange?.(allStrokesRef.current.size);
  }, [imageSrc, onStrokeChange]);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 60, 60, 0.4)";
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 60, 60, 0.4)";
      ctx.lineWidth = stroke.size;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, []);

  // Redraw all strokes
  const redraw = useCallback(() => {
    const ctx = prepCtx();
    if (!ctx || !canvasSize) return;

    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, [canvasSize, drawStroke, prepCtx]);

  // Keyboard shortcut: Ctrl+Z for undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        strokesRef.current.pop();
        onStrokeChange(strokesRef.current.length > 0);
        redraw();
        persistStrokes();
        onMaskedCountChange?.(allStrokesRef.current.size);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onStrokeChange, onMaskedCountChange, redraw, persistStrokes]);

  // Get canvas-relative point from event (transform-agnostic: divides out zoom/pan)
  const getPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const raw = "touches" in e ? e.touches[0] : e;
      if (!raw) return null;
      return toContent(raw.clientX, raw.clientY, canvas.getBoundingClientRect());
    },
    [toContent],
  );

  const handleDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Multi-touch -> hand off to pinch-zoom; never paint a stray stroke.
      // Return BEFORE preventDefault so the gesture sees the pinch.
      if ("touches" in e && e.touches.length > 1) {
        drawingRef.current = false;
        currentPointsRef.current = [];
        return;
      }
      // Pan mode -> drag pans instead of painting.
      if (isPanMode) {
        const raw = "touches" in e ? e.touches[0] : e;
        if (raw) beginPan(raw.clientX, raw.clientY);
        return;
      }
      if ("touches" in e) e.preventDefault();
      const pt = getPoint(e);
      if (!pt) return;
      drawingRef.current = true;
      currentPointsRef.current = [pt];

      // Immediate dot
      const ctx = prepCtx();
      if (ctx) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255, 60, 60, 0.4)";
        ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [getPoint, brushSize, isPanMode, beginPan, prepCtx],
  );

  const handleMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if ("touches" in e && e.touches.length > 1) {
        drawingRef.current = false;
        return;
      }
      // Pan mode -> drag pans; hide the brush preview.
      if (isPanMode) {
        const raw = "touches" in e ? e.touches[0] : e;
        if (raw) movePan(raw.clientX, raw.clientY);
        setCursorPos(null);
        return;
      }

      // Update cursor position for brush preview
      const pt = getPoint(e);
      if (pt) setCursorPos(pt);

      if (!drawingRef.current) return;
      if ("touches" in e) e.preventDefault();
      if (!pt) return;

      currentPointsRef.current.push(pt);

      const ctx = prepCtx();
      if (!ctx) return;
      const pts = currentPointsRef.current;
      if (pts.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 60, 60, 0.4)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    },
    [getPoint, brushSize, isPanMode, movePan, prepCtx],
  );

  const handleUp = useCallback(() => {
    endPan();
    if (!drawingRef.current) return;
    drawingRef.current = false;

    if (currentPointsRef.current.length > 0) {
      strokesRef.current.push({
        points: [...currentPointsRef.current],
        size: brushSize,
      });
      currentPointsRef.current = [];
      onStrokeChange(true);
      redraw();
      persistStrokes();
      onMaskedCountChange?.(allStrokesRef.current.size);
    }
  }, [brushSize, onStrokeChange, onMaskedCountChange, redraw, persistStrokes, endPan]);

  const handleLeave = useCallback(() => {
    setCursorPos(null);
    handleUp();
  }, [handleUp]);

  // Expose methods
  useImperativeHandle(
    ref,
    () => ({
      exportMask: async () => {
        const nat = naturalRef.current;
        if (!nat.w || !canvasSize || strokesRef.current.length === 0) return null;

        const mask = document.createElement("canvas");
        mask.width = nat.w;
        mask.height = nat.h;
        const ctx = mask.getContext("2d");
        if (!ctx) return null;

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, nat.w, nat.h);

        const sx = nat.w / canvasSize.w;
        const sy = nat.h / canvasSize.h;

        ctx.fillStyle = "white";
        ctx.strokeStyle = "white";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const stroke of strokesRef.current) {
          const scaledSize = stroke.size * Math.max(sx, sy);

          if (stroke.points.length === 1) {
            ctx.beginPath();
            ctx.arc(
              stroke.points[0].x * sx,
              stroke.points[0].y * sy,
              scaledSize / 2,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.lineWidth = scaledSize;
            ctx.moveTo(stroke.points[0].x * sx, stroke.points[0].y * sy);
            for (let i = 1; i < stroke.points.length; i++) {
              ctx.lineTo(stroke.points[i].x * sx, stroke.points[i].y * sy);
            }
            ctx.stroke();
          }
        }

        return new Promise<Blob | null>((resolve) => {
          mask.toBlob((b) => resolve(b), "image/png");
        });
      },
      exportAllMasks: async () => {
        persistStrokes();
        const results = new Map<string, Blob>();
        for (const [src, data] of allStrokesRef.current) {
          if (data.strokes.length === 0) continue;
          const mask = document.createElement("canvas");
          mask.width = data.naturalSize.w;
          mask.height = data.naturalSize.h;
          const ctx = mask.getContext("2d");
          if (!ctx) continue;
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, data.naturalSize.w, data.naturalSize.h);
          const sx = data.naturalSize.w / data.canvasSize.w;
          const sy = data.naturalSize.h / data.canvasSize.h;
          ctx.fillStyle = "white";
          ctx.strokeStyle = "white";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (const stroke of data.strokes) {
            const scaledSize = stroke.size * Math.max(sx, sy);
            if (stroke.points.length === 1) {
              ctx.beginPath();
              ctx.arc(
                stroke.points[0].x * sx,
                stroke.points[0].y * sy,
                scaledSize / 2,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.lineWidth = scaledSize;
              ctx.moveTo(stroke.points[0].x * sx, stroke.points[0].y * sy);
              for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x * sx, stroke.points[i].y * sy);
              }
              ctx.stroke();
            }
          }
          const blob = await new Promise<Blob | null>((resolve) => {
            mask.toBlob((b) => resolve(b), "image/png");
          });
          if (blob) results.set(src, blob);
        }
        return results;
      },
      getMaskCenter: () => {
        if (strokesRef.current.length === 0 || !canvasSize) return null;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const stroke of strokesRef.current) {
          for (const pt of stroke.points) {
            minX = Math.min(minX, pt.x - stroke.size / 2);
            maxX = Math.max(maxX, pt.x + stroke.size / 2);
          }
        }
        if (minX === Infinity) return null;
        const centerX = (minX + maxX) / 2;
        return Math.max(0, Math.min(100, (centerX / canvasSize.w) * 100));
      },
      clear: () => {
        strokesRef.current = [];
        currentPointsRef.current = [];
        onStrokeChange(false);
        redraw();
        persistStrokes();
        onMaskedCountChange?.(allStrokesRef.current.size);
      },
      clearAll: () => {
        allStrokesRef.current.clear();
        strokesRef.current = [];
        currentPointsRef.current = [];
        onStrokeChange(false);
        onMaskedCountChange?.(0);
        redraw();
      },
      undo: () => {
        strokesRef.current.pop();
        onStrokeChange(strokesRef.current.length > 0);
        redraw();
        persistStrokes();
        onMaskedCountChange?.(allStrokesRef.current.size);
      },
    }),
    [canvasSize, onStrokeChange, onMaskedCountChange, redraw, persistStrokes],
  );

  return (
    <div
      ref={wrapperRef}
      data-testid="zoom-viewport"
      className="relative flex items-center justify-center w-full h-full overflow-hidden touch-none"
      {...zp.bindGestures()}
    >
      {/* Hidden img for measuring natural size before canvas is ready */}
      {!canvasSize && (
        <img
          ref={imgRef}
          src={imageSrc}
          onLoad={measure}
          alt=""
          className="max-w-full max-h-full object-contain"
        />
      )}
      {canvasSize && renderDims && (
        <>
          <div
            data-testid="zoom-content"
            className="relative"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              transform: zp.transform,
              transformOrigin: "center center",
            }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Paint over objects to erase"
              className="block"
              style={{ width: canvasSize.w, height: canvasSize.h }}
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              width={renderDims.w}
              height={renderDims.h}
              className="absolute inset-0 touch-none"
              style={{ cursor: isPanMode ? "grab" : "none" }}
              onMouseDown={handleDown}
              onMouseMove={handleMove}
              onMouseUp={handleUp}
              onMouseLeave={handleLeave}
              onTouchStart={handleDown}
              onTouchMove={handleMove}
              onTouchEnd={handleUp}
            />
            {/* Brush cursor preview */}
            {cursorPos && !isPanMode && (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-white/80"
                style={{
                  width: brushSize,
                  height: brushSize,
                  left: cursorPos.x - brushSize / 2,
                  top: cursorPos.y - brushSize / 2,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
                }}
              />
            )}
          </div>
          <ZoomToolbar
            percent={zp.percent}
            canZoomIn={zp.canZoomIn}
            canZoomOut={zp.canZoomOut}
            canActualSize={zp.canActualSize}
            handToolActive={zp.handToolActive}
            onZoomIn={zp.zoomIn}
            onZoomOut={zp.zoomOut}
            onFit={zp.fit}
            onActualSize={zp.actualSize}
            onToggleHandTool={zp.toggleHandTool}
          />
        </>
      )}
    </div>
  );
});
