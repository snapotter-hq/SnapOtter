import type { PdfTextResult } from "@snapotter/doc-engine";
import { NO_TEXT_LAYER_CODE } from "@snapotter/shared";
import { InputValidationError } from "../modality/contract.js";

const SCANNED = "This PDF has no extractable text layer. It looks scanned or image-only";
const UNREADABLE = "This PDF has a text layer, but its fonts don't map to readable characters";

/** What the tool would have handed back instead, one clause per cause. */
export interface NoTextLayerOutcome {
  scanned: string;
  unreadable: string;
}

/**
 * The 422 for a PDF whose text probe found nothing usable. Only call it a scan
 * when no page returned characters at all. A page whose characters failed the
 * readability test has a real text layer the user can see on screen, so
 * "image-only" would read as flatly wrong there (#954, #4951). An older
 * sidecar sends no counts, and keeps the scan wording it always had. The code
 * lets the web app offer OCR as a button instead of a dead end (#1164).
 */
export function noTextLayerError(
  probe: Pick<PdfTextResult, "unreadablePages">,
  outcome?: NoTextLayerOutcome,
): InputValidationError {
  const unreadable = (probe.unreadablePages ?? 0) > 0;
  const cause = unreadable ? UNREADABLE : SCANNED;
  const message = outcome
    ? `${cause}, so ${unreadable ? outcome.unreadable : outcome.scanned}. Use the PDF OCR tool to read its text instead.`
    : `${cause}, so use the PDF OCR tool to read its text.`;
  return new InputValidationError(message, 422, undefined, NO_TEXT_LAYER_CODE);
}
