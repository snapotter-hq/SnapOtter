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

export type OutputFormat = "jpg" | "png" | "webp" | "avif" | "tiff" | "gif" | "heic" | "heif" | "jxl";

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
  unit?: "px" | "percent";
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

export interface EditMetadataOptions {
  artist?: string;
  copyright?: string;
  imageDescription?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  clearGps?: boolean;
  fieldsToRemove?: string[];
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  keywords?: string[];
  keywordsMode?: "add" | "set";
  dateShift?: string;
  setAllDates?: string;
  iptcTitle?: string;
  iptcHeadline?: string;
  iptcCity?: string;
  iptcState?: string;
  iptcCountry?: string;
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
  red: number; // 0-200 (100 = no change)
  green: number; // 0-200
  blue: number; // 0-200
}

export interface SharpenOptions {
  value: number; // 0 to 100
}

export type SharpenMethod = "adaptive" | "unsharp-mask" | "high-pass";

export interface SharpenAdvancedOptions {
  method: SharpenMethod;
  // Adaptive method params
  sigma?: number; // 0.5-10, Gaussian blur radius
  m1?: number; // 0-10, flat area sharpening
  m2?: number; // 0-20, textured area sharpening
  x1?: number; // 0-10, flat/jagged threshold
  y2?: number; // 0-50, max brightening (halo clamp)
  y3?: number; // 0-50, max darkening (halo clamp)
  // Unsharp mask params
  amount?: number; // 0-500, intensity percentage
  radius?: number; // 0.1-5.0, blur radius
  threshold?: number; // 0-255, minimum edge brightness
  // High-pass params
  strength?: number; // 0-100, blend strength
  kernelSize?: 3 | 5; // 3x3 or 5x5 kernel
  // Noise reduction
  denoise?: "off" | "light" | "medium" | "strong";
}

export type EnhancementMode = "auto" | "portrait" | "landscape" | "low-light" | "food" | "document";

export interface AnalysisScores {
  /** 0-100, 50 = ideal exposure */
  exposure: number;
  /** 0-100, 50 = ideal contrast */
  contrast: number;
  /** 0-100, 50 = neutral white balance */
  whiteBalance: number;
  /** 0-100, 50 = ideal saturation */
  saturation: number;
  /** 0-100, 50 = ideally sharp */
  sharpness: number;
  /** 0-100, 50 = no significant noise */
  noise: number;
}

export interface AnalysisResult {
  scores: AnalysisScores;
  /** CSS-filter-compatible correction values for live preview */
  corrections: CorrectionParams;
  /** Human-readable issue labels, e.g. ["underexposed", "color-cast"] */
  issues: string[];
  /** Best-guess preset for this image */
  suggestedMode: EnhancementMode;
}

export interface CorrectionParams {
  /** Maps to CSS brightness() and Sharp gamma. -100 to +100. */
  brightness: number;
  /** Maps to CSS contrast() and Sharp linear(). -100 to +100. */
  contrast: number;
  /** Maps to recomb matrix / CSS feColorMatrix. -100 to +100. */
  temperature: number;
  /** Maps to CSS saturate() and Sharp modulate(). -100 to +100. */
  saturation: number;
  /** Maps to SVG feConvolveMatrix and Sharp sharpen(). 0 to 100. */
  sharpness: number;
  /** Denoise strength. 0 = off, 1-5 = median kernel size. */
  denoise: number;
}

export interface OptimizeForWebOptions {
  format: "webp" | "jpeg" | "avif" | "png";
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  progressive?: boolean;
  stripMetadata?: boolean;
}
