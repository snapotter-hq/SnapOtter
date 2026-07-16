// Pure aspect-ratio math shared by the Resize tool's proportion controls.
// A "ratio" here is always width / height (16:9 -> 16/9 -> 1.777...).
// Kept free of React/DOM so it can be unit-tested in isolation.

// Matches the resize route's Sharp guardrail (apps/api/src/routes/tools/resize.ts).
export const MAX_RESIZE_DIMENSION = 16383;

export interface RatioPreset {
  id: string;
  value: number;
}

// Fixed proportions offered as one-tap chips. "Free" and "Original" are UI
// modes handled by the component, not entries here.
export const RESIZE_RATIO_PRESETS: RatioPreset[] = [
  { id: "1:1", value: 1 },
  { id: "4:3", value: 4 / 3 },
  { id: "3:2", value: 3 / 2 },
  { id: "16:9", value: 16 / 9 },
  { id: "3:4", value: 3 / 4 },
  { id: "9:16", value: 9 / 16 },
];

// Round to a whole pixel and clamp into the [1, MAX] range the backend accepts.
export function clampResizeDimension(value: number): number {
  return Math.min(MAX_RESIZE_DIMENSION, Math.max(1, Math.round(value)));
}

// Given one edited dimension and a locked ratio, compute the paired dimension.
// axis names which dimension `value` is: editing width yields a height, and
// vice versa.
export function pairedDimension(value: number, ratio: number, axis: "width" | "height"): number {
  const paired = axis === "width" ? value / ratio : value * ratio;
  return clampResizeDimension(paired);
}

// Largest box of the given ratio that fits fully inside the source, so a chip
// tap never upscales past the original image.
export function largestRatioBox(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
): { width: number; height: number } {
  if (sourceWidth / sourceHeight >= ratio) {
    // Source is wider than the target ratio: height is the limiting edge.
    return {
      width: clampResizeDimension(sourceHeight * ratio),
      height: clampResizeDimension(sourceHeight),
    };
  }
  // Source is taller/narrower: width is the limiting edge.
  return {
    width: clampResizeDimension(sourceWidth),
    height: clampResizeDimension(sourceWidth / ratio),
  };
}
