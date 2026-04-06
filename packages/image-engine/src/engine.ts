import sharp from "sharp";
import { brightness } from "./operations/brightness.js";
import { colorChannels } from "./operations/color-channels.js";
import { compress } from "./operations/compress.js";
import { contrast } from "./operations/contrast.js";
import { convert } from "./operations/convert.js";
import { crop } from "./operations/crop.js";
import { editMetadata } from "./operations/edit-metadata.js";
import { flip } from "./operations/flip.js";
import { grayscale } from "./operations/grayscale.js";
import { invert } from "./operations/invert.js";
import { resize } from "./operations/resize.js";
import { rotate } from "./operations/rotate.js";
import { saturation } from "./operations/saturation.js";
import { sepia } from "./operations/sepia.js";
import { stripMetadata } from "./operations/strip-metadata.js";
import type {
  BrightnessOptions,
  ColorChannelOptions,
  CompressOptions,
  ContrastOptions,
  ConvertOptions,
  CropOptions,
  EditMetadataOptions,
  FlipOptions,
  OperationResult,
  OutputFormat,
  ResizeOptions,
  RotateOptions,
  SaturationOptions,
  Sharp,
  StripMetadataOptions,
} from "./types.js";
import { getImageInfo } from "./utils/metadata.js";

export interface Operation {
  type: string;
  options: Record<string, unknown>;
}

const OPERATION_MAP: Record<
  string,
  (image: Sharp, options: Record<string, unknown>) => Promise<Sharp>
> = {
  resize: (img, opts) => resize(img, opts as unknown as ResizeOptions),
  crop: (img, opts) => crop(img, opts as unknown as CropOptions),
  rotate: (img, opts) => rotate(img, opts as unknown as RotateOptions),
  flip: (img, opts) => flip(img, opts as unknown as FlipOptions),
  convert: (img, opts) => convert(img, opts as unknown as ConvertOptions),
  compress: (img, opts) => compress(img, opts as unknown as CompressOptions),
  "strip-metadata": (img, opts) => stripMetadata(img, opts as unknown as StripMetadataOptions),
  brightness: (img, opts) => brightness(img, opts as unknown as BrightnessOptions),
  contrast: (img, opts) => contrast(img, opts as unknown as ContrastOptions),
  saturation: (img, opts) => saturation(img, opts as unknown as SaturationOptions),
  "color-channels": (img, opts) => colorChannels(img, opts as unknown as ColorChannelOptions),
  grayscale: (img) => grayscale(img),
  sepia: (img) => sepia(img),
  invert: (img) => invert(img),
  "edit-metadata": (img, opts) => editMetadata(img, opts as unknown as EditMetadataOptions),
};

const FORMAT_MAP: Record<string, string> = {
  jpg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  tiff: "tiff",
  gif: "gif",
};

/**
 * Process an image through a pipeline of operations.
 *
 * @param input - The raw image buffer
 * @param operations - Array of operations to apply in sequence
 * @param outputFormat - Optional output format (defaults to input format)
 * @returns The processed image buffer and metadata
 */
export async function processImage(
  input: Buffer,
  operations: Operation[],
  outputFormat?: OutputFormat,
): Promise<OperationResult> {
  let image: Sharp = sharp(input);

  // Apply each operation in sequence
  for (const op of operations) {
    const handler = OPERATION_MAP[op.type];
    if (!handler) {
      throw new Error(`Unknown operation: ${op.type}`);
    }
    image = await handler(image, op.options);
  }

  // Convert to output format if specified
  if (outputFormat) {
    const sharpFormat = FORMAT_MAP[outputFormat];
    if (!sharpFormat) {
      throw new Error(`Unsupported output format: ${outputFormat}`);
    }
    image = image.toFormat(sharpFormat as keyof import("sharp").FormatEnum);
  }

  const buffer = await image.toBuffer();
  const info = await getImageInfo(buffer);

  return { buffer, info };
}
