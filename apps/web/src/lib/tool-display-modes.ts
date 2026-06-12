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
  | "custom-results"
  | "media-player"
  | "document";

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

  // Video tools
  "convert-video": "media-player",
  "compress-video": "media-player",
  "trim-video": "media-player",
  "mute-video": "media-player",
  "video-to-gif": "side-by-side",
  "resize-video": "media-player",
  "crop-video": "media-player",
  "rotate-video": "media-player",
  "change-fps": "media-player",
  "video-color": "media-player",
  "video-speed": "media-player",
  "reverse-video": "media-player",
  "video-loudnorm": "media-player",
  "aspect-pad": "media-player",
  "blur-pad": "media-player",
  "watermark-video": "media-player",
  "stabilize-video": "media-player",
  "gif-to-video": "media-player",
  "video-to-webp": "side-by-side",
  "video-to-frames": "no-comparison",
  "merge-videos": "media-player",
  "replace-audio": "media-player",
  "burn-subtitles": "media-player",
  "embed-subtitles": "media-player",
  "extract-subtitles": "no-comparison",
  "images-to-video": "media-player",
  "video-metadata": "no-comparison",

  // Audio tools
  "convert-audio": "media-player",
  "trim-audio": "media-player",
  "extract-audio": "media-player",

  // PDF & Document tools
  "merge-pdf": "document",
  "split-pdf": "no-comparison",
  "compress-pdf": "document",
  "rotate-pdf": "document",
  "word-to-pdf": "document",
  "extract-pages": "document",
  "remove-pages": "document",
  "organize-pdf": "document",
  "protect-pdf": "no-comparison",
  "unlock-pdf": "document",
  "repair-pdf": "document",
  "crop-pdf": "document",
  "nup-pdf": "document",
  "booklet-pdf": "document",
  "watermark-pdf": "document",
  "pdf-page-numbers": "document",
  "linearize-pdf": "no-comparison",
  "grayscale-pdf": "document",
  "pdfa-convert": "no-comparison",
  "flatten-pdf": "document",
  "redact-pdf": "document",
  "pdf-to-text": "no-comparison",
  "pdf-to-word": "no-comparison",
  "pdf-metadata": "no-comparison",
  "html-to-pdf": "document",
  "markdown-to-pdf": "document",

  // Data tools
  "csv-excel": "no-comparison",
  "csv-json": "no-comparison",
  "json-xml": "no-comparison",
  "split-csv": "no-comparison",
};

/**
 * Tools whose selected files all post in ONE request as repeated "file" parts.
 * Consumed by use-tool-processor; backend routes declare maxInputs.
 */
export const MULTI_FILE_TOOLS: ReadonlySet<string> = new Set([
  "merge-pdf",
  "merge-videos",
  "replace-audio",
  "burn-subtitles",
  "embed-subtitles",
  "images-to-video",
]);
