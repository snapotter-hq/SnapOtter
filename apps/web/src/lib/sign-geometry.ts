export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Convert a pixel rect (top-left origin) to page fractions (0..1). */
export function toNormalizedRect(rect: RectPx, renderW: number, renderH: number): NormRect {
  return {
    x: rect.x / renderW,
    y: rect.y / renderH,
    w: rect.w / renderW,
    h: rect.h / renderH,
  };
}

/** Axis-aligned bounding box of a w×h rect rotated by `deg` degrees. */
export function rotatedBoundingBox(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}
