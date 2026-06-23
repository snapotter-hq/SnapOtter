export { isMemoryAllocError, removeBackground } from "./background-removal.js";
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
export { inpaint } from "./inpainting.js";
export { noiseRemoval } from "./noise-removal.js";
export type { PdfOcrOptions, PdfOcrResult } from "./ocr.js";
export { extractPdfText, extractText } from "./ocr.js";
export type { OutpaintOptions } from "./outpainting.js";
export { outpaint } from "./outpainting.js";
export { removeRedEye } from "./red-eye-removal.js";
export { restorePhoto } from "./restoration.js";
export { seamCarve } from "./seam-carving.js";
export type { TranscribeOptions, TranscriptionResult, TranscriptSegment } from "./transcription.js";
export { transcribeAudio } from "./transcription.js";
export { upscale } from "./upscaling.js";
export { acquireVenvLock } from "./venv-lock.js";
