export { isMemoryAllocError, removeBackground } from "./background-removal.js";
export {
  AnimatedRemovalCanceledError,
  animatedTimeoutMs,
  type GifBgFormat,
  gifBgContentType,
  gifBgExt,
  type RemoveBackgroundAnimatedOptions,
  removeBackgroundAnimated,
  resolveGifBgFormat,
} from "./background-removal-animated.js";
export type { DispatcherStatus } from "./bridge.js";
export {
  getDispatcherStatus,
  getDocsDispatcher,
  initDispatcher,
  isGpuAvailable,
  PythonDispatcher,
  runDocsScript,
  shutdownDispatcher,
  shutdownDocsDispatcher,
} from "./bridge.js";
export { colorize } from "./colorization.js";
export type { DetectFacesResult, FaceRegion } from "./face-detection.js";
export { blurFaces, detectFaces } from "./face-detection.js";
export { enhanceFaces } from "./face-enhancement.js";
export type { FaceLandmarkPoint, FaceLandmarks, FaceLandmarksResult } from "./face-landmarks.js";
export { detectFaceLandmarks } from "./face-landmarks.js";
export { missingBundleForScript, SCRIPT_BUNDLE_MAP } from "./feature-gate.js";
export { type InpaintQuality, inpaint } from "./inpainting.js";
export { noiseRemoval } from "./noise-removal.js";
export type {
  OcrExecutionMetadata,
  OcrOptions,
  OcrQuality,
  OcrResult,
  PdfOcrOptions,
  PdfOcrResult,
} from "./ocr.js";
export {
  extractPdfText,
  extractText,
  FAST_KOREAN_UNSUPPORTED_REASON,
  MAX_OCR_INPUT_DIMENSION,
  MAX_OCR_INPUT_PIXELS,
} from "./ocr.js";
export type {
  OcrRuntimeRunOptions,
  OcrRuntimeRunResult,
  OcrRuntimeScript,
} from "./ocr-runtime-dispatcher.js";
export {
  drainOcrDispatcher,
  handoffOcrDispatcher,
  probeOcrDispatcher,
  rotateOcrDispatcher,
  runOcrRuntime,
  shutdownOcrDispatcher,
} from "./ocr-runtime-dispatcher.js";
export type { OutpaintOptions } from "./outpainting.js";
export { outpaint } from "./outpainting.js";
export { removeRedEye } from "./red-eye-removal.js";
export { restorePhoto } from "./restoration.js";
export type {
  OcrRuntimeTrustKey,
  VerifiedOcrRuntimeIndex,
} from "./runtime-index.js";
export {
  canonicalRuntimeJson,
  loadOcrRuntimeTrustKeys,
  OCR_RUNTIME_INDEX_MAX_BYTES,
  verifyRuntimeIndex,
} from "./runtime-index.js";
export type { OcrRuntimeMemoryOptions } from "./runtime-resources.js";
export {
  assertOcrRuntimeMemory,
  getOcrRuntimeEffectiveMemoryBytes,
  hasOcrRuntimeMemory,
  OCR_RUNTIME_MINIMUM_MEMORY_BYTES,
} from "./runtime-resources.js";
export type {
  ActiveRuntimeDescriptor,
  OcrRuntimeActivationIdentity,
  OcrRuntimeCapability,
  OcrRuntimeQuality,
  OcrRuntimeTarget,
  RuntimeIntegrityFile,
  RuntimeIntegrityFileId,
  RuntimePlatformOptions,
  RuntimeSignedIndex,
  RuntimeStateOptions,
} from "./runtime-state.js";
export {
  getOcrRuntimeCapability,
  OCR_RUNTIME_PROTOCOL_VERSION,
  readActiveRuntime,
  readCommittedOcrRuntimeActivationIdentity,
  readPendingOcrRuntimeActivationIdentity,
  resolveAiDataDir,
  selectOcrRuntimeTarget,
} from "./runtime-state.js";
export { seamCarve } from "./seam-carving.js";
export type {
  RunTesseractOptions,
  TesseractLanguage,
  TesseractResult,
  TesseractRuntimeMetadata,
} from "./tesseract.js";
export {
  getTesseractRuntimeMetadata,
  resolveTesseractLanguage,
  runAdaptiveTesseract,
  runTesseract,
  selectTesseractLanguageFamily,
  selectTesseractLayout,
  TESSERACT_LANGUAGE_MAP,
} from "./tesseract.js";
export type {
  PreparedPdfOcrPage,
  PreparedPdfOcrPages,
  RunTesseractPdfOptions,
  TesseractPdfResult,
} from "./tesseract-pdf.js";
export {
  MAX_PDF_OCR_PAGES,
  parsePdfPageSpec,
  preparePdfOcrPages,
  runTesseractPdf,
} from "./tesseract-pdf.js";
export type { TranscribeOptions, TranscriptionResult, TranscriptSegment } from "./transcription.js";
export { transcribeAudio } from "./transcription.js";
export { upscale } from "./upscaling.js";
export { acquireVenvLock } from "./venv-lock.js";
