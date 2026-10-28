// Limits mirrored from the API schemas so a settings panel can flag a typed
// value before it reaches the server and comes back a generic "Invalid settings".
// Kept free of React/DOM so the checks are unit-testable in isolation.

import { MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/shared";

// The trim square path is one side of a square output, so its ceiling is the
// square root of the pixel budget the smart-crop route enforces (#2203).
export const MAX_SMART_CROP_TARGET_SIZE = Math.floor(Math.sqrt(MAX_RESIZE_OUTPUT_PIXELS));

// The routes require a positive size up to MAX_RESIZE_OUTPUT_DIMENSION.
export function isDimensionWithinLimit(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= MAX_RESIZE_OUTPUT_DIMENSION;
}

// The requested box and the padded intermediate must both stay inside the
// 64 MP budget. The route also re-checks the cover intermediate against the
// source image, which a form cannot know.
export function isSmartCropAreaWithinLimit(
  width: number,
  height: number,
  paddingPercent: number,
): boolean {
  if (width * height > MAX_RESIZE_OUTPUT_PIXELS) return false;
  if (paddingPercent <= 0) return true;
  const scale = 1 + paddingPercent / 100;
  return Math.round(width * scale) * Math.round(height * scale) <= MAX_RESIZE_OUTPUT_PIXELS;
}

export function isSmartCropTargetSizeWithinLimit(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= MAX_SMART_CROP_TARGET_SIZE;
}
