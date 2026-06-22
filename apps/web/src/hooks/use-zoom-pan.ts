import { useGesture } from "@use-gesture/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actualSizeZoom,
  anchorPan,
  canActualSize as canActualSizeOf,
  clampPan,
  clampZoom,
  MIN_ZOOM,
  maxZoomOf,
  type Point,
  percentOf,
  type Size,
  toContentPoint,
  wheelZoomFactor,
  type ZoomPanSizes,
} from "./zoom-pan-math";

interface UseZoomPanOptions {
  /** null until the image has been measured. */
  sizes: ZoomPanSizes | null;
  /** Clipping viewport element (overflow-hidden). Used for pan bounds + resize. */
  viewportRef: React.RefObject<HTMLElement | null>;
  /** Reset zoom/pan when this changes (e.g. the image source). Defaults to natural dims. */
  resetKey?: string;
  /**
   * Enable drag-to-pan via the gesture binding (split). The eraser keeps this false
   * and drives pan through its own pointer handlers, so the gesture never captures
   * pointers away from the drawing canvas.
   */
  enableDragPan?: boolean;
}

export function useZoomPan({
  sizes,
  viewportRef,
  resetKey,
  enableDragPan = false,
}: UseZoomPanOptions) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [handToolActive, setHandToolActive] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const sizesRef = useRef(sizes);
  const pointerOverRef = useRef(false);
  // Synchronous mirrors of pan-mode state so the gesture's drag handler reads the
  // current value immediately (a passive effect lags fast keydown->pointerdown input).
  const spaceHeldRef = useRef(false);
  const handToolRef = useRef(false);
  const panStartRef = useRef<{ pan: Point; cx: number; cy: number } | null>(null);
  const pinchRef = useRef<{ base: number; ox: number; oy: number } | null>(null);

  const isPanMode = spaceHeld || handToolActive;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  // Reset when the image changes (not on resize).
  const resetSignal = resetKey ?? (sizes ? `${sizes.natural.w}x${sizes.natural.h}` : "none");
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetSignal drives an intentional reset
  useEffect(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setHandToolActive(false);
    handToolRef.current = false;
  }, [resetSignal]);

  const viewportSize = useCallback((): Size => {
    const el = viewportRef.current;
    return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
  }, [viewportRef]);

  const viewportCenter = useCallback((): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  }, [viewportRef]);

  const applyZoom = useCallback(
    (next: number, cursor?: Point) => {
      const s = sizesRef.current;
      if (!s) return;
      const target = clampZoom(next, s);
      const center = viewportCenter();
      const anchored = anchorPan(panRef.current, zoomRef.current, target, cursor ?? center, center);
      setZoom(target);
      setPan(clampPan(anchored, target, s.fitted, viewportSize()));
    },
    [viewportCenter, viewportSize],
  );

  const zoomIn = useCallback(() => applyZoom(zoomRef.current * 1.5), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(zoomRef.current / 1.5), [applyZoom]);
  const fit = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);
  const actualSize = useCallback(() => {
    const s = sizesRef.current;
    if (s) applyZoom(actualSizeZoom(s));
  }, [applyZoom]);
  const toggleHandTool = useCallback(() => {
    handToolRef.current = !handToolRef.current;
    setHandToolActive(handToolRef.current);
  }, []);
  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, factor: number) =>
      applyZoom(zoomRef.current * factor, { x: clientX, y: clientY }),
    [applyZoom],
  );

  const beginPan = useCallback((clientX: number, clientY: number) => {
    panStartRef.current = { pan: panRef.current, cx: clientX, cy: clientY };
  }, []);
  const movePan = useCallback(
    (clientX: number, clientY: number) => {
      const start = panStartRef.current;
      const s = sizesRef.current;
      if (!start || !s) return;
      const next = {
        x: start.pan.x + (clientX - start.cx),
        y: start.pan.y + (clientY - start.cy),
      };
      setPan(clampPan(next, zoomRef.current, s.fitted, viewportSize()));
    },
    [viewportSize],
  );
  const endPan = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const toContent = useCallback((clientX: number, clientY: number, rect: DOMRect): Point => {
    const s = sizesRef.current;
    if (!s) return { x: 0, y: 0 };
    return toContentPoint(clientX, clientY, rect, s.fitted);
  }, []);

  // Space-to-pan, scoped to pointer-over-viewport and not while typing.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && pointerOverRef.current && !isTyping()) {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Re-clamp pan on viewport resize (never refit).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = sizesRef.current;
      if (!s) return;
      setPan((p) => clampPan(p, zoomRef.current, s.fitted, viewportSize()));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportRef, viewportSize]);

  const gesture = useGesture(
    {
      onHover: ({ hovering }) => {
        pointerOverRef.current = !!hovering;
      },
      onMove: () => {
        pointerOverRef.current = true;
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        zoomAtPoint(event.clientX, event.clientY, wheelZoomFactor(dy));
      },
      onPinch: ({ first, last, origin: [ox, oy], offset: [scale] }) => {
        const s = sizesRef.current;
        if (!s) return;
        if (first || !pinchRef.current) {
          pinchRef.current = { base: zoomRef.current, ox, oy };
        }
        const pr = pinchRef.current;
        const moved = { x: panRef.current.x + (ox - pr.ox), y: panRef.current.y + (oy - pr.oy) };
        pr.ox = ox;
        pr.oy = oy;
        const target = clampZoom(pr.base * scale, s);
        const anchored = anchorPan(
          moved,
          zoomRef.current,
          target,
          { x: ox, y: oy },
          viewportCenter(),
        );
        setZoom(target);
        setPan(clampPan(anchored, target, s.fitted, viewportSize()));
        if (last) pinchRef.current = null;
      },
      onDrag: ({ first, last, xy: [px, py] }) => {
        if (!(spaceHeldRef.current || handToolRef.current)) return;
        if (first) beginPan(px, py);
        movePan(px, py);
        if (last) endPan();
      },
    },
    {
      wheel: { eventOptions: { passive: false } },
      drag: { enabled: enableDragPan, filterTaps: true },
    },
  );

  const bindGestures = useCallback(() => gesture(), [gesture]);

  return {
    zoom,
    panOffset: pan,
    isPanMode,
    handToolActive,
    percent: sizes ? percentOf(zoom, sizes) : 100,
    canZoomIn: sizes ? zoom < maxZoomOf(sizes) - 1e-3 : false,
    canZoomOut: zoom > MIN_ZOOM + 1e-3,
    canActualSize: sizes ? canActualSizeOf(sizes) : false,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    zoomIn,
    zoomOut,
    fit,
    actualSize,
    toggleHandTool,
    zoomAtPoint,
    beginPan,
    movePan,
    endPan,
    toContent,
    bindGestures,
  };
}
