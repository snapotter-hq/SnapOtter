/**
 * Placement math for the text-overlay tool page. It mirrors `textBlockOrigin` in
 * apps/api/src/lib/text-overlay-render.ts in percent units, so the draggable box
 * lands where the server draws the text. The size is a guess: the server wraps
 * with Pango, which the browser can't reproduce line for line.
 */

export type TextPosition = "top" | "center" | "bottom" | "custom";

export interface TextOverlayLayout {
  text: string;
  fontSize: number;
  color: string;
  position: TextPosition;
  x: number;
  y: number;
  wrap: boolean;
  maxWidth: number;
}

export interface Size {
  width: number;
  height: number;
}

// Average glyph advance and line height as a fraction of the font size for a sans-serif face.
const GLYPH_ADVANCE = 0.55;
const LINE_HEIGHT = 1.2;

/** Approximate size of the rendered text block as a percentage of the image. */
export function estimateBlockPercent(layout: TextOverlayLayout, image: Size): Size {
  const textPx = Math.max(layout.text.length, 1) * layout.fontSize * GLYPH_ADVANCE;
  const wrapPx = layout.wrap ? (layout.maxWidth / 100) * image.width : Number.POSITIVE_INFINITY;
  const lines = Math.max(Math.ceil(textPx / wrapPx), 1);
  const widthPx = Math.min(textPx, wrapPx);
  return {
    width: (widthPx / image.width) * 100,
    height: ((lines * layout.fontSize * LINE_HEIGHT) / image.height) * 100,
  };
}

/** Same rule as the server's `clampStart`: a block bigger than the image keeps its start. */
function clampCentreAxis(centre: number, size: number): number {
  if (size >= 100) return centre;
  return Math.min(Math.max(centre, size / 2), 100 - size / 2);
}

export function clampCentre(
  point: { x: number; y: number },
  block: Size,
): { x: number; y: number } {
  return { x: clampCentreAxis(point.x, block.width), y: clampCentreAxis(point.y, block.height) };
}

/** Centre of the block, in percent, where the server puts it for the current settings. */
export function blockCentre(
  layout: TextOverlayLayout,
  block: Size,
  image: Size,
): { x: number; y: number } {
  if (layout.position === "custom") return clampCentre({ x: layout.x, y: layout.y }, block);
  const margin = (layout.fontSize / image.height) * 100;
  switch (layout.position) {
    case "top":
      return { x: 50, y: margin + block.height / 2 };
    case "center":
      return { x: 50, y: 50 };
    default:
      return { x: 50, y: 100 - margin - block.height / 2 };
  }
}

/** Turns a pointer position over the image into the whole-percent x and y the sliders hold. */
export function pointerToPlacement(
  pointer: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  block: Size,
): { x: number; y: number } {
  const raw = {
    x: ((pointer.clientX - rect.left) / rect.width) * 100,
    y: ((pointer.clientY - rect.top) / rect.height) * 100,
  };
  const { x, y } = clampCentre(raw, block);
  const whole = (n: number) => Math.min(Math.max(Math.round(n), 0), 100);
  return { x: whole(x), y: whole(y) };
}
