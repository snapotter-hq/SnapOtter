import type { OptimizeForWebOptions, Sharp } from "../types.js";

export async function optimizeForWeb(image: Sharp, options: OptimizeForWebOptions): Promise<Sharp> {
  const {
    format,
    quality,
    maxWidth,
    maxHeight,
    progressive = true,
    stripMetadata = true,
  } = options;

  let pipeline = image;

  // Step 1: Resize if max dimensions are set
  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Step 2: Preserve metadata only if requested
  // Sharp strips metadata by default on output, so we only need to act
  // when the user wants to KEEP metadata.
  if (!stripMetadata) {
    pipeline = pipeline.withMetadata();
  }

  // Step 3: Convert to target format with optimized settings
  switch (format) {
    case "webp":
      return pipeline.webp({ quality, effort: 4 });
    case "jpeg":
      return pipeline.jpeg({ quality, progressive, mozjpeg: true });
    case "avif":
      return pipeline.avif({ quality, effort: 4 });
    case "png":
      return pipeline.png({ compressionLevel: 9, palette: true });
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
