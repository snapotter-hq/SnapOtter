import type sharp from "sharp";

export type Sharp = sharp.Sharp;

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  channels: number;
  size: number;
  hasAlpha: boolean;
  metadata: Record<string, unknown>;
}

export interface OperationResult {
  buffer: Buffer;
  info: ImageInfo;
}

export type OutputFormat = "jpg" | "png" | "webp" | "avif" | "tiff" | "gif";

export interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "fill" | "inside" | "outside";
  withoutEnlargement?: boolean;
  percentage?: number;
}

export interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RotateOptions {
  angle: number;
  background?: string;
}

export interface FlipOptions {
  horizontal?: boolean;
  vertical?: boolean;
}

export interface ConvertOptions {
  format: OutputFormat;
  quality?: number;
}

export interface CompressOptions {
  quality?: number;
  targetSizeBytes?: number;
  format?: OutputFormat;
}

export interface StripMetadataOptions {
  stripExif?: boolean;
  stripGps?: boolean;
  stripIcc?: boolean;
  stripXmp?: boolean;
  stripAll?: boolean;
}

export interface BrightnessOptions {
  value: number; // -100 to +100
}

export interface ContrastOptions {
  value: number; // -100 to +100
}

export interface SaturationOptions {
  value: number; // -100 to +100
}

export interface ColorChannelOptions {
  red: number;   // 0-200 (100 = no change)
  green: number; // 0-200
  blue: number;  // 0-200
}
