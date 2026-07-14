import { MAX_OCR_INPUT_DIMENSION, MAX_OCR_INPUT_PIXELS } from "@snapotter/ai";
import type { PreparedInput } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";

/** Safely normalize an image before an OCR batch or pipeline stores it. */
export function prepareOcrIngressImage(
  input: Buffer,
  filename: string,
  scratchDir: string,
): Promise<PreparedInput> {
  return inputHandlerFor("image").prepare(input, filename, {
    scratchDir,
    maxDimension: MAX_OCR_INPUT_DIMENSION,
    maxPixels: MAX_OCR_INPUT_PIXELS,
  });
}
