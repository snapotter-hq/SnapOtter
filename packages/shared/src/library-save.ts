import { BASE_CONFIG, CONVERSION_PRESETS } from "./conversion-presets.js";

/**
 * Tools where the library save-mode choice (#495) does not work end to end,
 * so the selector must stay hidden: the tool's hand-written route ignores the
 * multipart fileId/saveMode pair, so a library-sourced edit is never
 * auto-saved (the pre-#495 status quo).
 *
 * When wiring one of these up (parse fileId/saveMode in the route like
 * tool-factory.ts, append them in the client like sign-pdf-settings.tsx),
 * remove it from this set so the selector appears. The integration suite
 * pins the other direction: every tool NOT listed here returns 400 for an
 * invalid saveMode. (#565 wired the five custom-client submitters that had a
 * ready route but a submitter that dropped the pair: ocr, erase-object,
 * remove-background, background-replace, blur-background.)
 */
export const LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS: ReadonlySet<string> = new Set([
  // Custom routes without fileId/saveMode handling
  "barcode-generate",
  "barcode-read",
  "beautify",
  "bulk-rename",
  "collage",
  "color-palette",
  "compare",
  "compose",
  "content-aware-resize",
  "edit-metadata",
  "favicon",
  "find-duplicates",
  "gif-tools",
  "html-to-image",
  "image-enhancement",
  "image-to-base64",
  "image-to-pdf",
  "info",
  "meme-generator",
  "optimize-for-web",
  "passport-photo",
  "pdf-to-image",
  "qr-generate",
  "split",
  "stitch",
  "strip-metadata",
  "vectorize",
  "watermark-image",
  // Conversion presets served by the custom image-to-pdf / pdf-to-image /
  // svg-to-raster routes (the registry group rides the factory and works)
  ...CONVERSION_PRESETS.filter((p) => BASE_CONFIG[p.base]?.group !== "registry").map((p) => p.id),
]);
