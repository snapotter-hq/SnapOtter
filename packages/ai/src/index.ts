export { runPythonScript } from "./bridge.js";
export { removeBackground } from "./background-removal.js";
export type { RemoveBackgroundOptions } from "./background-removal.js";
export { upscale } from "./upscaling.js";
export type { UpscaleOptions, UpscaleResult } from "./upscaling.js";
export { extractText } from "./ocr.js";
export type { OcrOptions, OcrResult } from "./ocr.js";
export { blurFaces } from "./face-detection.js";
export type {
  BlurFacesOptions,
  BlurFacesResult,
  FaceRegion,
} from "./face-detection.js";
export { inpaint } from "./inpainting.js";
export { smartCrop } from "./smart-crop.js";
export type { SmartCropOptions } from "./smart-crop.js";
