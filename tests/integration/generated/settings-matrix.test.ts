import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { cancelAcceptedJobAndWait } from "../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures -- one canonical file per modality
// ---------------------------------------------------------------------------
const IMG = () => readFixture(fixtures.image.base.png200);
const VID = () => readFixture(fixtures.video.tiny("mp4"));
const AUD = () => readFixture(fixtures.audio.tiny("mp3"));
const PDF = () => readFixture(fixtures.document.pdf3);
const CSV = () => readFixture(fixtures.data.csv);
const JSON_F = () => readFixture(fixtures.data.json);
const XML_F = () => readFixture(fixtures.data.xml);
const YAML_F = () => readFixture(fixtures.data.yaml);
const DOCX = () => readFixture(fixtures.document.tiny("docx"));
const XLSX = () => readFixture(fixtures.document.tiny("xlsx"));
const PPTX = () => readFixture(fixtures.document.tiny("pptx"));
const HTML = () => readFixture(fixtures.document.tiny("html"));
const MD = () => readFixture(fixtures.document.tiny("md"));
const EPUB = () => readFixture(fixtures.document.tiny("epub"));
const GIF = () => readFixture(fixtures.image.animated.gif);
const SRT = () => readFixture(fixtures.video.subs.srt);
const WAV = () => readFixture(fixtures.audio.tiny("wav"));

// ---------------------------------------------------------------------------
// Fixture + filename resolver per tool modality
// ---------------------------------------------------------------------------
type FixtureSpec = { buffer: () => Buffer; filename: string };

const IMAGE_FIX: FixtureSpec = { buffer: IMG, filename: "test.png" };
const VIDEO_FIX: FixtureSpec = { buffer: VID, filename: "test.mp4" };
const AUDIO_FIX: FixtureSpec = { buffer: AUD, filename: "test.mp3" };
const PDF_FIX: FixtureSpec = { buffer: PDF, filename: "test.pdf" };
const CSV_FIX: FixtureSpec = { buffer: CSV, filename: "test.csv" };

const TOOL_FIXTURE: Record<string, FixtureSpec> = {
  // Image tools
  resize: IMAGE_FIX,
  compress: IMAGE_FIX,
  convert: IMAGE_FIX,
  crop: IMAGE_FIX,
  rotate: IMAGE_FIX,
  "watermark-text": IMAGE_FIX,
  border: IMAGE_FIX,
  "adjust-colors": IMAGE_FIX,
  sharpening: IMAGE_FIX,
  "color-blindness": IMAGE_FIX,
  "image-enhancement": IMAGE_FIX,
  "strip-metadata": IMAGE_FIX,
  pixelate: IMAGE_FIX,
  "image-pad": IMAGE_FIX,
  vignette: IMAGE_FIX,
  duotone: IMAGE_FIX,
  "lqip-placeholder": IMAGE_FIX,
  "sprite-sheet": IMAGE_FIX,
  "text-overlay": IMAGE_FIX,
  "replace-color": IMAGE_FIX,
  stitch: IMAGE_FIX,
  "optimize-for-web": IMAGE_FIX,
  "transparency-fixer": IMAGE_FIX,
  split: IMAGE_FIX,
  "image-to-pdf": IMAGE_FIX,
  "image-to-base64": IMAGE_FIX,
  "svg-to-raster": IMAGE_FIX,
  "smart-crop": IMAGE_FIX,
  "content-aware-resize": IMAGE_FIX,
  // Video tools
  "convert-video": VIDEO_FIX,
  "compress-video": VIDEO_FIX,
  "trim-video": VIDEO_FIX,
  "video-to-gif": VIDEO_FIX,
  "resize-video": VIDEO_FIX,
  "crop-video": VIDEO_FIX,
  "rotate-video": VIDEO_FIX,
  "change-fps": VIDEO_FIX,
  "video-color": VIDEO_FIX,
  "video-speed": VIDEO_FIX,
  "stabilize-video": VIDEO_FIX,
  "gif-to-video": { buffer: GIF, filename: "test.gif" },
  "video-to-webp": VIDEO_FIX,
  "video-to-frames": VIDEO_FIX,
  "aspect-pad": VIDEO_FIX,
  "blur-pad": VIDEO_FIX,
  "watermark-video": VIDEO_FIX,
  "burn-subtitles": VIDEO_FIX,
  "embed-subtitles": VIDEO_FIX,
  "images-to-video": IMAGE_FIX,
  // Audio tools
  "convert-audio": AUDIO_FIX,
  "trim-audio": AUDIO_FIX,
  "extract-audio": VIDEO_FIX,
  "volume-adjust": AUDIO_FIX,
  "fade-audio": AUDIO_FIX,
  "audio-speed": AUDIO_FIX,
  "pitch-shift": AUDIO_FIX,
  "audio-channels": AUDIO_FIX,
  "silence-removal": AUDIO_FIX,
  "noise-reduction": AUDIO_FIX,
  "merge-audio": AUDIO_FIX,
  "split-audio": AUDIO_FIX,
  "ringtone-maker": AUDIO_FIX,
  "waveform-image": AUDIO_FIX,
  "audio-metadata": AUDIO_FIX,
  // PDF/document tools
  "split-pdf": PDF_FIX,
  "compress-pdf": PDF_FIX,
  "protect-pdf": PDF_FIX,
  "rotate-pdf": PDF_FIX,
  "extract-pages": PDF_FIX,
  "remove-pages": PDF_FIX,
  "crop-pdf": PDF_FIX,
  "nup-pdf": PDF_FIX,
  "booklet-pdf": PDF_FIX,
  "organize-pdf": PDF_FIX,
  "redact-pdf": PDF_FIX,
  "pdf-metadata": PDF_FIX,
  "pdf-page-numbers": PDF_FIX,
  "pdf-to-image": PDF_FIX,
  "watermark-pdf": PDF_FIX,
  "unlock-pdf": PDF_FIX,
  "convert-document": { buffer: DOCX, filename: "test.docx" },
  "convert-spreadsheet": { buffer: XLSX, filename: "test.xlsx" },
  "convert-presentation": { buffer: PPTX, filename: "test.pptx" },
  "epub-convert": { buffer: EPUB, filename: "test.epub" },
  "ocr-pdf": PDF_FIX,
  // File tools
  "csv-excel": CSV_FIX,
  "csv-json": CSV_FIX,
  "json-xml": { buffer: JSON_F, filename: "test.json" },
  "split-csv": CSV_FIX,
  // Chart (CSV input)
  "chart-maker": CSV_FIX,
};

// ---------------------------------------------------------------------------
// Static settings variation map
//
// Every tool with user-facing settings gets explicit variations derived from
// its Zod schema. Tools with empty schemas ({}) are omitted -- the format
// matrix already covers them. For each field we test:
//   - Enum: every value
//   - Number min/max: min, max, and a mid value
//   - Boolean: true and false
//
// Small schemas get cartesian products; large schemas get per-field
// independent variations with other fields at defaults.
// ---------------------------------------------------------------------------

interface Variation {
  label: string;
  settings: Record<string, unknown>;
}

const SETTINGS_VARIATIONS: Record<string, Variation[]> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IMAGE TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  resize: [
    { label: "width only", settings: { width: 100 } },
    { label: "height only", settings: { height: 100 } },
    { label: "both dimensions", settings: { width: 100, height: 100 } },
    { label: "fit contain", settings: { width: 100, fit: "contain" } },
    { label: "fit cover", settings: { width: 100, fit: "cover" } },
    { label: "fit fill", settings: { width: 100, fit: "fill" } },
    { label: "fit inside", settings: { width: 100, fit: "inside" } },
    { label: "fit outside", settings: { width: 100, fit: "outside" } },
    { label: "min boundary", settings: { width: 1 } },
    { label: "max boundary", settings: { width: 16383 } },
    { label: "without enlargement true", settings: { width: 100, withoutEnlargement: true } },
    { label: "without enlargement false", settings: { width: 100, withoutEnlargement: false } },
    { label: "percentage 25", settings: { percentage: 25 } },
    { label: "percentage 50", settings: { percentage: 50 } },
    { label: "percentage 200", settings: { percentage: 200 } },
  ],

  compress: [
    { label: "quality mode low", settings: { mode: "quality", quality: 1 } },
    { label: "quality mode mid", settings: { mode: "quality", quality: 50 } },
    { label: "quality mode high", settings: { mode: "quality", quality: 100 } },
    { label: "target size small", settings: { mode: "targetSize", targetSizeKb: 10 } },
    { label: "target size large", settings: { mode: "targetSize", targetSizeKb: 500 } },
  ],

  convert: [
    { label: "format jpg", settings: { format: "jpg" } },
    { label: "format png", settings: { format: "png" } },
    { label: "format webp", settings: { format: "webp" } },
    { label: "format avif", settings: { format: "avif" } },
    { label: "format tiff", settings: { format: "tiff" } },
    { label: "format gif", settings: { format: "gif" } },
    { label: "format bmp", settings: { format: "bmp" } },
    { label: "format ppm", settings: { format: "ppm" } },
    { label: "format tga", settings: { format: "tga" } },
    { label: "format qoi", settings: { format: "qoi" } },
    { label: "jpg with quality 1", settings: { format: "jpg", quality: 1 } },
    { label: "jpg with quality 100", settings: { format: "jpg", quality: 100 } },
    { label: "webp with quality 50", settings: { format: "webp", quality: 50 } },
  ],

  crop: [
    { label: "small region px", settings: { left: 0, top: 0, width: 50, height: 50 } },
    { label: "offset region", settings: { left: 10, top: 10, width: 50, height: 50 } },
    { label: "unit px", settings: { left: 0, top: 0, width: 50, height: 50, unit: "px" } },
    {
      label: "unit percent",
      settings: { left: 0, top: 0, width: 50, height: 50, unit: "percent" },
    },
  ],

  rotate: [
    { label: "angle 0", settings: { angle: 0, horizontal: false, vertical: false } },
    { label: "angle 90", settings: { angle: 90 } },
    { label: "angle 180", settings: { angle: 180 } },
    { label: "angle 270", settings: { angle: 270 } },
    { label: "angle 45", settings: { angle: 45 } },
    { label: "horizontal flip", settings: { angle: 0, horizontal: true, vertical: false } },
    { label: "vertical flip", settings: { angle: 0, horizontal: false, vertical: true } },
    { label: "both flips", settings: { angle: 0, horizontal: true, vertical: true } },
    { label: "angle + flip", settings: { angle: 90, horizontal: true } },
  ],

  "watermark-text": [
    { label: "position center", settings: { text: "TEST", position: "center" } },
    { label: "position top-left", settings: { text: "TEST", position: "top-left" } },
    { label: "position top-right", settings: { text: "TEST", position: "top-right" } },
    { label: "position bottom-left", settings: { text: "TEST", position: "bottom-left" } },
    { label: "position bottom-right", settings: { text: "TEST", position: "bottom-right" } },
    { label: "position tiled", settings: { text: "TEST", position: "tiled" } },
    { label: "min font size", settings: { text: "TEST", fontSize: 8 } },
    { label: "max font size", settings: { text: "TEST", fontSize: 1000 } },
    { label: "min opacity", settings: { text: "TEST", opacity: 0 } },
    { label: "max opacity", settings: { text: "TEST", opacity: 100 } },
    { label: "rotation 45", settings: { text: "TEST", rotation: 45 } },
    { label: "rotation -45", settings: { text: "TEST", rotation: -45 } },
  ],

  border: [
    { label: "thin border", settings: { borderWidth: 1 } },
    { label: "thick border", settings: { borderWidth: 100 } },
    { label: "with padding", settings: { borderWidth: 10, padding: 20 } },
    { label: "corner radius", settings: { borderWidth: 10, cornerRadius: 20 } },
    { label: "shadow on", settings: { borderWidth: 10, shadow: true } },
    { label: "shadow off", settings: { borderWidth: 10, shadow: false } },
    {
      label: "shadow custom",
      settings: {
        borderWidth: 10,
        shadow: true,
        shadowBlur: 50,
        shadowOffsetX: 10,
        shadowOffsetY: 10,
        shadowOpacity: 80,
      },
    },
    { label: "zero border", settings: { borderWidth: 0 } },
    { label: "max border", settings: { borderWidth: 2000 } },
  ],

  "adjust-colors": [
    { label: "brightness min", settings: { brightness: -100 } },
    { label: "brightness max", settings: { brightness: 100 } },
    { label: "contrast min", settings: { contrast: -100 } },
    { label: "contrast max", settings: { contrast: 100 } },
    { label: "exposure mid", settings: { exposure: 50 } },
    { label: "saturation min", settings: { saturation: -100 } },
    { label: "saturation max", settings: { saturation: 100 } },
    { label: "temperature warm", settings: { temperature: 100 } },
    { label: "temperature cool", settings: { temperature: -100 } },
    { label: "tint shift", settings: { tint: 50 } },
    { label: "hue min", settings: { hue: -180 } },
    { label: "hue max", settings: { hue: 180 } },
    { label: "sharpness max", settings: { sharpness: 100 } },
    { label: "red channel", settings: { red: 0 } },
    { label: "green channel", settings: { green: 200 } },
    { label: "blue channel low", settings: { blue: 0 } },
    { label: "effect grayscale", settings: { effect: "grayscale" } },
    { label: "effect sepia", settings: { effect: "sepia" } },
    { label: "effect invert", settings: { effect: "invert" } },
    { label: "effect none", settings: { effect: "none" } },
  ],

  sharpening: [
    { label: "method adaptive", settings: { method: "adaptive" } },
    { label: "method unsharp-mask", settings: { method: "unsharp-mask" } },
    { label: "method high-pass", settings: { method: "high-pass" } },
    { label: "adaptive sigma min", settings: { method: "adaptive", sigma: 0.5 } },
    { label: "adaptive sigma max", settings: { method: "adaptive", sigma: 10 } },
    { label: "unsharp amount max", settings: { method: "unsharp-mask", amount: 1000 } },
    { label: "unsharp radius max", settings: { method: "unsharp-mask", radius: 5 } },
    { label: "high-pass strength max", settings: { method: "high-pass", strength: 100 } },
    { label: "high-pass kernelSize 5", settings: { method: "high-pass", kernelSize: 5 } },
    { label: "denoise light", settings: { method: "adaptive", denoise: "light" } },
    { label: "denoise medium", settings: { method: "adaptive", denoise: "medium" } },
    { label: "denoise strong", settings: { method: "adaptive", denoise: "strong" } },
    { label: "denoise off", settings: { method: "adaptive", denoise: "off" } },
  ],

  "color-blindness": [
    { label: "protanopia", settings: { simulationType: "protanopia" } },
    { label: "deuteranopia", settings: { simulationType: "deuteranopia" } },
    { label: "tritanopia", settings: { simulationType: "tritanopia" } },
    { label: "protanomaly", settings: { simulationType: "protanomaly" } },
    { label: "deuteranomaly", settings: { simulationType: "deuteranomaly" } },
    { label: "tritanomaly", settings: { simulationType: "tritanomaly" } },
    { label: "achromatopsia", settings: { simulationType: "achromatopsia" } },
    { label: "blueConeMonochromacy", settings: { simulationType: "blueConeMonochromacy" } },
  ],

  "image-enhancement": [
    { label: "mode auto", settings: { mode: "auto" } },
    { label: "mode portrait", settings: { mode: "portrait" } },
    { label: "mode landscape", settings: { mode: "landscape" } },
    { label: "mode low-light", settings: { mode: "low-light" } },
    { label: "mode food", settings: { mode: "food" } },
    { label: "mode document", settings: { mode: "document" } },
    { label: "intensity min", settings: { intensity: 0 } },
    { label: "intensity max", settings: { intensity: 100 } },
    {
      label: "corrections all off",
      settings: {
        corrections: {
          exposure: false,
          contrast: false,
          whiteBalance: false,
          saturation: false,
          sharpness: false,
          denoise: false,
        },
      },
    },
    {
      label: "corrections all on",
      settings: {
        corrections: {
          exposure: true,
          contrast: true,
          whiteBalance: true,
          saturation: true,
          sharpness: true,
          denoise: true,
        },
      },
    },
  ],

  "strip-metadata": [
    { label: "strip all", settings: { stripAll: true } },
    { label: "strip exif only", settings: { stripAll: false, stripExif: true } },
    { label: "strip gps only", settings: { stripAll: false, stripGps: true } },
    { label: "strip icc only", settings: { stripAll: false, stripIcc: true } },
    { label: "strip xmp only", settings: { stripAll: false, stripXmp: true } },
    {
      label: "strip none",
      settings: {
        stripAll: false,
        stripExif: false,
        stripGps: false,
        stripIcc: false,
        stripXmp: false,
      },
    },
  ],

  pixelate: [
    { label: "block size min", settings: { blockSize: 2 } },
    { label: "block size mid", settings: { blockSize: 64 } },
    { label: "block size max", settings: { blockSize: 128 } },
    {
      label: "with region",
      settings: { blockSize: 12, region: { left: 0, top: 0, width: 50, height: 50 } },
    },
  ],

  "image-pad": [
    { label: "target 16:9", settings: { target: "16:9" } },
    { label: "target 9:16", settings: { target: "9:16" } },
    { label: "target 1:1", settings: { target: "1:1" } },
    { label: "target 4:3", settings: { target: "4:3" } },
    { label: "target 3:4", settings: { target: "3:4" } },
    { label: "custom color", settings: { target: "1:1", color: "#ff0000" } },
  ],

  vignette: [
    { label: "strength min", settings: { strength: 0.1 } },
    { label: "strength mid", settings: { strength: 0.5 } },
    { label: "strength max", settings: { strength: 1 } },
    { label: "custom color", settings: { strength: 0.5, color: "#ff0000" } },
  ],

  duotone: [
    { label: "default colors", settings: { shadow: "#1e3a8a", highlight: "#fbbf24" } },
    { label: "red blue", settings: { shadow: "#ff0000", highlight: "#0000ff" } },
    { label: "black white", settings: { shadow: "#000000", highlight: "#ffffff" } },
  ],

  "lqip-placeholder": [
    { label: "width min", settings: { width: 4 } },
    { label: "width mid", settings: { width: 32 } },
    { label: "width max", settings: { width: 64 } },
    { label: "blur 0", settings: { blur: 0 } },
    { label: "blur max", settings: { blur: 20 } },
    { label: "small no blur", settings: { width: 8, blur: 0 } },
  ],

  "sprite-sheet": [
    { label: "columns min", settings: { columns: 1 } },
    { label: "columns mid", settings: { columns: 8 } },
    { label: "columns max", settings: { columns: 16 } },
    { label: "with padding", settings: { columns: 4, padding: 16 } },
    { label: "padding max", settings: { columns: 4, padding: 64 } },
    { label: "custom background", settings: { columns: 4, background: "#000000" } },
  ],

  "text-overlay": [
    { label: "position top", settings: { text: "TEST", position: "top" } },
    { label: "position center", settings: { text: "TEST", position: "center" } },
    { label: "position bottom", settings: { text: "TEST", position: "bottom" } },
    { label: "min font size", settings: { text: "TEST", fontSize: 8 } },
    { label: "max font size", settings: { text: "TEST", fontSize: 200 } },
    { label: "background box on", settings: { text: "TEST", backgroundBox: true } },
    { label: "background box off", settings: { text: "TEST", backgroundBox: false } },
    { label: "shadow on", settings: { text: "TEST", shadow: true } },
    { label: "shadow off", settings: { text: "TEST", shadow: false } },
  ],

  "replace-color": [
    {
      label: "make transparent on",
      settings: { sourceColor: "#FF0000", targetColor: "#00FF00", makeTransparent: true },
    },
    {
      label: "make transparent off",
      settings: { sourceColor: "#FF0000", targetColor: "#00FF00", makeTransparent: false },
    },
    {
      label: "tolerance min",
      settings: { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 0 },
    },
    {
      label: "tolerance mid",
      settings: { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 128 },
    },
    {
      label: "tolerance max",
      settings: { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 255 },
    },
  ],

  stitch: [
    { label: "direction horizontal", settings: { direction: "horizontal" } },
    { label: "direction vertical", settings: { direction: "vertical" } },
    { label: "direction grid", settings: { direction: "grid", gridColumns: 2 } },
    { label: "resize mode fit", settings: { direction: "horizontal", resizeMode: "fit" } },
    {
      label: "resize mode original",
      settings: { direction: "horizontal", resizeMode: "original" },
    },
    { label: "resize mode stretch", settings: { direction: "horizontal", resizeMode: "stretch" } },
    { label: "resize mode crop", settings: { direction: "horizontal", resizeMode: "crop" } },
    { label: "alignment start", settings: { direction: "horizontal", alignment: "start" } },
    { label: "alignment center", settings: { direction: "horizontal", alignment: "center" } },
    { label: "alignment end", settings: { direction: "horizontal", alignment: "end" } },
    { label: "gap 100", settings: { direction: "horizontal", gap: 100 } },
    { label: "border 50", settings: { direction: "horizontal", border: 50 } },
    { label: "corner radius", settings: { direction: "horizontal", cornerRadius: 50 } },
    { label: "format jpeg", settings: { direction: "horizontal", format: "jpeg" } },
    { label: "format webp", settings: { direction: "horizontal", format: "webp" } },
    { label: "format avif", settings: { direction: "horizontal", format: "avif" } },
    { label: "format jxl", settings: { direction: "horizontal", format: "jxl" } },
    { label: "quality min", settings: { direction: "horizontal", quality: 1 } },
    { label: "quality max", settings: { direction: "horizontal", quality: 100 } },
  ],

  "optimize-for-web": [
    { label: "format webp", settings: { format: "webp" } },
    { label: "format jpeg", settings: { format: "jpeg" } },
    { label: "format avif", settings: { format: "avif" } },
    { label: "format png", settings: { format: "png" } },
    { label: "format jxl", settings: { format: "jxl" } },
    { label: "quality min", settings: { format: "webp", quality: 1 } },
    { label: "quality max", settings: { format: "webp", quality: 100 } },
    { label: "max width", settings: { format: "webp", maxWidth: 100 } },
    { label: "max height", settings: { format: "webp", maxHeight: 100 } },
    { label: "progressive true", settings: { format: "jpeg", progressive: true } },
    { label: "progressive false", settings: { format: "jpeg", progressive: false } },
    { label: "strip metadata true", settings: { format: "webp", stripMetadata: true } },
    { label: "strip metadata false", settings: { format: "webp", stripMetadata: false } },
  ],

  "transparency-fixer": [
    { label: "output png", settings: { outputFormat: "png" } },
    { label: "output webp", settings: { outputFormat: "webp" } },
    { label: "defringe 0", settings: { defringe: 0 } },
    { label: "defringe 100", settings: { defringe: 100 } },
    { label: "remove watermark true", settings: { removeWatermark: true } },
    { label: "remove watermark false", settings: { removeWatermark: false } },
  ],

  split: [
    { label: "3x3 grid", settings: { columns: 3, rows: 3 } },
    { label: "1x1 grid", settings: { columns: 1, rows: 1 } },
    { label: "10x10 grid", settings: { columns: 10, rows: 10 } },
    { label: "format png", settings: { columns: 2, rows: 2, outputFormat: "png" } },
    { label: "format jpg", settings: { columns: 2, rows: 2, outputFormat: "jpg" } },
    { label: "format webp", settings: { columns: 2, rows: 2, outputFormat: "webp" } },
    { label: "format avif", settings: { columns: 2, rows: 2, outputFormat: "avif" } },
    { label: "format jxl", settings: { columns: 2, rows: 2, outputFormat: "jxl" } },
    { label: "quality min", settings: { columns: 2, rows: 2, quality: 1 } },
    { label: "quality max", settings: { columns: 2, rows: 2, quality: 100 } },
  ],

  "image-to-pdf": [
    { label: "page size A4 portrait", settings: { pageSize: "A4", orientation: "portrait" } },
    { label: "page size A4 landscape", settings: { pageSize: "A4", orientation: "landscape" } },
    { label: "page size Letter", settings: { pageSize: "Letter" } },
    { label: "page size A3", settings: { pageSize: "A3" } },
    { label: "page size A5", settings: { pageSize: "A5" } },
    { label: "margin 0", settings: { margin: 0 } },
    { label: "margin 500", settings: { margin: 500 } },
    { label: "collate true", settings: { collate: true } },
    { label: "collate false", settings: { collate: false } },
  ],

  "image-to-base64": [
    { label: "format original", settings: { outputFormat: "original" } },
    { label: "format jpeg", settings: { outputFormat: "jpeg" } },
    { label: "format png", settings: { outputFormat: "png" } },
    { label: "format webp", settings: { outputFormat: "webp" } },
    { label: "format avif", settings: { outputFormat: "avif" } },
    { label: "format jxl", settings: { outputFormat: "jxl" } },
    { label: "quality min", settings: { quality: 1 } },
    { label: "quality max", settings: { quality: 100 } },
    { label: "max width limit", settings: { maxWidth: 50 } },
    { label: "max height limit", settings: { maxHeight: 50 } },
  ],

  "svg-to-raster": [
    { label: "format png", settings: { outputFormat: "png" } },
    { label: "format jpg", settings: { outputFormat: "jpg" } },
    { label: "format webp", settings: { outputFormat: "webp" } },
    { label: "format avif", settings: { outputFormat: "avif" } },
    { label: "format tiff", settings: { outputFormat: "tiff" } },
    { label: "format gif", settings: { outputFormat: "gif" } },
    { label: "format heif", settings: { outputFormat: "heif" } },
    { label: "format jxl", settings: { outputFormat: "jxl" } },
    { label: "dpi min", settings: { dpi: 36 } },
    { label: "dpi max", settings: { dpi: 2400 } },
    { label: "width set", settings: { width: 100 } },
    { label: "height set", settings: { height: 100 } },
    { label: "quality min", settings: { quality: 1 } },
    { label: "quality max", settings: { quality: 100 } },
    { label: "transparent bg", settings: { backgroundColor: "#00000000" } },
  ],

  "smart-crop": [
    { label: "mode subject", settings: { mode: "subject", width: 100, height: 100 } },
    { label: "mode face", settings: { mode: "face", width: 100, height: 100 } },
    { label: "mode trim", settings: { mode: "trim" } },
    { label: "mode attention alias", settings: { mode: "attention", width: 100, height: 100 } },
    { label: "mode content alias", settings: { mode: "content" } },
    {
      label: "strategy entropy",
      settings: { mode: "subject", strategy: "entropy", width: 100, height: 100 },
    },
    { label: "padding max", settings: { mode: "subject", width: 100, height: 100, padding: 50 } },
    {
      label: "face preset closeup",
      settings: { mode: "face", facePreset: "closeup", width: 100, height: 100 },
    },
    {
      label: "face preset upper-body",
      settings: { mode: "face", facePreset: "upper-body", width: 100, height: 100 },
    },
    {
      label: "sensitivity min",
      settings: { mode: "subject", width: 100, height: 100, sensitivity: 0 },
    },
    {
      label: "sensitivity max",
      settings: { mode: "subject", width: 100, height: 100, sensitivity: 1 },
    },
    {
      label: "pad to square",
      settings: { mode: "subject", width: 100, height: 100, padToSquare: true },
    },
  ],

  "content-aware-resize": [
    { label: "width only", settings: { width: 100 } },
    { label: "height only", settings: { height: 100 } },
    { label: "protect faces on", settings: { width: 100, protectFaces: true } },
    { label: "protect faces off", settings: { width: 100, protectFaces: false } },
    { label: "blur radius min", settings: { width: 100, blurRadius: 0 } },
    { label: "blur radius max", settings: { width: 100, blurRadius: 20 } },
    { label: "square mode", settings: { square: true } },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIDEO TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "convert-video": [
    { label: "format mp4", settings: { format: "mp4" } },
    { label: "format mov", settings: { format: "mov" } },
    { label: "format webm", settings: { format: "webm" } },
    { label: "quality high", settings: { format: "mp4", quality: "high" } },
    { label: "quality balanced", settings: { format: "mp4", quality: "balanced" } },
    { label: "quality small", settings: { format: "mp4", quality: "small" } },
  ],

  "compress-video": [
    { label: "quality light", settings: { quality: "light" } },
    { label: "quality balanced", settings: { quality: "balanced" } },
    { label: "quality strong", settings: { quality: "strong" } },
    { label: "resolution original", settings: { resolution: "original" } },
    { label: "resolution 1080p", settings: { resolution: "1080p" } },
    { label: "resolution 720p", settings: { resolution: "720p" } },
    { label: "resolution 480p", settings: { resolution: "480p" } },
    { label: "strong 480p", settings: { quality: "strong", resolution: "480p" } },
  ],

  "trim-video": [
    { label: "short clip", settings: { startS: 0, endS: 0.5 } },
    { label: "precise true", settings: { startS: 0, endS: 0.5, precise: true } },
    { label: "precise false", settings: { startS: 0, endS: 0.5, precise: false } },
  ],

  "video-to-gif": [
    { label: "fps min", settings: { fps: 1, width: 64, startS: 0, durationS: 1 } },
    { label: "fps max", settings: { fps: 30, width: 64, startS: 0, durationS: 1 } },
    { label: "width min", settings: { fps: 12, width: 64, startS: 0, durationS: 1 } },
    { label: "width max", settings: { fps: 12, width: 1280, startS: 0, durationS: 1 } },
    { label: "duration max", settings: { fps: 12, width: 64, startS: 0, durationS: 5 } },
  ],

  "resize-video": [
    { label: "preset 720p", settings: { preset: "720p" } },
    { label: "preset 480p", settings: { preset: "480p" } },
    { label: "preset 360p", settings: { preset: "360p" } },
    { label: "preset 1080p", settings: { preset: "1080p" } },
    { label: "custom width", settings: { preset: "custom", width: 320 } },
    { label: "custom height", settings: { preset: "custom", height: 240 } },
  ],

  "crop-video": [
    { label: "small crop", settings: { width: 32, height: 32, x: 0, y: 0 } },
    { label: "offset crop", settings: { width: 32, height: 32, x: 16, y: 16 } },
  ],

  "rotate-video": [
    { label: "cw90", settings: { transform: "cw90" } },
    { label: "ccw90", settings: { transform: "ccw90" } },
    { label: "180", settings: { transform: "180" } },
    { label: "hflip", settings: { transform: "hflip" } },
    { label: "vflip", settings: { transform: "vflip" } },
  ],

  "change-fps": [
    { label: "fps min", settings: { fps: 1 } },
    { label: "fps 24", settings: { fps: 24 } },
    { label: "fps 30", settings: { fps: 30 } },
    { label: "fps 60", settings: { fps: 60 } },
    { label: "fps max", settings: { fps: 120 } },
  ],

  "video-color": [
    { label: "brightness min", settings: { brightness: -1 } },
    { label: "brightness max", settings: { brightness: 1 } },
    { label: "contrast min", settings: { contrast: 0 } },
    { label: "contrast max", settings: { contrast: 4 } },
    { label: "saturation min", settings: { saturation: 0 } },
    { label: "saturation max", settings: { saturation: 3 } },
    { label: "gamma min", settings: { gamma: 0.1 } },
    { label: "gamma max", settings: { gamma: 10 } },
  ],

  "video-speed": [
    { label: "factor min (0.25x)", settings: { factor: 0.25 } },
    { label: "factor 2x", settings: { factor: 2 } },
    { label: "factor max (4x)", settings: { factor: 4 } },
    { label: "keep pitch true", settings: { factor: 2, keepPitch: true } },
    { label: "keep pitch false", settings: { factor: 2, keepPitch: false } },
  ],

  "stabilize-video": [
    { label: "smoothing min", settings: { smoothing: 5 } },
    { label: "smoothing mid", settings: { smoothing: 30 } },
    { label: "smoothing max", settings: { smoothing: 60 } },
  ],

  "gif-to-video": [
    { label: "format mp4", settings: { format: "mp4" } },
    { label: "format webm", settings: { format: "webm" } },
  ],

  "video-to-webp": [
    { label: "fps min", settings: { fps: 1, width: 64 } },
    { label: "fps max", settings: { fps: 30, width: 64 } },
    { label: "width min", settings: { width: 16 } },
    { label: "width max", settings: { width: 1920 } },
    { label: "quality min", settings: { quality: 1 } },
    { label: "quality max", settings: { quality: 100 } },
    { label: "loop true", settings: { loop: true } },
    { label: "loop false", settings: { loop: false } },
  ],

  "video-to-frames": [
    { label: "mode all png", settings: { mode: "all", format: "png" } },
    { label: "mode all jpg", settings: { mode: "all", format: "jpg" } },
    { label: "mode nth n=2", settings: { mode: "nth", n: 2 } },
    { label: "mode nth n=100", settings: { mode: "nth", n: 100 } },
    { label: "mode timestamps", settings: { mode: "timestamps", timestamps: "0" } },
  ],

  "aspect-pad": [
    { label: "target 16:9", settings: { target: "16:9" } },
    { label: "target 9:16", settings: { target: "9:16" } },
    { label: "target 1:1", settings: { target: "1:1" } },
    { label: "target 4:3", settings: { target: "4:3" } },
    { label: "target 3:4", settings: { target: "3:4" } },
    { label: "custom color", settings: { target: "1:1", color: "#ff0000" } },
  ],

  "blur-pad": [
    { label: "target 16:9", settings: { target: "16:9" } },
    { label: "target 9:16", settings: { target: "9:16" } },
    { label: "target 1:1", settings: { target: "1:1" } },
    { label: "target 4:3", settings: { target: "4:3" } },
    { label: "target 3:4", settings: { target: "3:4" } },
    { label: "blur min", settings: { target: "1:1", blur: 2 } },
    { label: "blur mid", settings: { target: "1:1", blur: 25 } },
    { label: "blur max", settings: { target: "1:1", blur: 50 } },
  ],

  "watermark-video": [
    { label: "position tl", settings: { text: "TEST", position: "tl" } },
    { label: "position br", settings: { text: "TEST", position: "br" } },
    { label: "position c", settings: { text: "TEST", position: "c" } },
    { label: "position tc", settings: { text: "TEST", position: "tc" } },
    { label: "position bc", settings: { text: "TEST", position: "bc" } },
    { label: "position l", settings: { text: "TEST", position: "l" } },
    { label: "position r", settings: { text: "TEST", position: "r" } },
    { label: "position tr", settings: { text: "TEST", position: "tr" } },
    { label: "position bl", settings: { text: "TEST", position: "bl" } },
    { label: "font size min", settings: { text: "TEST", fontSize: 8 } },
    { label: "font size max", settings: { text: "TEST", fontSize: 120 } },
    { label: "opacity min", settings: { text: "TEST", opacity: 0.05 } },
    { label: "opacity max", settings: { text: "TEST", opacity: 1 } },
  ],

  "burn-subtitles": [
    { label: "font size min", settings: { fontSize: 8 } },
    { label: "font size default", settings: { fontSize: 24 } },
    { label: "font size max", settings: { fontSize: 72 } },
  ],

  "embed-subtitles": [
    { label: "language eng", settings: { language: "eng" } },
    { label: "language fra", settings: { language: "fra" } },
    { label: "language deu", settings: { language: "deu" } },
  ],

  "images-to-video": [
    { label: "2s per image", settings: { secondsPerImage: 2 } },
    { label: "0.5s per image", settings: { secondsPerImage: 0.5 } },
    { label: "10s per image", settings: { secondsPerImage: 10 } },
    { label: "resolution 1080p", settings: { resolution: "1080p" } },
    { label: "resolution 720p", settings: { resolution: "720p" } },
    { label: "resolution square", settings: { resolution: "square" } },
    { label: "fps 10", settings: { fps: 10 } },
    { label: "fps 60", settings: { fps: 60 } },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUDIO TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "convert-audio": [
    { label: "format mp3", settings: { format: "mp3" } },
    { label: "format wav", settings: { format: "wav" } },
    { label: "format ogg", settings: { format: "ogg" } },
    { label: "format flac", settings: { format: "flac" } },
    { label: "format m4a", settings: { format: "m4a" } },
    { label: "bitrate min", settings: { format: "mp3", bitrateKbps: 32 } },
    { label: "bitrate mid", settings: { format: "mp3", bitrateKbps: 128 } },
    { label: "bitrate max", settings: { format: "mp3", bitrateKbps: 320 } },
    { label: "sample rate min", settings: { format: "mp3", sampleRate: 8000, bitrateKbps: 64 } },
    { label: "sample rate 44100", settings: { format: "mp3", sampleRate: 44100 } },
    { label: "sample rate max mp3", settings: { format: "mp3", sampleRate: 48000 } },
    { label: "sample rate max wav", settings: { format: "wav", sampleRate: 96000 } },
    { label: "sample rate ogg", settings: { format: "ogg", sampleRate: 44100 } },
    { label: "sample rate m4a", settings: { format: "m4a", sampleRate: 96000 } },
    { label: "sample rate flac", settings: { format: "flac", sampleRate: 48000 } },
  ],

  "trim-audio": [
    { label: "short clip", settings: { startS: 0, endS: 0.5 } },
    { label: "offset clip", settings: { startS: 0.1, endS: 0.5 } },
  ],

  "extract-audio": [
    { label: "format mp3", settings: { format: "mp3" } },
    { label: "format wav", settings: { format: "wav" } },
    { label: "format m4a", settings: { format: "m4a" } },
  ],

  "volume-adjust": [
    { label: "gain min", settings: { gainDb: -30 } },
    { label: "gain mid", settings: { gainDb: 0 } },
    { label: "gain max", settings: { gainDb: 30 } },
  ],

  "fade-audio": [
    { label: "fade in only", settings: { fadeInS: 0.5, fadeOutS: 0 } },
    { label: "fade out only", settings: { fadeInS: 0, fadeOutS: 0.5 } },
    { label: "both fades", settings: { fadeInS: 0.5, fadeOutS: 0.5 } },
    { label: "max fades", settings: { fadeInS: 30, fadeOutS: 30 } },
  ],

  "audio-speed": [
    { label: "factor min (0.25x)", settings: { factor: 0.25 } },
    { label: "factor 1.5x", settings: { factor: 1.5 } },
    { label: "factor max (4x)", settings: { factor: 4 } },
  ],

  "pitch-shift": [
    { label: "semitones up min", settings: { semitones: 1 } },
    { label: "semitones up max", settings: { semitones: 12 } },
    { label: "semitones down min", settings: { semitones: -1 } },
    { label: "semitones down max", settings: { semitones: -12 } },
  ],

  "audio-channels": [
    { label: "stereo to mono", settings: { mode: "stereo-to-mono" } },
    { label: "mono to stereo", settings: { mode: "mono-to-stereo" } },
    { label: "swap", settings: { mode: "swap" } },
  ],

  "silence-removal": [
    { label: "threshold min", settings: { thresholdDb: -80 } },
    { label: "threshold mid", settings: { thresholdDb: -50 } },
    { label: "threshold max", settings: { thresholdDb: -20 } },
    { label: "min silence min", settings: { minSilenceS: 0.1 } },
    { label: "min silence max", settings: { minSilenceS: 5 } },
  ],

  "noise-reduction": [
    { label: "strength light", settings: { strength: "light" } },
    { label: "strength medium", settings: { strength: "medium" } },
    { label: "strength strong", settings: { strength: "strong" } },
  ],

  "merge-audio": [
    { label: "format mp3", settings: { format: "mp3" } },
    { label: "format wav", settings: { format: "wav" } },
    { label: "format flac", settings: { format: "flac" } },
    { label: "format m4a", settings: { format: "m4a" } },
  ],

  "split-audio": [
    { label: "mode time default", settings: { mode: "time", segmentS: 60 } },
    { label: "mode time short", settings: { mode: "time", segmentS: 1 } },
    { label: "mode time long", settings: { mode: "time", segmentS: 3600 } },
    { label: "mode parts 2", settings: { mode: "parts", parts: 2 } },
    { label: "mode parts 10", settings: { mode: "parts", parts: 10 } },
    { label: "mode parts 20", settings: { mode: "parts", parts: 20 } },
    { label: "mode silence default", settings: { mode: "silence" } },
    {
      label: "mode silence sensitive",
      settings: { mode: "silence", thresholdDb: -20, minSilenceS: 0.1 },
    },
    {
      label: "mode silence relaxed",
      settings: { mode: "silence", thresholdDb: -80, minSilenceS: 10 },
    },
  ],

  "ringtone-maker": [
    { label: "start 0 duration 30", settings: { startS: 0, durationS: 30 } },
    { label: "start offset", settings: { startS: 0.1, durationS: 1 } },
    { label: "min duration", settings: { startS: 0, durationS: 1 } },
  ],

  "waveform-image": [
    { label: "width min", settings: { width: 256 } },
    { label: "width max", settings: { width: 3840 } },
    { label: "height min", settings: { height: 64 } },
    { label: "height max", settings: { height: 1080 } },
    { label: "custom color", settings: { color: "#ff0000" } },
  ],

  "audio-metadata": [
    { label: "strip true", settings: { strip: true } },
    { label: "strip false", settings: { strip: false } },
    { label: "set title", settings: { title: "Test Title" } },
    { label: "set artist", settings: { artist: "Test Artist" } },
    { label: "set album", settings: { album: "Test Album" } },
    { label: "all fields", settings: { title: "T", artist: "A", album: "B" } },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PDF / DOCUMENT TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "split-pdf": [
    { label: "range mode single page", settings: { mode: "range", range: "1" } },
    { label: "range mode multi page", settings: { mode: "range", range: "1-2" } },
    { label: "every mode 1", settings: { mode: "every", everyN: 1 } },
    { label: "every mode 2", settings: { mode: "every", everyN: 2 } },
  ],

  "compress-pdf": [
    { label: "preset screen", settings: { preset: "screen" } },
    { label: "preset ebook", settings: { preset: "ebook" } },
    { label: "preset printer", settings: { preset: "printer" } },
  ],

  "protect-pdf": [
    { label: "user password only", settings: { userPassword: "test123" } },
    { label: "both passwords", settings: { userPassword: "test123", ownerPassword: "owner456" } },
  ],

  "rotate-pdf": [
    { label: "angle 90", settings: { angle: 90 } },
    { label: "angle 180", settings: { angle: 180 } },
    { label: "angle 270", settings: { angle: 270 } },
    { label: "range 1", settings: { angle: 90, range: "1" } },
    { label: "range all", settings: { angle: 90, range: "1-z" } },
  ],

  "extract-pages": [
    { label: "single page", settings: { range: "1" } },
    { label: "page range", settings: { range: "1-2" } },
  ],

  "remove-pages": [
    { label: "remove page 1", settings: { pages: "1" } },
    { label: "remove page 3", settings: { pages: "3" } },
  ],

  "crop-pdf": [
    { label: "margin 0", settings: { margin: 0 } },
    { label: "margin 20", settings: { margin: 20 } },
    { label: "margin max", settings: { margin: 2000 } },
  ],

  "nup-pdf": [
    { label: "2 per sheet", settings: { perSheet: 2 } },
    { label: "4 per sheet", settings: { perSheet: 4 } },
    { label: "9 per sheet", settings: { perSheet: 9 } },
    { label: "16 per sheet", settings: { perSheet: 16 } },
  ],

  "booklet-pdf": [
    { label: "2 per sheet", settings: { perSheet: 2 } },
    { label: "4 per sheet", settings: { perSheet: 4 } },
  ],

  "organize-pdf": [
    { label: "reverse order", settings: { order: "3,2,1" } },
    { label: "single page", settings: { order: "1" } },
  ],

  "redact-pdf": [
    { label: "single term", settings: { terms: ["test"] } },
    { label: "multiple terms", settings: { terms: ["test", "hello"] } },
    { label: "case sensitive", settings: { terms: ["test"], caseSensitive: true } },
    { label: "case insensitive", settings: { terms: ["test"], caseSensitive: false } },
  ],

  "pdf-metadata": [
    { label: "set title", settings: { title: "Test Title" } },
    { label: "set author", settings: { author: "Test Author" } },
    { label: "set subject", settings: { subject: "Test Subject" } },
    { label: "set keywords", settings: { keywords: "test,keywords" } },
    { label: "all fields", settings: { title: "T", author: "A", subject: "S", keywords: "K" } },
  ],

  "pdf-page-numbers": [
    { label: "position bl", settings: { position: "bl" } },
    { label: "position bc", settings: { position: "bc" } },
    { label: "position br", settings: { position: "br" } },
    { label: "position tl", settings: { position: "tl" } },
    { label: "position tc", settings: { position: "tc" } },
    { label: "position tr", settings: { position: "tr" } },
    { label: "font size min", settings: { fontSize: 6 } },
    { label: "font size max", settings: { fontSize: 24 } },
  ],

  "pdf-to-image": [
    { label: "format png", settings: { format: "png" } },
    { label: "format jpg", settings: { format: "jpg" } },
    { label: "format webp", settings: { format: "webp" } },
    { label: "format avif", settings: { format: "avif" } },
    { label: "dpi min", settings: { dpi: 36 } },
    { label: "dpi 300", settings: { dpi: 300 } },
    { label: "quality min", settings: { quality: 1 } },
    { label: "quality max", settings: { quality: 100 } },
    { label: "color mode grayscale", settings: { colorMode: "grayscale" } },
    { label: "color mode bw", settings: { colorMode: "bw" } },
    { label: "pages first", settings: { pages: "1" } },
  ],

  "watermark-pdf": [
    { label: "position c", settings: { text: "TEST", position: "c" } },
    { label: "position tl", settings: { text: "TEST", position: "tl" } },
    { label: "position br", settings: { text: "TEST", position: "br" } },
    { label: "font size min", settings: { text: "TEST", fontSize: 6 } },
    { label: "font size max", settings: { text: "TEST", fontSize: 72 } },
    { label: "opacity min", settings: { text: "TEST", opacity: 0.05 } },
    { label: "opacity max", settings: { text: "TEST", opacity: 1 } },
    { label: "rotation 0", settings: { text: "TEST", rotation: 0 } },
    { label: "rotation 90", settings: { text: "TEST", rotation: 90 } },
    { label: "rotation -90", settings: { text: "TEST", rotation: -90 } },
  ],

  "unlock-pdf": [{ label: "with password", settings: { password: "testpass" } }],

  "convert-document": [
    { label: "format docx", settings: { format: "docx" } },
    { label: "format odt", settings: { format: "odt" } },
    { label: "format rtf", settings: { format: "rtf" } },
    { label: "format txt", settings: { format: "txt" } },
  ],

  "convert-spreadsheet": [
    { label: "format xlsx", settings: { format: "xlsx" } },
    { label: "format ods", settings: { format: "ods" } },
    { label: "format csv", settings: { format: "csv" } },
  ],

  "convert-presentation": [
    { label: "format pptx", settings: { format: "pptx" } },
    { label: "format odp", settings: { format: "odp" } },
  ],

  "epub-convert": [
    { label: "format pdf", settings: { format: "pdf" } },
    { label: "format docx", settings: { format: "docx" } },
    { label: "format html", settings: { format: "html" } },
    { label: "format md", settings: { format: "md" } },
  ],

  "ocr-pdf": [
    { label: "quality fast", settings: { quality: "fast" } },
    { label: "quality balanced", settings: { quality: "balanced" } },
    { label: "quality best", settings: { quality: "best" } },
    { label: "language en", settings: { language: "en" } },
    { label: "language auto", settings: { language: "auto" } },
    { label: "pages first", settings: { pages: "1" } },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DATA TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "csv-excel": [
    { label: "sheet 1", settings: { sheet: 1 } },
    { label: "sheet 2", settings: { sheet: 2 } },
  ],

  "csv-json": [
    { label: "pretty true", settings: { pretty: true } },
    { label: "pretty false", settings: { pretty: false } },
  ],

  "json-xml": [
    { label: "pretty true", settings: { pretty: true } },
    { label: "pretty false", settings: { pretty: false } },
  ],

  "split-csv": [
    { label: "rows 1", settings: { rowsPerFile: 1 } },
    { label: "rows 1000", settings: { rowsPerFile: 1000 } },
    { label: "keep header true", settings: { keepHeader: true } },
    { label: "keep header false", settings: { keepHeader: false } },
    { label: "rows 5 no header", settings: { rowsPerFile: 5, keepHeader: false } },
  ],

  "chart-maker": [
    { label: "kind bar", settings: { kind: "bar" } },
    { label: "kind line", settings: { kind: "line" } },
    { label: "kind pie", settings: { kind: "pie" } },
    { label: "with title", settings: { kind: "bar", title: "Test Chart" } },
    { label: "width min", settings: { kind: "bar", width: 320 } },
    { label: "width max", settings: { kind: "bar", width: 2048 } },
    { label: "height min", settings: { kind: "bar", height: 240 } },
    { label: "height max", settings: { kind: "bar", height: 1536 } },
  ],
};

// ---------------------------------------------------------------------------
// Tools that are AI-gated (need an installed bundle). These tools will
// return 501 FEATURE_NOT_INSTALLED which we accept as a valid non-crash
// response. We still exercise the settings validation path.
// ---------------------------------------------------------------------------
const AI_GATED_TOOLS = new Set([
  "noise-removal",
  "upscale",
  "colorize",
  "restore-photo",
  "remove-background",
  "erase-object",
  "passport-photo",
  "beautify",
  "image-enhancement",
  "transparency-fixer",
  "blur-background",
  "background-replace",
  "auto-subtitles",
  "transcribe-audio",
  "ocr",
  "ocr-pdf",
  "enhance-faces",
  "red-eye-removal",
  "blur-faces",
  "smart-crop",
  "content-aware-resize",
  "vectorize",
]);

// Tools that need a second input (subtitle or second image)
const MULTI_INPUT_TOOLS = new Set(["burn-subtitles", "embed-subtitles"]);

// Accepted status codes: 200 = success, 202 = async, 400 = bad settings,
// 422 = processing failure, 501 = feature not installed, 415 = wrong type
const ACCEPTED_STATUSES = new Set([200, 202, 400, 415, 422, 501]);

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("settings variation matrix", () => {
  let testApp: TestApp;
  let token: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    token = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  for (const [toolId, variations] of Object.entries(SETTINGS_VARIATIONS)) {
    describe(toolId, () => {
      for (const { label, settings } of variations) {
        it(label, async () => {
          const fixture = TOOL_FIXTURE[toolId];
          if (!fixture) {
            // No fixture mapped for this tool; skip gracefully
            return;
          }

          const fields: Array<{
            name: string;
            filename?: string;
            contentType?: string;
            content: Buffer | string;
          }> = [];

          // Primary file input
          fields.push({
            name: "file",
            filename: fixture.filename,
            contentType: "application/octet-stream",
            content: fixture.buffer(),
          });

          // Multi-input tools: add a second file
          if (MULTI_INPUT_TOOLS.has(toolId)) {
            fields.push({
              name: "file",
              filename: "subtitles.srt",
              contentType: "application/x-subrip",
              content: SRT(),
            });
          }

          // Settings field
          fields.push({
            name: "settings",
            content: JSON.stringify(settings),
          });

          const { body, contentType } = createMultipartPayload(fields);

          const res = await testApp.app.inject({
            method: "POST",
            url: apiToolPath(toolId),
            headers: {
              "content-type": contentType,
              authorization: `Bearer ${token}`,
            },
            payload: body,
          });

          // Core assertion: no 500 (internal server error / crash)
          expect(
            ACCEPTED_STATUSES.has(res.statusCode),
            `${toolId} [${label}]: got ${res.statusCode} -- ${res.body.slice(0, 500)}`,
          ).toBe(true);

          // For 200 responses, validate response shape
          if (res.statusCode === 200) {
            // Some tools (e.g. split) stream a ZIP binary instead of JSON.
            // Detect by "PK" magic bytes and skip JSON parsing.
            const isZip =
              res.headers["content-type"] === "application/zip" || res.body.startsWith("PK");
            if (isZip) {
              expect(res.body.length).toBeGreaterThan(0);
            } else {
              const json = JSON.parse(res.body);
              // image-to-base64 returns { results, errors } instead of downloadUrl
              expect(json.downloadUrl || json.jobId || json.results).toBeTruthy();
            }
          }

          // For 202 (async), just verify the jobId is present
          if (res.statusCode === 202) {
            const json = JSON.parse(res.body);
            expect(json.jobId).toBeTruthy();

            // Settings coverage ends once OCR accepts the validated request.
            // Cancel it so Fast/default cases cannot outlive the suite and
            // starve unrelated conversions running in parallel forks.
            if (toolId === "ocr" || toolId === "ocr-pdf") {
              await cancelAcceptedJobAndWait(json.jobId as string, "ai");
            }
          }
        }, 60_000); // Generous timeout for media processing tools
      }
    });
  }
});
