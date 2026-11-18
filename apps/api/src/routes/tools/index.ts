import { TOOLS } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { registerConversionPresets } from "./conversion-presets.js";
import { registerPopularTools } from "./popular.js";

const DISABLED_TOOLS_KEY = "disabledTools";

function parseDisabledTools(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      { err, key: DISABLED_TOOLS_KEY },
      "tools: failed to parse stored disabledTools JSON",
    );
    return [];
  }

  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
    logger.warn(
      { key: DISABLED_TOOLS_KEY },
      "tools: stored disabledTools is not a JSON array of strings",
    );
    return [];
  }

  return parsed;
}

/**
 * Registry that imports and registers all tool routes.
 * Each tool uses the createToolRoute factory from tool-factory.ts.
 *
 * Tools listed in the `disabledTools` setting or marked `experimental`
 * (when `enableExperimentalTools` is off) are skipped at startup.
 */
export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  // Register non-tool utility endpoints (not subject to disable/experimental skip logic)
  await registerPopularTools(app);

  // Read disabled tools from settings
  const [disabledRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, DISABLED_TOOLS_KEY));
  const disabledTools: string[] =
    disabledRow && disabledRow.value !== "" ? parseDisabledTools(disabledRow.value) : [];

  // Read experimental flag
  const [expRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "enableExperimentalTools"));
  const enableExperimental = expRow?.value === "true";

  // Get experimental tool IDs from shared constants
  const experimentalToolIds = TOOLS.filter((t) => t.experimental).map((t) => t.id);

  // Build skip set
  const skipTools = new Set([...disabledTools, ...(enableExperimental ? [] : experimentalToolIds)]);

  // Loaders, not static imports: a skipped tool never loads its module, so it
  // adds nothing to boot time.
  const toolLoaders: Record<string, () => Promise<(app: FastifyInstance) => void>> = {
    // Essentials
    resize: () => import("./resize.js").then((m) => m.registerResize),
    crop: () => import("./crop.js").then((m) => m.registerCrop),
    rotate: () => import("./rotate.js").then((m) => m.registerRotate),
    convert: () => import("./convert.js").then((m) => m.registerConvert),
    compress: () => import("./compress.js").then((m) => m.registerCompress),
    "strip-metadata": () => import("./strip-metadata.js").then((m) => m.registerStripMetadata),
    "edit-metadata": () => import("./edit-metadata.js").then((m) => m.registerEditMetadata),
    "adjust-colors": () => import("./adjust-colors.js").then((m) => m.registerColorAdjustments),
    sharpening: () => import("./sharpening.js").then((m) => m.registerSharpening),

    // Watermark & Overlay
    "watermark-text": () => import("./watermark-text.js").then((m) => m.registerWatermarkText),
    "watermark-image": () => import("./watermark-image.js").then((m) => m.registerWatermarkImage),
    "text-overlay": () => import("./text-overlay.js").then((m) => m.registerTextOverlay),
    compose: () => import("./compose.js").then((m) => m.registerCompose),
    "meme-generator": () => import("./meme-generator.js").then((m) => m.registerMemeGenerator),

    // Utilities
    info: () => import("./info.js").then((m) => m.registerInfo),
    compare: () => import("./compare.js").then((m) => m.registerCompare),
    "find-duplicates": () => import("./find-duplicates.js").then((m) => m.registerFindDuplicates),
    "color-palette": () => import("./color-palette.js").then((m) => m.registerColorPalette),
    "qr-generate": () => import("./qr-generate.js").then((m) => m.registerQrGenerate),
    "html-to-image": () => import("./html-to-image.js").then((m) => m.registerHtmlToImage),
    "barcode-generate": () =>
      import("./barcode-generate.js").then((m) => m.registerBarcodeGenerate),
    "barcode-read": () => import("./barcode-read.js").then((m) => m.registerBarcodeRead),
    "image-to-base64": () => import("./image-to-base64.js").then((m) => m.registerImageToBase64),

    // Layout & Composition
    collage: () => import("./collage.js").then((m) => m.registerCollage),
    stitch: () => import("./stitch.js").then((m) => m.registerStitch),
    split: () => import("./split.js").then((m) => m.registerSplit),
    border: () => import("./border.js").then((m) => m.registerBorder),
    beautify: () => import("./beautify.js").then((m) => m.registerBeautify),
    "circle-crop": () => import("./circle-crop.js").then((m) => m.registerCircleCrop),
    "rounded-crop": () => import("./rounded-crop.js").then((m) => m.registerRoundedCrop),
    duotone: () => import("./duotone.js").then((m) => m.registerDuotone),
    histogram: () => import("./histogram.js").then((m) => m.registerHistogram),
    "image-pad": () => import("./image-pad.js").then((m) => m.registerImagePad),
    "lqip-placeholder": () =>
      import("./lqip-placeholder.js").then((m) => m.registerLqipPlaceholder),
    pixelate: () => import("./pixelate.js").then((m) => m.registerPixelate),
    "sprite-sheet": () => import("./sprite-sheet.js").then((m) => m.registerSpriteSheet),
    vignette: () => import("./vignette.js").then((m) => m.registerVignette),

    // Format & Conversion
    "svg-to-raster": () => import("./svg-to-raster.js").then((m) => m.registerSvgToRaster),
    vectorize: () => import("./vectorize.js").then((m) => m.registerVectorize),
    "gif-tools": () => import("./gif-tools.js").then((m) => m.registerGifTools),
    "gif-webp": () => import("./gif-webp.js").then((m) => m.registerGifWebp),
    "pdf-to-image": () => import("./pdf-to-image.js").then((m) => m.registerPdfToImage),

    // Optimization extras
    "bulk-rename": () => import("./bulk-rename.js").then((m) => m.registerBulkRename),
    favicon: () => import("./favicon.js").then((m) => m.registerFavicon),
    "image-to-pdf": () => import("./image-to-pdf.js").then((m) => m.registerImageToPdf),
    "optimize-for-web": () => import("./optimize-for-web.js").then((m) => m.registerOptimizeForWeb),

    // Adjustments extra
    "replace-color": () => import("./replace-color.js").then((m) => m.registerReplaceColor),
    "color-blindness": () => import("./color-blindness.js").then((m) => m.registerColorBlindness),

    // Video
    "aspect-pad": () => import("./aspect-pad.js").then((m) => m.registerAspectPad),
    "blur-pad": () => import("./blur-pad.js").then((m) => m.registerBlurPad),
    "burn-subtitles": () => import("./burn-subtitles.js").then((m) => m.registerBurnSubtitles),
    "change-fps": () => import("./change-fps.js").then((m) => m.registerChangeFps),
    "compress-video": () => import("./compress-video.js").then((m) => m.registerCompressVideo),
    "convert-video": () => import("./convert-video.js").then((m) => m.registerConvertVideo),
    "crop-video": () => import("./crop-video.js").then((m) => m.registerCropVideo),
    "embed-subtitles": () => import("./embed-subtitles.js").then((m) => m.registerEmbedSubtitles),
    "extract-subtitles": () =>
      import("./extract-subtitles.js").then((m) => m.registerExtractSubtitles),
    "gif-to-video": () => import("./gif-to-video.js").then((m) => m.registerGifToVideo),
    "images-to-video": () => import("./images-to-video.js").then((m) => m.registerImagesToVideo),
    "merge-videos": () => import("./merge-videos.js").then((m) => m.registerMergeVideos),
    "mute-video": () => import("./mute-video.js").then((m) => m.registerMuteVideo),
    "replace-audio": () => import("./replace-audio.js").then((m) => m.registerReplaceAudio),
    "resize-video": () => import("./resize-video.js").then((m) => m.registerResizeVideo),
    "reverse-video": () => import("./reverse-video.js").then((m) => m.registerReverseVideo),
    "rotate-video": () => import("./rotate-video.js").then((m) => m.registerRotateVideo),
    "stabilize-video": () => import("./stabilize-video.js").then((m) => m.registerStabilizeVideo),
    "trim-video": () => import("./trim-video.js").then((m) => m.registerTrimVideo),
    "video-color": () => import("./video-color.js").then((m) => m.registerVideoColor),
    "video-loudnorm": () => import("./video-loudnorm.js").then((m) => m.registerVideoLoudnorm),
    "video-metadata": () => import("./video-metadata.js").then((m) => m.registerVideoMetadata),
    "video-speed": () => import("./video-speed.js").then((m) => m.registerVideoSpeed),
    "video-to-frames": () => import("./video-to-frames.js").then((m) => m.registerVideoToFrames),
    "video-to-gif": () => import("./video-to-gif.js").then((m) => m.registerVideoToGif),
    "video-to-webp": () => import("./video-to-webp.js").then((m) => m.registerVideoToWebp),
    "watermark-video": () => import("./watermark-video.js").then((m) => m.registerWatermarkVideo),

    // Audio
    "audio-channels": () => import("./audio-channels.js").then((m) => m.registerAudioChannels),
    "audio-metadata": () => import("./audio-metadata.js").then((m) => m.registerAudioMetadata),
    "audio-speed": () => import("./audio-speed.js").then((m) => m.registerAudioSpeed),
    "convert-audio": () => import("./convert-audio.js").then((m) => m.registerConvertAudio),
    "extract-audio": () => import("./extract-audio.js").then((m) => m.registerExtractAudio),
    "fade-audio": () => import("./fade-audio.js").then((m) => m.registerFadeAudio),
    "merge-audio": () => import("./merge-audio.js").then((m) => m.registerMergeAudio),
    "noise-reduction": () => import("./noise-reduction.js").then((m) => m.registerNoiseReduction),
    "normalize-audio": () => import("./normalize-audio.js").then((m) => m.registerNormalizeAudio),
    "pitch-shift": () => import("./pitch-shift.js").then((m) => m.registerPitchShift),
    "reverse-audio": () => import("./reverse-audio.js").then((m) => m.registerReverseAudio),
    "ringtone-maker": () => import("./ringtone-maker.js").then((m) => m.registerRingtoneMaker),
    "silence-removal": () => import("./silence-removal.js").then((m) => m.registerSilenceRemoval),
    "split-audio": () => import("./split-audio.js").then((m) => m.registerSplitAudio),
    "trim-audio": () => import("./trim-audio.js").then((m) => m.registerTrimAudio),
    "volume-adjust": () => import("./volume-adjust.js").then((m) => m.registerVolumeAdjust),
    "waveform-image": () => import("./waveform-image.js").then((m) => m.registerWaveformImage),

    // PDF & Documents
    "convert-document": () =>
      import("./convert-document.js").then((m) => m.registerConvertDocument),
    "convert-presentation": () =>
      import("./convert-presentation.js").then((m) => m.registerConvertPresentation),
    "convert-spreadsheet": () =>
      import("./convert-spreadsheet.js").then((m) => m.registerConvertSpreadsheet),
    "epub-convert": () => import("./epub-convert.js").then((m) => m.registerEpubConvert),
    "excel-to-pdf": () => import("./excel-to-pdf.js").then((m) => m.registerExcelToPdf),
    "merge-pdf": () => import("./merge-pdf.js").then((m) => m.registerMergePdf),
    "split-pdf": () => import("./split-pdf.js").then((m) => m.registerSplitPdf),
    "compress-pdf": () => import("./compress-pdf.js").then((m) => m.registerCompressPdf),
    "rotate-pdf": () => import("./rotate-pdf.js").then((m) => m.registerRotatePdf),
    "word-to-pdf": () => import("./word-to-pdf.js").then((m) => m.registerWordToPdf),
    "extract-pages": () => import("./extract-pages.js").then((m) => m.registerExtractPages),
    "remove-pages": () => import("./remove-pages.js").then((m) => m.registerRemovePages),
    "organize-pdf": () => import("./organize-pdf.js").then((m) => m.registerOrganizePdf),
    "multi-tool-pdf": () => import("./multi-tool-pdf.js").then((m) => m.registerMultiToolPdf),
    "protect-pdf": () => import("./protect-pdf.js").then((m) => m.registerProtectPdf),
    "unlock-pdf": () => import("./unlock-pdf.js").then((m) => m.registerUnlockPdf),
    "repair-pdf": () => import("./repair-pdf.js").then((m) => m.registerRepairPdf),
    "linearize-pdf": () => import("./linearize-pdf.js").then((m) => m.registerLinearizePdf),
    "grayscale-pdf": () => import("./grayscale-pdf.js").then((m) => m.registerGrayscalePdf),
    "pdfa-convert": () => import("./pdfa-convert.js").then((m) => m.registerPdfaConvert),
    "crop-pdf": () => import("./crop-pdf.js").then((m) => m.registerCropPdf),
    "nup-pdf": () => import("./nup-pdf.js").then((m) => m.registerNupPdf),
    "booklet-pdf": () => import("./booklet-pdf.js").then((m) => m.registerBookletPdf),
    "watermark-pdf": () => import("./watermark-pdf.js").then((m) => m.registerWatermarkPdf),
    "pdf-page-numbers": () => import("./pdf-page-numbers.js").then((m) => m.registerPdfPageNumbers),
    "flatten-pdf": () => import("./flatten-pdf.js").then((m) => m.registerFlattenPdf),
    "redact-pdf": () => import("./redact-pdf.js").then((m) => m.registerRedactPdf),
    "pdf-to-text": () => import("./pdf-to-text.js").then((m) => m.registerPdfToText),
    "pdf-to-word": () => import("./pdf-to-word.js").then((m) => m.registerPdfToWord),
    "pdf-metadata": () => import("./pdf-metadata.js").then((m) => m.registerPdfMetadata),
    "powerpoint-to-pdf": () =>
      import("./powerpoint-to-pdf.js").then((m) => m.registerPowerpointToPdf),
    "html-to-pdf": () => import("./html-to-pdf.js").then((m) => m.registerHtmlToPdf),
    "markdown-to-docx": () => import("./markdown-to-docx.js").then((m) => m.registerMarkdownToDocx),
    "markdown-to-html": () => import("./markdown-to-html.js").then((m) => m.registerMarkdownToHtml),
    "markdown-to-pdf": () => import("./markdown-to-pdf.js").then((m) => m.registerMarkdownToPdf),
    "to-epub": () => import("./to-epub.js").then((m) => m.registerToEpub),

    // Data Files
    "chart-maker": () => import("./chart-maker.js").then((m) => m.registerChartMaker),
    "create-zip": () => import("./create-zip.js").then((m) => m.registerCreateZip),
    "csv-excel": () => import("./csv-excel.js").then((m) => m.registerCsvExcel),
    "csv-json": () => import("./csv-json.js").then((m) => m.registerCsvJson),
    "extract-zip": () => import("./extract-zip.js").then((m) => m.registerExtractZip),
    "json-xml": () => import("./json-xml.js").then((m) => m.registerJsonXml),
    "merge-csvs": () => import("./merge-csvs.js").then((m) => m.registerMergeCsvs),
    "split-csv": () => import("./split-csv.js").then((m) => m.registerSplitCsv),
    "xml-to-csv": () => import("./xml-to-csv.js").then((m) => m.registerXmlToCsv),
    "yaml-json": () => import("./yaml-json.js").then((m) => m.registerYamlJson),

    // AI Tools
    "background-replace": () =>
      import("./background-replace.js").then((m) => m.registerBackgroundReplace),
    "blur-background": () => import("./blur-background.js").then((m) => m.registerBlurBackground),
    "remove-background": () =>
      import("./remove-background.js").then((m) => m.registerRemoveBackground),
    "remove-gif-background": () =>
      import("./remove-gif-background.js").then((m) => m.registerRemoveGifBackground),
    upscale: () => import("./upscale.js").then((m) => m.registerUpscale),
    ocr: () => import("./ocr.js").then((m) => m.registerOcr),
    "ocr-pdf": () => import("./ocr-pdf.js").then((m) => m.registerOcrPdf),
    "blur-faces": () => import("./blur-faces.js").then((m) => m.registerBlurFaces),
    "erase-object": () => import("./erase-object.js").then((m) => m.registerEraseObject),
    "sign-pdf": () => import("./sign-pdf.js").then((m) => m.registerSignPdf),
    "smart-crop": () => import("./smart-crop.js").then((m) => m.registerSmartCrop),
    "image-enhancement": () =>
      import("./image-enhancement.js").then((m) => m.registerImageEnhancement),
    "content-aware-resize": () =>
      import("./content-aware-resize.js").then((m) => m.registerContentAwareResize),
    "ai-canvas-expand": () => import("./ai-canvas-expand.js").then((m) => m.registerAiCanvasExpand),
    "auto-subtitles": () => import("./auto-subtitles.js").then((m) => m.registerAutoSubtitles),
    colorize: () => import("./colorize.js").then((m) => m.registerColorize),
    "enhance-faces": () => import("./enhance-faces.js").then((m) => m.registerEnhanceFaces),
    "noise-removal": () => import("./noise-removal.js").then((m) => m.registerNoiseRemoval),
    "passport-photo": () => import("./passport-photo.js").then((m) => m.registerPassportPhoto),
    "red-eye-removal": () => import("./red-eye-removal.js").then((m) => m.registerRedEyeRemoval),
    "restore-photo": () => import("./restore-photo.js").then((m) => m.registerRestorePhoto),
    "transcribe-audio": () =>
      import("./transcribe-audio.js").then((m) => m.registerTranscribeAudio),
    "transparency-fixer": () =>
      import("./transparency-fixer.js").then((m) => m.registerTransparencyFixer),
  };

  const toolIds = Object.keys(toolLoaders);
  const enabledIds = toolIds.filter((id) => {
    if (!skipTools.has(id)) return true;
    app.log.info(`Skipping disabled/experimental tool: ${id}`);
    return false;
  });
  let skipped = toolIds.length - enabledIds.length;

  // Load in parallel, then register in list order so boot stays deterministic.
  const registers = await Promise.all(enabledIds.map((id) => toolLoaders[id]()));
  for (const register of registers) {
    register(app);
  }

  // Conversion presets delegate to base tools' registered processV2, so they
  // must be registered after the base loop above has populated the registry.
  // Logging the boot count also waits until after this call, otherwise it
  // undercounts by exactly the preset total (registered here, not above).
  const { registered: presetsRegistered, skippedByPolicy } = registerConversionPresets(
    app,
    skipTools,
  );

  const registered = toolIds.length - skipped + presetsRegistered;
  skipped += skippedByPolicy;
  const total = toolIds.length + presetsRegistered + skippedByPolicy;
  app.log.info(`Tool routes: ${registered} active, ${skipped} skipped (${total} total)`);
}
