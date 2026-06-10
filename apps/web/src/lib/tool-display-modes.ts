/**
 * Pure display-mode map: toolId -> DisplayMode.
 *
 * This module intentionally has no React imports so that Playwright specs and
 * Node-side test generators can import it directly. It is the single source of
 * truth for display modes; tool-registry.tsx merges it into registry entries.
 */

export type DisplayMode =
  | "side-by-side"
  | "before-after"
  | "live-preview"
  | "no-comparison"
  | "interactive-crop"
  | "interactive-eraser"
  | "interactive-split"
  | "no-dropzone"
  | "custom-results";

export const TOOL_DISPLAY_MODES: Record<string, DisplayMode> = {
  // Essentials
  resize: "side-by-side",
  crop: "interactive-crop",
  rotate: "side-by-side",
  convert: "no-comparison",
  compress: "before-after",
  "strip-metadata": "no-comparison",
  "edit-metadata": "no-comparison",

  // Color adjustments
  "adjust-colors": "live-preview",
  sharpening: "before-after",

  // Watermark & overlay
  "watermark-text": "before-after",
  "watermark-image": "before-after",
  "text-overlay": "before-after",
  compose: "before-after",
  "meme-generator": "no-dropzone",

  // Utilities
  info: "no-comparison",
  compare: "before-after",
  "find-duplicates": "custom-results",
  "color-palette": "no-comparison",
  "qr-generate": "no-dropzone",
  "html-to-image": "no-dropzone",
  "barcode-read": "before-after",
  "image-to-base64": "custom-results",

  // Layout & composition
  collage: "no-dropzone",
  stitch: "no-comparison",
  split: "interactive-split",
  border: "live-preview",
  beautify: "live-preview",

  // Format & conversion
  "svg-to-raster": "before-after",
  vectorize: "before-after",
  "gif-tools": "before-after",

  // Optimization extras
  "bulk-rename": "before-after",
  favicon: "before-after",
  "image-to-pdf": "before-after",
  "optimize-for-web": "before-after",
  "pdf-to-image": "no-dropzone",

  // Adjustments extra
  "replace-color": "before-after",
  "color-blindness": "before-after",

  // AI tools
  "remove-background": "before-after",
  upscale: "before-after",
  ocr: "before-after",
  "blur-faces": "before-after",
  "enhance-faces": "before-after",
  "erase-object": "interactive-eraser",
  "smart-crop": "before-after",
  "image-enhancement": "before-after",
  colorize: "before-after",
  "noise-removal": "before-after",
  "passport-photo": "custom-results",
  "red-eye-removal": "before-after",
  "restore-photo": "before-after",
  "transparency-fixer": "before-after",
  "content-aware-resize": "side-by-side",
  "ai-canvas-expand": "before-after",
};
