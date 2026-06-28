import type { Modality } from "./modality.js";
import { generateConversionKeywords } from "./search/format-aliases.js";
import type { Tool, ToolCategory } from "./types.js";

/** Which factory path a preset uses on the API side. */
export type PresetGroup = "registry" | "image-to-pdf" | "pdf-to-image" | "svg-to-raster";

/** Settings UI family for the shared web settings component. */
export type PresetSettingsKind = "none" | "quality" | "pdf" | "video";

export interface ConversionPreset {
  id: string;
  from: string;
  to: string;
  base: string;
  /** Settings forced into the base process call (e.g. { format: "png" }). */
  locked: Record<string, unknown>;
  /** Input extensions this preset accepts (narrows the base). */
  sourceInputs: string[];
}

interface BaseConfig {
  group: PresetGroup;
  modality: Modality;
  outputModality?: Modality;
  category: ToolCategory;
  settingsKind: PresetSettingsKind;
  /** The base tool id whose displayMode the web side mirrors. */
  displayBase: string;
}

/** Per-base routing/config. category may override the base tool's own category for grouping. */
export const BASE_CONFIG: Record<string, BaseConfig> = {
  convert: {
    group: "registry",
    modality: "image",
    category: "format",
    settingsKind: "quality",
    displayBase: "convert",
  },
  vectorize: {
    group: "registry",
    modality: "image",
    category: "format",
    settingsKind: "none",
    displayBase: "vectorize",
  },
  "svg-to-raster": {
    group: "svg-to-raster",
    modality: "image",
    category: "format",
    settingsKind: "quality",
    displayBase: "svg-to-raster",
  },
  "image-to-pdf": {
    group: "image-to-pdf",
    modality: "image",
    outputModality: "document",
    category: "format",
    settingsKind: "pdf",
    displayBase: "image-to-pdf",
  },
  "pdf-to-image": {
    group: "pdf-to-image",
    modality: "document",
    outputModality: "image",
    category: "pdf-organize",
    settingsKind: "none",
    displayBase: "pdf-to-image",
  },
  "convert-video": {
    group: "registry",
    modality: "video",
    category: "video-convert",
    settingsKind: "video",
    displayBase: "convert-video",
  },
  "video-to-gif": {
    group: "registry",
    modality: "video",
    outputModality: "image",
    category: "video-convert",
    settingsKind: "none",
    displayBase: "video-to-gif",
  },
  "gif-to-video": {
    group: "registry",
    modality: "video",
    category: "video-convert",
    settingsKind: "none",
    displayBase: "convert-video",
  },
  "extract-audio": {
    group: "registry",
    modality: "video",
    outputModality: "audio",
    category: "video-convert",
    settingsKind: "none",
    displayBase: "convert-video",
  },
  "convert-audio": {
    group: "registry",
    modality: "audio",
    category: "audio-convert",
    settingsKind: "none",
    displayBase: "convert-audio",
  },
  "convert-spreadsheet": {
    group: "registry",
    modality: "document",
    category: "doc-convert",
    settingsKind: "none",
    displayBase: "convert-spreadsheet",
  },
};

const JPG = [".jpg", ".jpeg"];
const PNG = [".png"];
const WEBP = [".webp"];
const GIF = [".gif"];
const TIFF = [".tiff", ".tif"];
const HEIC = [".heic", ".heif"];
const PSD = [".psd"];
const EPS = [".eps"];
const SVG = [".svg", ".svgz"];
const PDF = [".pdf"];

/** image raster pairs on `convert` */
function img(
  id: string,
  from: string,
  to: string,
  format: string,
  sourceInputs: string[],
): ConversionPreset {
  return { id, from, to, base: "convert", locked: { format }, sourceInputs };
}

export const CONVERSION_PRESETS: ConversionPreset[] = [
  // Image raster (base: convert)
  img("jpg-to-png", "JPG", "PNG", "png", JPG),
  img("png-to-jpg", "PNG", "JPG", "jpg", PNG),
  img("jpg-to-webp", "JPG", "WebP", "webp", JPG),
  img("png-to-webp", "PNG", "WebP", "webp", PNG),
  img("webp-to-jpg", "WebP", "JPG", "jpg", WEBP),
  img("webp-to-png", "WebP", "PNG", "png", WEBP),
  img("jpg-to-avif", "JPG", "AVIF", "avif", JPG),
  img("png-to-avif", "PNG", "AVIF", "avif", PNG),
  img("webp-to-avif", "WebP", "AVIF", "avif", WEBP),
  img("heic-to-jpg", "HEIC", "JPG", "jpg", HEIC),
  img("heic-to-png", "HEIC", "PNG", "png", HEIC),
  img("heic-to-avif", "HEIC", "AVIF", "avif", HEIC),
  img("jpg-to-gif", "JPG", "GIF", "gif", JPG),
  img("png-to-gif", "PNG", "GIF", "gif", PNG),
  img("gif-to-jpg", "GIF", "JPG", "jpg", GIF),
  img("gif-to-png", "GIF", "PNG", "png", GIF),
  img("webp-to-gif", "WebP", "GIF", "gif", WEBP),
  img("jpg-to-tiff", "JPG", "TIFF", "tiff", JPG),
  img("png-to-tiff", "PNG", "TIFF", "tiff", PNG),
  img("tiff-to-jpg", "TIFF", "JPG", "jpg", TIFF),
  img("tiff-to-png", "TIFF", "PNG", "png", TIFF),
  img("psd-to-jpg", "PSD", "JPG", "jpg", PSD),
  img("psd-to-png", "PSD", "PNG", "png", PSD),
  img("png-to-eps", "PNG", "EPS", "eps", PNG),
  img("jpg-to-eps", "JPG", "EPS", "eps", JPG),
  img("eps-to-png", "EPS", "PNG", "png", EPS),
  img("eps-to-jpg", "EPS", "JPG", "jpg", EPS),

  // Image vector
  { id: "png-to-svg", from: "PNG", to: "SVG", base: "vectorize", locked: {}, sourceInputs: PNG },
  { id: "jpg-to-svg", from: "JPG", to: "SVG", base: "vectorize", locked: {}, sourceInputs: JPG },
  { id: "tiff-to-svg", from: "TIFF", to: "SVG", base: "vectorize", locked: {}, sourceInputs: TIFF },
  { id: "psd-to-svg", from: "PSD", to: "SVG", base: "vectorize", locked: {}, sourceInputs: PSD },
  { id: "eps-to-svg", from: "EPS", to: "SVG", base: "vectorize", locked: {}, sourceInputs: EPS },
  {
    id: "svg-to-png",
    from: "SVG",
    to: "PNG",
    base: "svg-to-raster",
    locked: { outputFormat: "png" },
    sourceInputs: SVG,
  },
  {
    id: "svg-to-jpg",
    from: "SVG",
    to: "JPG",
    base: "svg-to-raster",
    locked: { outputFormat: "jpg" },
    sourceInputs: SVG,
  },

  // Image -> PDF (base: image-to-pdf)
  { id: "jpg-to-pdf", from: "JPG", to: "PDF", base: "image-to-pdf", locked: {}, sourceInputs: JPG },
  { id: "png-to-pdf", from: "PNG", to: "PDF", base: "image-to-pdf", locked: {}, sourceInputs: PNG },
  {
    id: "heic-to-pdf",
    from: "HEIC",
    to: "PDF",
    base: "image-to-pdf",
    locked: {},
    sourceInputs: HEIC,
  },
  {
    id: "tiff-to-pdf",
    from: "TIFF",
    to: "PDF",
    base: "image-to-pdf",
    locked: {},
    sourceInputs: TIFF,
  },
  {
    id: "webp-to-pdf",
    from: "WebP",
    to: "PDF",
    base: "image-to-pdf",
    locked: {},
    sourceInputs: WEBP,
  },
  { id: "gif-to-pdf", from: "GIF", to: "PDF", base: "image-to-pdf", locked: {}, sourceInputs: GIF },
  { id: "eps-to-pdf", from: "EPS", to: "PDF", base: "image-to-pdf", locked: {}, sourceInputs: EPS },

  // PDF -> image (base: pdf-to-image)
  {
    id: "pdf-to-jpg",
    from: "PDF",
    to: "JPG",
    base: "pdf-to-image",
    locked: { format: "jpg" },
    sourceInputs: PDF,
  },
  {
    id: "pdf-to-png",
    from: "PDF",
    to: "PNG",
    base: "pdf-to-image",
    locked: { format: "png" },
    sourceInputs: PDF,
  },
  {
    id: "pdf-to-tiff",
    from: "PDF",
    to: "TIFF",
    base: "pdf-to-image",
    locked: { format: "tiff" },
    sourceInputs: PDF,
  },

  // Video container (base: convert-video)
  {
    id: "mov-to-mp4",
    from: "MOV",
    to: "MP4",
    base: "convert-video",
    locked: { format: "mp4" },
    sourceInputs: [".mov"],
  },
  {
    id: "webm-to-mp4",
    from: "WEBM",
    to: "MP4",
    base: "convert-video",
    locked: { format: "mp4" },
    sourceInputs: [".webm"],
  },
  {
    id: "mkv-to-mp4",
    from: "MKV",
    to: "MP4",
    base: "convert-video",
    locked: { format: "mp4" },
    sourceInputs: [".mkv"],
  },
  {
    id: "avi-to-mp4",
    from: "AVI",
    to: "MP4",
    base: "convert-video",
    locked: { format: "mp4" },
    sourceInputs: [".avi"],
  },
  {
    id: "mp4-to-mov",
    from: "MP4",
    to: "MOV",
    base: "convert-video",
    locked: { format: "mov" },
    sourceInputs: [".mp4"],
  },
  {
    id: "mp4-to-webm",
    from: "MP4",
    to: "WEBM",
    base: "convert-video",
    locked: { format: "webm" },
    sourceInputs: [".mp4"],
  },
  {
    id: "webm-to-mov",
    from: "WEBM",
    to: "MOV",
    base: "convert-video",
    locked: { format: "mov" },
    sourceInputs: [".webm"],
  },
  {
    id: "mkv-to-mov",
    from: "MKV",
    to: "MOV",
    base: "convert-video",
    locked: { format: "mov" },
    sourceInputs: [".mkv"],
  },
  {
    id: "avi-to-mov",
    from: "AVI",
    to: "MOV",
    base: "convert-video",
    locked: { format: "mov" },
    sourceInputs: [".avi"],
  },
  // Video container (Tweak: convert-video needs avi/mkv output, Task 5)
  {
    id: "mp4-to-avi",
    from: "MP4",
    to: "AVI",
    base: "convert-video",
    locked: { format: "avi" },
    sourceInputs: [".mp4"],
  },
  {
    id: "mov-to-avi",
    from: "MOV",
    to: "AVI",
    base: "convert-video",
    locked: { format: "avi" },
    sourceInputs: [".mov"],
  },
  {
    id: "mkv-to-avi",
    from: "MKV",
    to: "AVI",
    base: "convert-video",
    locked: { format: "avi" },
    sourceInputs: [".mkv"],
  },
  {
    id: "avi-to-mkv",
    from: "AVI",
    to: "MKV",
    base: "convert-video",
    locked: { format: "mkv" },
    sourceInputs: [".avi"],
  },

  // Video -> GIF (base: video-to-gif), registered via group "registry" delegating to video-to-gif
  {
    id: "mp4-to-gif",
    from: "MP4",
    to: "GIF",
    base: "video-to-gif",
    locked: {},
    sourceInputs: [".mp4"],
  },
  {
    id: "mov-to-gif",
    from: "MOV",
    to: "GIF",
    base: "video-to-gif",
    locked: {},
    sourceInputs: [".mov"],
  },
  {
    id: "mkv-to-gif",
    from: "MKV",
    to: "GIF",
    base: "video-to-gif",
    locked: {},
    sourceInputs: [".mkv"],
  },
  {
    id: "avi-to-gif",
    from: "AVI",
    to: "GIF",
    base: "video-to-gif",
    locked: {},
    sourceInputs: [".avi"],
  },

  // GIF -> video (base: gif-to-video)
  {
    id: "gif-to-mp4",
    from: "GIF",
    to: "MP4",
    base: "gif-to-video",
    locked: { format: "mp4" },
    sourceInputs: GIF,
  },
  {
    id: "gif-to-webm",
    from: "GIF",
    to: "WEBM",
    base: "gif-to-video",
    locked: { format: "webm" },
    sourceInputs: GIF,
  },
  {
    id: "gif-to-mov",
    from: "GIF",
    to: "MOV",
    base: "gif-to-video",
    locked: { format: "mov" },
    sourceInputs: GIF,
  }, // Tweak

  // Video -> audio (base: extract-audio)
  {
    id: "mp4-to-mp3",
    from: "MP4",
    to: "MP3",
    base: "extract-audio",
    locked: { format: "mp3" },
    sourceInputs: [".mp4"],
  },
  {
    id: "mov-to-mp3",
    from: "MOV",
    to: "MP3",
    base: "extract-audio",
    locked: { format: "mp3" },
    sourceInputs: [".mov"],
  },
  {
    id: "mkv-to-mp3",
    from: "MKV",
    to: "MP3",
    base: "extract-audio",
    locked: { format: "mp3" },
    sourceInputs: [".mkv"],
  },
  {
    id: "webm-to-mp3",
    from: "WEBM",
    to: "MP3",
    base: "extract-audio",
    locked: { format: "mp3" },
    sourceInputs: [".webm"],
  },
  {
    id: "avi-to-mp3",
    from: "AVI",
    to: "MP3",
    base: "extract-audio",
    locked: { format: "mp3" },
    sourceInputs: [".avi"],
  },
  {
    id: "mp4-to-wav",
    from: "MP4",
    to: "WAV",
    base: "extract-audio",
    locked: { format: "wav" },
    sourceInputs: [".mp4"],
  },
  {
    id: "mov-to-wav",
    from: "MOV",
    to: "WAV",
    base: "extract-audio",
    locked: { format: "wav" },
    sourceInputs: [".mov"],
  },
  {
    id: "mp4-to-ogg",
    from: "MP4",
    to: "OGG",
    base: "extract-audio",
    locked: { format: "ogg" },
    sourceInputs: [".mp4"],
  }, // Tweak

  // Audio (base: convert-audio)
  {
    id: "m4a-to-mp3",
    from: "M4A",
    to: "MP3",
    base: "convert-audio",
    locked: { format: "mp3" },
    sourceInputs: [".m4a"],
  },
  {
    id: "m4a-to-wav",
    from: "M4A",
    to: "WAV",
    base: "convert-audio",
    locked: { format: "wav" },
    sourceInputs: [".m4a"],
  },
  {
    id: "aac-to-mp3",
    from: "AAC",
    to: "MP3",
    base: "convert-audio",
    locked: { format: "mp3" },
    sourceInputs: [".aac"],
  },
  {
    id: "aac-to-wav",
    from: "AAC",
    to: "WAV",
    base: "convert-audio",
    locked: { format: "wav" },
    sourceInputs: [".aac"],
  },
  {
    id: "aac-to-flac",
    from: "AAC",
    to: "FLAC",
    base: "convert-audio",
    locked: { format: "flac" },
    sourceInputs: [".aac"],
  },
  {
    id: "ogg-to-mp3",
    from: "OGG",
    to: "MP3",
    base: "convert-audio",
    locked: { format: "mp3" },
    sourceInputs: [".ogg"],
  },
  {
    id: "ogg-to-wav",
    from: "OGG",
    to: "WAV",
    base: "convert-audio",
    locked: { format: "wav" },
    sourceInputs: [".ogg"],
  },
  {
    id: "wav-to-mp3",
    from: "WAV",
    to: "MP3",
    base: "convert-audio",
    locked: { format: "mp3" },
    sourceInputs: [".wav"],
  },
  {
    id: "mp3-to-wav",
    from: "MP3",
    to: "WAV",
    base: "convert-audio",
    locked: { format: "wav" },
    sourceInputs: [".mp3"],
  },
  {
    id: "flac-to-mp3",
    from: "FLAC",
    to: "MP3",
    base: "convert-audio",
    locked: { format: "mp3" },
    sourceInputs: [".flac"],
  },

  // Data (base: convert-spreadsheet)
  {
    id: "excel-to-csv",
    from: "Excel",
    to: "CSV",
    base: "convert-spreadsheet",
    locked: { format: "csv" },
    sourceInputs: [".xlsx", ".xls"],
  },
];

/** Icon per base modality (lucide names already used elsewhere in the catalog). */
const ICON_BY_GROUP: Record<string, string> = {
  image: "FileType",
  video: "FileVideo",
  audio: "FileAudio",
  document: "FileType",
};

/**
 * Expand presets into full Tool objects. Reads executionHint/modality from the
 * base tool in TOOLS (mirrors it), applies the BASE_CONFIG category override,
 * sets route = `/<id>`, sourceInputs as acceptedInputs, and auto-generates keywords.
 * `baseTools` is injected to avoid a circular import with constants.ts.
 */
export function expandConversionPresets(baseTools?: Pick<Tool, "id" | "executionHint">[]): Tool[] {
  return CONVERSION_PRESETS.map((p) => {
    const cfg = BASE_CONFIG[p.base];
    if (!cfg) throw new Error(`No BASE_CONFIG for base "${p.base}" (preset ${p.id})`);
    const base = baseTools?.find((t) => t.id === p.base);
    const executionHint = base?.executionHint ?? (cfg.modality === "image" ? "fast" : "long");
    return {
      id: p.id,
      name: `${p.from} to ${p.to}`,
      description: `Convert ${p.from} to ${p.to}`,
      category: cfg.category,
      icon: ICON_BY_GROUP[cfg.modality] ?? "FileType",
      route: `/${p.id}`,
      modality: cfg.modality,
      acceptedInputs: p.sourceInputs,
      outputModality: cfg.outputModality,
      executionHint,
      keywords: generateConversionKeywords({ from: p.from, to: p.to }),
    } satisfies Tool;
  });
}

export const CONVERSION_PRESET_BY_ID: Record<string, ConversionPreset> = Object.fromEntries(
  CONVERSION_PRESETS.map((p) => [p.id, p]),
);
