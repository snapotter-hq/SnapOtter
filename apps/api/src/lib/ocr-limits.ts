/** Hard ceiling for each encoded image or PDF accepted by every OCR ingress path. */
export const OCR_MAX_ENCODED_INPUT_BYTES = 512 * 1024 * 1024;

/** Independent aggregate ceiling for all encoded objects in one OCR batch request. */
export const OCR_MAX_BATCH_ENCODED_INPUT_BYTES = OCR_MAX_ENCODED_INPUT_BYTES;

export interface OcrUploadLimits {
  /** Maximum encoded bytes for each individual input object. */
  fileBytes: number;
  /** Maximum encoded bytes across all input objects in one request. */
  aggregateBytes: number;
}

export interface OcrEncodedInputViolation {
  scope: "file" | "aggregate";
  limitBytes: number;
}

/** Apply the operator's smaller limit without allowing unlimited/large values to remove OCR's cap. */
export function resolveOcrEncodedInputLimit(maxUploadSizeMb: number): number {
  if (!Number.isFinite(maxUploadSizeMb) || maxUploadSizeMb <= 0) {
    return OCR_MAX_ENCODED_INPUT_BYTES;
  }
  return Math.min(Math.floor(maxUploadSizeMb * 1024 * 1024), OCR_MAX_ENCODED_INPUT_BYTES);
}

/** Keep the operator's configured limit per file; the OCR aggregate has its own hard ceiling. */
export function resolveOcrUploadLimits(maxUploadSizeMb: number): OcrUploadLimits {
  return {
    fileBytes: resolveOcrEncodedInputLimit(maxUploadSizeMb),
    aggregateBytes: OCR_MAX_BATCH_ENCODED_INPUT_BYTES,
  };
}

/** Validate buffered ingress sizes when the route could not identify OCR until after multipart. */
export function findOcrEncodedInputViolation(
  inputBytes: readonly number[],
  maxUploadSizeMb: number,
): OcrEncodedInputViolation | null {
  const limits = resolveOcrUploadLimits(maxUploadSizeMb);
  let aggregateBytes = 0;
  for (const bytes of inputBytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limits.fileBytes) {
      return { scope: "file", limitBytes: limits.fileBytes };
    }
    aggregateBytes += bytes;
    if (aggregateBytes > limits.aggregateBytes) {
      return { scope: "aggregate", limitBytes: limits.aggregateBytes };
    }
  }
  return null;
}

/** Preserve a useful HTTP status across Fastify and object-storage limit errors. */
export function ocrUploadErrorStatus(error: unknown): 400 | 413 | 503 {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 503
  ) {
    return 503;
  }
  if (
    (typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 413) ||
    (error instanceof Error &&
      /(?:file too large|upload exceeds.*(?:maximum|limit))/i.test(error.message))
  ) {
    return 413;
  }
  return 400;
}

export function ocrUploadErrorMessage(statusCode: 400 | 413 | 503): string {
  if (statusCode === 503) return "Upload storage unavailable";
  if (statusCode === 413) return "Upload exceeds the allowed size";
  return "Failed to parse multipart request";
}
