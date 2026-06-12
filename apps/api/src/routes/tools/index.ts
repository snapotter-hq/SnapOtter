import { TOOLS } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../../db/index.js";
import { registerColorAdjustments } from "./adjust-colors.js";
import { registerAiCanvasExpand } from "./ai-canvas-expand.js";
import { registerAspectPad } from "./aspect-pad.js";
import { registerAudioChannels } from "./audio-channels.js";
import { registerAudioMetadata } from "./audio-metadata.js";
import { registerAudioSpeed } from "./audio-speed.js";
import { registerBarcodeGenerate } from "./barcode-generate.js";
import { registerBarcodeRead } from "./barcode-read.js";
import { registerBeautify } from "./beautify.js";
import { registerBlurFaces } from "./blur-faces.js";
import { registerBlurPad } from "./blur-pad.js";
import { registerBookletPdf } from "./booklet-pdf.js";
import { registerBorder } from "./border.js";
import { registerBulkRename } from "./bulk-rename.js";
import { registerBurnSubtitles } from "./burn-subtitles.js";
import { registerChangeFps } from "./change-fps.js";
import { registerChartMaker } from "./chart-maker.js";
import { registerCircleCrop } from "./circle-crop.js";
import { registerCollage } from "./collage.js";
import { registerColorBlindness } from "./color-blindness.js";
import { registerColorPalette } from "./color-palette.js";
import { registerColorize } from "./colorize.js";
import { registerCompare } from "./compare.js";
import { registerCompose } from "./compose.js";
import { registerCompress } from "./compress.js";
import { registerCompressPdf } from "./compress-pdf.js";
import { registerCompressVideo } from "./compress-video.js";
import { registerContentAwareResize } from "./content-aware-resize.js";
import { registerConvert } from "./convert.js";
import { registerConvertAudio } from "./convert-audio.js";
import { registerConvertDocument } from "./convert-document.js";
import { registerConvertPresentation } from "./convert-presentation.js";
import { registerConvertSpreadsheet } from "./convert-spreadsheet.js";
import { registerConvertVideo } from "./convert-video.js";
import { registerCreateZip } from "./create-zip.js";
import { registerCrop } from "./crop.js";
import { registerCropPdf } from "./crop-pdf.js";
import { registerCropVideo } from "./crop-video.js";
import { registerCsvExcel } from "./csv-excel.js";
import { registerCsvJson } from "./csv-json.js";
import { registerDuotone } from "./duotone.js";
import { registerEditMetadata } from "./edit-metadata.js";
import { registerEmbedSubtitles } from "./embed-subtitles.js";
import { registerEnhanceFaces } from "./enhance-faces.js";
import { registerEpubConvert } from "./epub-convert.js";
import { registerEraseObject } from "./erase-object.js";
import { registerExcelToPdf } from "./excel-to-pdf.js";
import { registerExtractAudio } from "./extract-audio.js";
import { registerExtractPages } from "./extract-pages.js";
import { registerExtractSubtitles } from "./extract-subtitles.js";
import { registerExtractZip } from "./extract-zip.js";
import { registerFadeAudio } from "./fade-audio.js";
import { registerFavicon } from "./favicon.js";
import { registerFindDuplicates } from "./find-duplicates.js";
import { registerFlattenPdf } from "./flatten-pdf.js";
import { registerGifToVideo } from "./gif-to-video.js";
import { registerGifTools } from "./gif-tools.js";
import { registerGifWebp } from "./gif-webp.js";
import { registerGrayscalePdf } from "./grayscale-pdf.js";
import { registerHistogram } from "./histogram.js";
import { registerHtmlToImage } from "./html-to-image.js";
import { registerHtmlToPdf } from "./html-to-pdf.js";
import { registerImageEnhancement } from "./image-enhancement.js";
import { registerImagePad } from "./image-pad.js";
import { registerImageToBase64 } from "./image-to-base64.js";
import { registerImageToPdf } from "./image-to-pdf.js";
import { registerImagesToVideo } from "./images-to-video.js";
import { registerInfo } from "./info.js";
import { registerJsonXml } from "./json-xml.js";
import { registerLinearizePdf } from "./linearize-pdf.js";
import { registerLqipPlaceholder } from "./lqip-placeholder.js";
import { registerMarkdownToDocx } from "./markdown-to-docx.js";
import { registerMarkdownToHtml } from "./markdown-to-html.js";
import { registerMarkdownToPdf } from "./markdown-to-pdf.js";
import { registerMemeGenerator } from "./meme-generator.js";
import { registerMergeAudio } from "./merge-audio.js";
import { registerMergeCsvs } from "./merge-csvs.js";
import { registerMergePdf } from "./merge-pdf.js";
import { registerMergeVideos } from "./merge-videos.js";
import { registerMuteVideo } from "./mute-video.js";
import { registerNoiseReduction } from "./noise-reduction.js";
import { registerNoiseRemoval } from "./noise-removal.js";
import { registerNormalizeAudio } from "./normalize-audio.js";
import { registerNupPdf } from "./nup-pdf.js";
import { registerOcr } from "./ocr.js";
import { registerOptimizeForWeb } from "./optimize-for-web.js";
import { registerOrganizePdf } from "./organize-pdf.js";
import { registerPassportPhoto } from "./passport-photo.js";
import { registerPdfMetadata } from "./pdf-metadata.js";
import { registerPdfPageNumbers } from "./pdf-page-numbers.js";
import { registerPdfToImage } from "./pdf-to-image.js";
import { registerPdfToText } from "./pdf-to-text.js";
import { registerPdfToWord } from "./pdf-to-word.js";
import { registerPdfaConvert } from "./pdfa-convert.js";
import { registerPitchShift } from "./pitch-shift.js";
import { registerPixelate } from "./pixelate.js";
import { registerPowerpointToPdf } from "./powerpoint-to-pdf.js";
import { registerProtectPdf } from "./protect-pdf.js";
import { registerQrGenerate } from "./qr-generate.js";
import { registerRedEyeRemoval } from "./red-eye-removal.js";
import { registerRedactPdf } from "./redact-pdf.js";
import { registerRemoveBackground } from "./remove-background.js";
import { registerRemovePages } from "./remove-pages.js";
import { registerRepairPdf } from "./repair-pdf.js";
import { registerReplaceAudio } from "./replace-audio.js";
import { registerReplaceColor } from "./replace-color.js";
import { registerResize } from "./resize.js";
import { registerResizeVideo } from "./resize-video.js";
import { registerRestorePhoto } from "./restore-photo.js";
import { registerReverseAudio } from "./reverse-audio.js";
import { registerReverseVideo } from "./reverse-video.js";
import { registerRingtoneMaker } from "./ringtone-maker.js";
import { registerRotate } from "./rotate.js";
import { registerRotatePdf } from "./rotate-pdf.js";
import { registerRotateVideo } from "./rotate-video.js";
import { registerSharpening } from "./sharpening.js";
import { registerSilenceRemoval } from "./silence-removal.js";
import { registerSmartCrop } from "./smart-crop.js";
import { registerSplit } from "./split.js";
import { registerSplitAudio } from "./split-audio.js";
import { registerSplitCsv } from "./split-csv.js";
import { registerSplitPdf } from "./split-pdf.js";
import { registerSpriteSheet } from "./sprite-sheet.js";
import { registerStabilizeVideo } from "./stabilize-video.js";
import { registerStitch } from "./stitch.js";
import { registerStripMetadata } from "./strip-metadata.js";
import { registerSvgToRaster } from "./svg-to-raster.js";
import { registerTextOverlay } from "./text-overlay.js";
import { registerToEpub } from "./to-epub.js";
import { registerTransparencyFixer } from "./transparency-fixer.js";
import { registerTrimAudio } from "./trim-audio.js";
import { registerTrimVideo } from "./trim-video.js";
import { registerUnlockPdf } from "./unlock-pdf.js";
import { registerUpscale } from "./upscale.js";
import { registerVectorize } from "./vectorize.js";
import { registerVideoColor } from "./video-color.js";
import { registerVideoLoudnorm } from "./video-loudnorm.js";
import { registerVideoMetadata } from "./video-metadata.js";
import { registerVideoSpeed } from "./video-speed.js";
import { registerVideoToFrames } from "./video-to-frames.js";
import { registerVideoToGif } from "./video-to-gif.js";
import { registerVideoToWebp } from "./video-to-webp.js";
import { registerVignette } from "./vignette.js";
import { registerVolumeAdjust } from "./volume-adjust.js";
import { registerWatermarkImage } from "./watermark-image.js";
import { registerWatermarkPdf } from "./watermark-pdf.js";
import { registerWatermarkText } from "./watermark-text.js";
import { registerWatermarkVideo } from "./watermark-video.js";
import { registerWaveformImage } from "./waveform-image.js";
import { registerWordToPdf } from "./word-to-pdf.js";
import { registerXmlToCsv } from "./xml-to-csv.js";
import { registerYamlJson } from "./yaml-json.js";

/**
 * Registry that imports and registers all tool routes.
 * Each tool uses the createToolRoute factory from tool-factory.ts.
 *
 * Tools listed in the `disabledTools` setting or marked `experimental`
 * (when `enableExperimentalTools` is off) are skipped at startup.
 */
export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  // Read disabled tools from settings
  const [disabledRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "disabledTools"));
  const disabledTools: string[] = disabledRow ? JSON.parse(disabledRow.value) : [];

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

  const toolRegistrations: Array<{
    id: string;
    register: (app: FastifyInstance) => void;
  }> = [
    // Essentials
    { id: "resize", register: registerResize },
    { id: "crop", register: registerCrop },
    { id: "rotate", register: registerRotate },
    { id: "convert", register: registerConvert },
    { id: "compress", register: registerCompress },
    { id: "strip-metadata", register: registerStripMetadata },
    { id: "edit-metadata", register: registerEditMetadata },
    { id: "adjust-colors", register: registerColorAdjustments },
    { id: "sharpening", register: registerSharpening },

    // Watermark & Overlay
    { id: "watermark-text", register: registerWatermarkText },
    { id: "watermark-image", register: registerWatermarkImage },
    { id: "text-overlay", register: registerTextOverlay },
    { id: "compose", register: registerCompose },
    { id: "meme-generator", register: registerMemeGenerator },

    // Utilities
    { id: "info", register: registerInfo },
    { id: "compare", register: registerCompare },
    { id: "find-duplicates", register: registerFindDuplicates },
    { id: "color-palette", register: registerColorPalette },
    { id: "qr-generate", register: registerQrGenerate },
    { id: "html-to-image", register: registerHtmlToImage },
    { id: "barcode-generate", register: registerBarcodeGenerate },
    { id: "barcode-read", register: registerBarcodeRead },
    { id: "image-to-base64", register: registerImageToBase64 },

    // Layout & Composition
    { id: "collage", register: registerCollage },
    { id: "stitch", register: registerStitch },
    { id: "split", register: registerSplit },
    { id: "border", register: registerBorder },
    { id: "beautify", register: registerBeautify },
    { id: "circle-crop", register: registerCircleCrop },
    { id: "duotone", register: registerDuotone },
    { id: "histogram", register: registerHistogram },
    { id: "image-pad", register: registerImagePad },
    { id: "lqip-placeholder", register: registerLqipPlaceholder },
    { id: "pixelate", register: registerPixelate },
    { id: "sprite-sheet", register: registerSpriteSheet },
    { id: "vignette", register: registerVignette },

    // Format & Conversion
    { id: "svg-to-raster", register: registerSvgToRaster },
    { id: "vectorize", register: registerVectorize },
    { id: "gif-tools", register: registerGifTools },
    { id: "gif-webp", register: registerGifWebp },
    { id: "pdf-to-image", register: registerPdfToImage },

    // Optimization extras
    { id: "bulk-rename", register: registerBulkRename },
    { id: "favicon", register: registerFavicon },
    { id: "image-to-pdf", register: registerImageToPdf },
    { id: "optimize-for-web", register: registerOptimizeForWeb },

    // Adjustments extra
    { id: "replace-color", register: registerReplaceColor },
    { id: "color-blindness", register: registerColorBlindness },

    // Video
    { id: "aspect-pad", register: registerAspectPad },
    { id: "blur-pad", register: registerBlurPad },
    { id: "burn-subtitles", register: registerBurnSubtitles },
    { id: "change-fps", register: registerChangeFps },
    { id: "compress-video", register: registerCompressVideo },
    { id: "convert-video", register: registerConvertVideo },
    { id: "crop-video", register: registerCropVideo },
    { id: "embed-subtitles", register: registerEmbedSubtitles },
    { id: "extract-subtitles", register: registerExtractSubtitles },
    { id: "gif-to-video", register: registerGifToVideo },
    { id: "images-to-video", register: registerImagesToVideo },
    { id: "merge-videos", register: registerMergeVideos },
    { id: "mute-video", register: registerMuteVideo },
    { id: "replace-audio", register: registerReplaceAudio },
    { id: "resize-video", register: registerResizeVideo },
    { id: "reverse-video", register: registerReverseVideo },
    { id: "rotate-video", register: registerRotateVideo },
    { id: "stabilize-video", register: registerStabilizeVideo },
    { id: "trim-video", register: registerTrimVideo },
    { id: "video-color", register: registerVideoColor },
    { id: "video-loudnorm", register: registerVideoLoudnorm },
    { id: "video-metadata", register: registerVideoMetadata },
    { id: "video-speed", register: registerVideoSpeed },
    { id: "video-to-frames", register: registerVideoToFrames },
    { id: "video-to-gif", register: registerVideoToGif },
    { id: "video-to-webp", register: registerVideoToWebp },
    { id: "watermark-video", register: registerWatermarkVideo },

    // Audio
    { id: "audio-channels", register: registerAudioChannels },
    { id: "audio-metadata", register: registerAudioMetadata },
    { id: "audio-speed", register: registerAudioSpeed },
    { id: "convert-audio", register: registerConvertAudio },
    { id: "extract-audio", register: registerExtractAudio },
    { id: "fade-audio", register: registerFadeAudio },
    { id: "merge-audio", register: registerMergeAudio },
    { id: "noise-reduction", register: registerNoiseReduction },
    { id: "normalize-audio", register: registerNormalizeAudio },
    { id: "pitch-shift", register: registerPitchShift },
    { id: "reverse-audio", register: registerReverseAudio },
    { id: "ringtone-maker", register: registerRingtoneMaker },
    { id: "silence-removal", register: registerSilenceRemoval },
    { id: "split-audio", register: registerSplitAudio },
    { id: "trim-audio", register: registerTrimAudio },
    { id: "volume-adjust", register: registerVolumeAdjust },
    { id: "waveform-image", register: registerWaveformImage },

    // PDF & Documents
    { id: "convert-document", register: registerConvertDocument },
    { id: "convert-presentation", register: registerConvertPresentation },
    { id: "convert-spreadsheet", register: registerConvertSpreadsheet },
    { id: "epub-convert", register: registerEpubConvert },
    { id: "excel-to-pdf", register: registerExcelToPdf },
    { id: "merge-pdf", register: registerMergePdf },
    { id: "split-pdf", register: registerSplitPdf },
    { id: "compress-pdf", register: registerCompressPdf },
    { id: "rotate-pdf", register: registerRotatePdf },
    { id: "word-to-pdf", register: registerWordToPdf },
    { id: "extract-pages", register: registerExtractPages },
    { id: "remove-pages", register: registerRemovePages },
    { id: "organize-pdf", register: registerOrganizePdf },
    { id: "protect-pdf", register: registerProtectPdf },
    { id: "unlock-pdf", register: registerUnlockPdf },
    { id: "repair-pdf", register: registerRepairPdf },
    { id: "linearize-pdf", register: registerLinearizePdf },
    { id: "grayscale-pdf", register: registerGrayscalePdf },
    { id: "pdfa-convert", register: registerPdfaConvert },
    { id: "crop-pdf", register: registerCropPdf },
    { id: "nup-pdf", register: registerNupPdf },
    { id: "booklet-pdf", register: registerBookletPdf },
    { id: "watermark-pdf", register: registerWatermarkPdf },
    { id: "pdf-page-numbers", register: registerPdfPageNumbers },
    { id: "flatten-pdf", register: registerFlattenPdf },
    { id: "redact-pdf", register: registerRedactPdf },
    { id: "pdf-to-text", register: registerPdfToText },
    { id: "pdf-to-word", register: registerPdfToWord },
    { id: "pdf-metadata", register: registerPdfMetadata },
    { id: "powerpoint-to-pdf", register: registerPowerpointToPdf },
    { id: "html-to-pdf", register: registerHtmlToPdf },
    { id: "markdown-to-docx", register: registerMarkdownToDocx },
    { id: "markdown-to-html", register: registerMarkdownToHtml },
    { id: "markdown-to-pdf", register: registerMarkdownToPdf },
    { id: "to-epub", register: registerToEpub },

    // Data Files
    { id: "chart-maker", register: registerChartMaker },
    { id: "create-zip", register: registerCreateZip },
    { id: "csv-excel", register: registerCsvExcel },
    { id: "csv-json", register: registerCsvJson },
    { id: "extract-zip", register: registerExtractZip },
    { id: "json-xml", register: registerJsonXml },
    { id: "merge-csvs", register: registerMergeCsvs },
    { id: "split-csv", register: registerSplitCsv },
    { id: "xml-to-csv", register: registerXmlToCsv },
    { id: "yaml-json", register: registerYamlJson },

    // AI Tools
    { id: "remove-background", register: registerRemoveBackground },
    { id: "upscale", register: registerUpscale },
    { id: "ocr", register: registerOcr },
    { id: "blur-faces", register: registerBlurFaces },
    { id: "erase-object", register: registerEraseObject },
    { id: "smart-crop", register: registerSmartCrop },
    { id: "image-enhancement", register: registerImageEnhancement },
    { id: "content-aware-resize", register: registerContentAwareResize },
    { id: "ai-canvas-expand", register: registerAiCanvasExpand },
    { id: "colorize", register: registerColorize },
    { id: "enhance-faces", register: registerEnhanceFaces },
    { id: "noise-removal", register: registerNoiseRemoval },
    { id: "passport-photo", register: registerPassportPhoto },
    { id: "red-eye-removal", register: registerRedEyeRemoval },
    { id: "restore-photo", register: registerRestorePhoto },
    { id: "transparency-fixer", register: registerTransparencyFixer },
  ];

  let skipped = 0;
  for (const { id, register } of toolRegistrations) {
    if (skipTools.has(id)) {
      app.log.info(`Skipping disabled/experimental tool: ${id}`);
      skipped++;
      continue;
    }

    register(app);
  }

  const registered = toolRegistrations.length - skipped;
  app.log.info(
    `Tool routes: ${registered} active, ${skipped} skipped (${toolRegistrations.length} total)`,
  );
}
