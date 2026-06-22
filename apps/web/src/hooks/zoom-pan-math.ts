// Pure, framework-free math for in-canvas zoom & pan. No React, no DOM, no @use-gesture.
// Kept separate so it can be unit-tested without layout (jsdom has none).

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ZoomPanSizes {
  /** Intrinsic image pixels. */
  natural: Size;
  /** Current fit-to-container display size (eraser canvasSize / split displaySize). */
  fitted: Size;
}

/** Smallest zoom multiplier: 1 === fit-to-container. */
export const MIN_ZOOM = 1;

/** Longest-side cap for the eraser's mask backing store (bounds memory). */
export const MAX_RENDER_DIM = 4096;

/** fitted / natural; the scale already applied to fit the image in its frame. */
export function fitScaleOf(sizes: ZoomPanSizes): number {
  return sizes.natural.w > 0 ? sizes.fitted.w / sizes.natural.w : 1;
}

/** Upper zoom bound: always lets you reach actual size (1/fitScale) plus headroom. */
export function maxZoomOf(sizes: ZoomPanSizes): number {
  const fs = fitScaleOf(sizes);
  return fs > 0 ? Math.max(8, (1 / fs) * 1.25) : 8;
}

export function clampZoom(zoom: number, sizes: ZoomPanSizes): number {
  return Math.min(maxZoomOf(sizes), Math.max(MIN_ZOOM, zoom));
}

/** Actual-pixel percentage shown in the toolbar (100% === 1 image px : 1 screen px). */
export function percentOf(zoom: number, sizes: ZoomPanSizes): number {
  return Math.round(zoom * fitScaleOf(sizes) * 100);
}

/** Zoom multiplier at which the image renders at its natural resolution. */
export function actualSizeZoom(sizes: ZoomPanSizes): number {
  const fs = fitScaleOf(sizes);
  return fs > 0 ? clampZoom(1 / fs, sizes) : MIN_ZOOM;
}

/** "Actual size" only makes sense when the image is larger than its frame. */
export function canActualSize(sizes: ZoomPanSizes): boolean {
  const fs = fitScaleOf(sizes);
  return fs > 0 && 1 / fs > 1.001;
}

/** Continuous wheel/trackpad zoom factor; only the vertical delta matters. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

/**
 * Cursor-anchored pan: keep the content point under `cursor` fixed when zoom
 * changes oldZoom -> newZoom. Assumes transform-origin: center center.
 *   d = cursor - viewportCenter ; k = newZoom/oldZoom ; pan' = d(1-k) + pan*k
 */
export function anchorPan(
  pan: Point,
  oldZoom: number,
  newZoom: number,
  cursor: Point,
  viewportCenter: Point,
): Point {
  const k = oldZoom !== 0 ? newZoom / oldZoom : 1;
  return {
    x: (cursor.x - viewportCenter.x) * (1 - k) + pan.x * k,
    y: (cursor.y - viewportCenter.y) * (1 - k) + pan.y * k,
  };
}

/**
 * Clamp pan so the scaled content (fitted * zoom) never reveals empty gutters;
 * locks to centered (0) on any axis where content fits within the viewport.
 */
export function clampPan(pan: Point, zoom: number, fitted: Size, viewport: Size): Point {
  const overflowX = Math.max(0, (fitted.w * zoom - viewport.w) / 2);
  const overflowY = Math.max(0, (fitted.h * zoom - viewport.h) / 2);
  return {
    x: Math.min(overflowX, Math.max(-overflowX, pan.x)),
    y: Math.min(overflowY, Math.max(-overflowY, pan.y)),
  };
}

/**
 * Map a screen point to fitted (content) coordinates. Transform-agnostic:
 * `rect` already reflects any zoom (rect.width === fitted.w * zoom), so the
 * zoom divides out without being known here. Keeps eraser masks accurate.
 */
export function toContentPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  fitted: Size,
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: (clientX - rect.left) * (fitted.w / rect.width),
    y: (clientY - rect.top) * (fitted.h / rect.height),
  };
}

/**
 * Backing-store resolution for the eraser mask canvas: natural resolution,
 * longest side capped at MAX_RENDER_DIM, floored at the fitted size so small
 * upscaled images never blur. Stroke coordinates remain in fitted space.
 */
export function renderSize(sizes: ZoomPanSizes): Size {
  const { natural, fitted } = sizes;
  const longest = Math.max(natural.w, natural.h);
  const cap = longest > MAX_RENDER_DIM ? MAX_RENDER_DIM / longest : 1;
  return {
    w: Math.max(fitted.w, Math.round(natural.w * cap)),
    h: Math.max(fitted.h, Math.round(natural.h * cap)),
  };
}
