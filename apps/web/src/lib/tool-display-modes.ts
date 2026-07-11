/**
 * Pure display-mode map: toolId -> DisplayMode.
 *
 * This module intentionally has no React imports so that Playwright specs and
 * Node-side test generators can import it directly. It is the single source of
 * truth for display modes; tool-registry.tsx merges it into registry entries.
 */

import { BASE_CONFIG, CONVERSION_PRESETS } from "@snapotter/shared";

export type DisplayMode =
  | "side-by-side"
  | "before-after"
  | "live-preview"
  | "no-comparison"
  | "interactive-crop"
  | "interactive-eraser"
  | "interactive-sign"
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
  "barcode-generate": "no-dropzone",
  "image-to-base64": "custom-results",

  // Layout & composition
  collage: "no-dropzone",
  stitch: "no-comparison",
  split: "interactive-split",
  border: "live-preview",
  beautify: "live-preview",
  "circle-crop": "live-preview",
  duotone: "live-preview",
  "image-pad": "live-preview",
  pixelate: "live-preview",
  vignette: "live-preview",

  "gif-webp": "before-after",
  histogram: "no-comparison",
  "lqip-placeholder": "no-comparison",
  "sprite-sheet": "no-comparison",

  // Format & conversion
  "svg-to-raster": "before-after",
  vectorize: "before-after",
  "gif-tools": "before-after",

  // Optimization extras
  "bulk-rename": "no-comparison",
  favicon: "before-after",
  "image-to-pdf": "no-comparison",
  "optimize-for-web": "before-after",
  "pdf-to-image": "custom-results",

  // Adjustments extra
  "replace-color": "before-after",
  "color-blindness": "before-after",

  // AI tools
  "remove-background": "before-after",
  "remove-gif-background": "before-after",
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
  "ocr-pdf": "custom-results",
  "transcribe-audio": "no-comparison",
  "auto-subtitles": "media-player",
  "background-replace": "before-after",
  "blur-background": "before-after",

  // Video tools
  "convert-video": "media-player",
  "compress-video": "media-player",
  "trim-video": "media-player",
  "mute-video": "media-player",
  "video-to-gif": "media-player",
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
  "video-to-webp": "media-player",
  "video-to-frames": "media-player",
  "merge-videos": "media-player",
  "replace-audio": "media-player",
  "burn-subtitles": "media-player",
  "embed-subtitles": "media-player",
  "extract-subtitles": "media-player",
  "images-to-video": "media-player",
  "video-metadata": "media-player",

  // Audio tools
  "audio-channels": "media-player",
  "audio-metadata": "media-player",
  "audio-speed": "media-player",
  "convert-audio": "media-player",
  "extract-audio": "media-player",
  "fade-audio": "media-player",
  "merge-audio": "media-player",
  "noise-reduction": "media-player",
  "normalize-audio": "media-player",
  "pitch-shift": "media-player",
  "reverse-audio": "media-player",
  "ringtone-maker": "media-player",
  "silence-removal": "media-player",
  "split-audio": "no-comparison",
  "trim-audio": "media-player",
  "volume-adjust": "media-player",
  "waveform-image": "no-comparison",

  // PDF & Document tools
  "convert-document": "no-comparison",
  "convert-presentation": "no-comparison",
  "convert-spreadsheet": "no-comparison",
  "excel-to-pdf": "document",
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
  "sign-pdf": "interactive-sign",
  "pdf-to-text": "no-comparison",
  "pdf-to-word": "no-comparison",
  "pdf-metadata": "no-comparison",
  "powerpoint-to-pdf": "document",
  "html-to-pdf": "document",
  "markdown-to-docx": "no-comparison",
  "markdown-to-html": "no-comparison",
  "markdown-to-pdf": "document",
  "epub-convert": "no-comparison",
  "to-epub": "no-comparison",

  // File tools
  "chart-maker": "no-comparison",
  "csv-excel": "no-comparison",
  "csv-json": "no-comparison",
  "json-xml": "no-comparison",
  "split-csv": "no-comparison",
  "merge-csvs": "no-comparison",
  "yaml-json": "no-comparison",
  "xml-to-csv": "no-comparison",
  "create-zip": "no-comparison",
  "extract-zip": "no-comparison",
};

// Each conversion preset mirrors the display mode of its base tool (e.g.
// jpg-to-png follows "convert"). Generated here so the 83 presets never drift
// from the static map above. Every displayBase is one of the keys defined
// statically, so the lookup always resolves.
for (const preset of CONVERSION_PRESETS) {
  const baseMode = TOOL_DISPLAY_MODES[BASE_CONFIG[preset.base].displayBase];
  // The pdf-to-image base renders "custom-results" with a dedicated page-picker
  // UI backed by usePdfToImageStore. Presets use the shared
  // ConversionPresetSettings + generic download flow instead, which has no such
  // ResultsPanel, so they render as a plain converter (no-comparison) like the
  // sibling image-to-pdf / convert-spreadsheet presets.
  TOOL_DISPLAY_MODES[preset.id] = baseMode === "custom-results" ? "no-comparison" : baseMode;
}

/**
 * Tools whose selected files all post in ONE request as repeated "file" parts.
 * Consumed by use-tool-processor; backend routes declare maxInputs.
 */
export const MULTI_FILE_TOOLS: ReadonlySet<string> = new Set([
  "create-zip",
  "merge-audio",
  "merge-csvs",
  "merge-pdf",
  "merge-videos",
  "replace-audio",
  "burn-subtitles",
  "embed-subtitles",
  "images-to-video",
  "sprite-sheet",
]);
