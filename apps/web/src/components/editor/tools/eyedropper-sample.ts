import type { SampleSize } from "../options/eyedropper-options";

/**
 * Sample a single pixel or averaged region from a canvas context at (x, y).
 * Returns hex color string.
 */
export function samplePixelColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sampleSize: SampleSize,
): string {
  const half = Math.floor(sampleSize / 2);
  // The click is bounds-checked against the document size, which can be
  // fractional after a crop, while the capture canvas truncates it. Pull the
  // centre onto a real pixel so the square below always holds at least one.
  const cx = Math.min(Math.max(0, x), ctx.canvas.width - 1);
  const cy = Math.min(Math.max(0, y), ctx.canvas.height - 1);
  // Clamp the square to the canvas: getImageData returns transparent black for
  // whatever lies beyond it, and averaging those zeros in darkens the colour
  // near an edge (#2102).
  const startX = Math.max(0, cx - half);
  const startY = Math.max(0, cy - half);
  const endX = Math.min(ctx.canvas.width, cx - half + sampleSize);
  const endY = Math.min(ctx.canvas.height, cy - half + sampleSize);

  const imageData = ctx.getImageData(startX, startY, endX - startX, endY - startY);
  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (let i = 0; i < pixelCount; i++) {
    rSum += data[i * 4];
    gSum += data[i * 4 + 1];
    bSum += data[i * 4 + 2];
  }

  const r = Math.round(rSum / pixelCount);
  const g = Math.round(gSum / pixelCount);
  const b = Math.round(bSum / pixelCount);

  return rgbToHex(r, g, b);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
