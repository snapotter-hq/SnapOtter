/**
 * Tools whose contract does not fit the single-buffer process fn: multi-file,
 * ZIP or JSON output, no-input generators, custom AI routes. They expose an
 * HTTP route but are not in the pipeline/batch registry. If one of these gains
 * registry support, remove it here.
 *
 * Lives in a helper rather than beside its first assertion because two suites
 * now depend on it: tool-route-drift pins that nothing else is missing from the
 * registry, and image-container-independence pins that the image tools it
 * cannot drive are exactly the ones with a contract that says so.
 */
export const REGISTRY_EXEMPT = new Set([
  "auto-subtitles",
  "background-replace",
  "barcode-generate",
  "barcode-read",
  "blur-background",
  "bulk-rename",
  "collage",
  "color-palette",
  "compare",
  "compose",
  "erase-object",
  "favicon",
  "find-duplicates",
  "html-to-image",
  "image-to-base64",
  "image-to-pdf",
  "info",
  "pdf-to-image",
  "qr-generate",
  "sign-pdf",
  "stitch",
  "svg-to-raster",
  "transcribe-audio",
  "watermark-image",
  // Conversion presets riding the three custom ZIP routes above (image-to-pdf,
  // pdf-to-image, svg-to-raster). They share those routes' contracts, so like
  // their bases they are not in the process-fn registry.
  "jpg-to-pdf",
  "png-to-pdf",
  "heic-to-pdf",
  "tiff-to-pdf",
  "webp-to-pdf",
  "gif-to-pdf",
  "eps-to-pdf",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-to-tiff",
  "svg-to-png",
  "svg-to-jpg",
]);
