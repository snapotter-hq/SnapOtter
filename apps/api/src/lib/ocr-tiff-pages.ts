import {
  extractText,
  MAX_OCR_INPUT_DIMENSION,
  MAX_OCR_INPUT_PIXELS,
  MAX_OCR_OUTPUT_BYTES,
  MAX_PDF_OCR_PAGES,
  type OcrResult,
} from "@snapotter/ai";
import { pixelLimitImageError, SafeError, ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { isPixelSafetyError } from "../modality/image-input.js";
import { asDecoderOutOfMemory, DecoderOutOfMemoryError } from "./format-decoders.js";
import { asInputErrorIfUndecodable, UNDECODABLE_IMAGE_MESSAGE } from "./image-error.js";

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

/**
 * Page count when `buffer` is a TIFF, or 0 for anything else.
 *
 * Sharp decodes page 1 of a TIFF unless told otherwise, so OCR on a scanned
 * multi-page TIFF used to return page 1's text and say nothing about the rest
 * (#4364). An unreadable header counts as no TIFF: extractText decodes the
 * same buffer next and reports its own error.
 */
export async function tiffPageCount(buffer: Buffer): Promise<number> {
  try {
    const meta = await sharp(buffer).metadata();
    return meta.format === "tiff" ? (meta.pages ?? 1) : 0;
  } catch (err) {
    const oom = asDecoderOutOfMemory(err);
    if (oom instanceof DecoderOutOfMemoryError) throw oom;
    return 0;
  }
}

/**
 * One TIFF page as an upright PNG. The input handler checked page 1's size
 * only, and TIFF pages can each have their own, so every page gets the same
 * safety limits before OCR allocates for it. Errors are classified against
 * this page, since probing the whole TIFF would decode page 1 and pass.
 */
async function renderTiffPage(buffer: Buffer, page: number): Promise<Buffer> {
  try {
    const handle = sharp(buffer, { page, limitInputPixels: MAX_OCR_INPUT_PIXELS });
    const { width = 0, height = 0 } = await handle.metadata();
    if (width > MAX_OCR_INPUT_DIMENSION || height > MAX_OCR_INPUT_DIMENSION) {
      throw new ToolInputError(
        `Page ${page + 1} exceeds the ${MAX_OCR_INPUT_DIMENSION.toLocaleString("en-US")} pixel dimension safety limit (${width.toLocaleString("en-US")}x${height.toLocaleString("en-US")})`,
        { code: "IMAGE_TOO_LARGE" },
      );
    }
    if (width * height > MAX_OCR_INPUT_PIXELS) throw pixelLimitImageError();
    return await handle.rotate().png().toBuffer();
  } catch (err) {
    if (err instanceof ToolInputError) throw err;
    const oom = asDecoderOutOfMemory(err);
    if (oom instanceof DecoderOutOfMemoryError) throw oom;
    if (isPixelSafetyError(err)) throw pixelLimitImageError(err);
    throw new ToolInputError(UNDECODABLE_IMAGE_MESSAGE, { cause: err, code: "IMAGE_UNDECODABLE" });
  }
}

/**
 * OCR every page of a multi-page TIFF, framed the way ocr-pdf frames PDF
 * pages. The page budget and the aggregate output cap are the PDF tool's and
 * the single-image tool's, so a TIFF can't fan out further than either.
 */
export async function extractTiffPages(
  buffer: Buffer,
  pageCount: number,
  options: Parameters<typeof extractText>[2],
  ctx: {
    scratchDir: string;
    signal: AbortSignal;
    report: (percent: number, stage?: string) => void;
  },
): Promise<OcrResult> {
  const pagesToRead = Math.min(pageCount, MAX_PDF_OCR_PAGES);
  const share = 90 / pagesToRead;
  const pageTexts: string[] = [];
  const warnings = new Set<string>();
  let first: OcrResult | undefined;
  let degraded = false;
  let outputBytes = 0;

  for (let page = 0; page < pagesToRead; page++) {
    ctx.signal.throwIfAborted();
    const pageStart = 10 + share * page;
    const pageBuffer = await renderTiffPage(buffer, page);
    let pageResult: OcrResult;
    try {
      pageResult = await extractText(pageBuffer, ctx.scratchDir, options, (percent, stage) =>
        ctx.report(pageStart + (clampPercent(percent) / 100) * share, stage),
      );
    } catch (err) {
      throw await asInputErrorIfUndecodable(pageBuffer, err);
    }

    const pageText = `${pageTexts.length === 0 ? "" : "\n\n"}--- Page ${page + 1} ---\n\n${pageResult.text.trim()}`;
    outputBytes += Buffer.byteLength(pageText, "utf8");
    if (outputBytes > MAX_OCR_OUTPUT_BYTES) {
      throw new SafeError(
        `OCR output exceeds the ${MAX_OCR_OUTPUT_BYTES.toLocaleString("en-US")} byte safety limit`,
        { kind: "operational", code: "OCR_OUTPUT_TOO_LARGE", statusCode: 500 },
      );
    }
    pageTexts.push(pageText);
    first ??= pageResult;
    degraded ||= pageResult.degraded;
    for (const warning of pageResult.warnings) warnings.add(warning);
  }

  if (pageCount > pagesToRead) {
    warnings.add(`Only the first ${pagesToRead} of ${pageCount} pages were read.`);
  }
  // pagesToRead is at least 2 here, so the loop assigned first.
  return {
    ...(first as OcrResult),
    text: pageTexts.join(""),
    degraded,
    warnings: [...warnings],
  };
}
