import { XMLValidator } from "fast-xml-parser";
import { InputValidationError } from "../modality/contract.js";

const MAX_DETAIL_LENGTH = 200;

/**
 * The validator reports two or more unclosed tags by JSON-printing its whole
 * open-tag stack ("Invalid '[ "a", "b", ... ]' found."), so a 10 MB upload of
 * nothing but open tags would come back as a tens-of-MB error body.
 */
function describe(msg: string): string {
  if (msg.startsWith("Invalid '[")) return "More than one tag is never closed.";
  return msg.length > MAX_DETAIL_LENGTH ? `${msg.slice(0, MAX_DETAIL_LENGTH)}...` : msg;
}

/**
 * Throw a 400 unless `text` is a well-formed XML document. XMLParser.parse is
 * lenient: an unclosed root or mismatched tags come back as partial data with
 * no error, so converters must validate first or they hand back silently
 * truncated output (#4379).
 */
export function assertWellFormedXml(text: string): void {
  const result = XMLValidator.validate(text);
  if (result === true) return;
  const { msg, line, col } = result.err;
  const where = col === undefined ? `line ${line}` : `line ${line}, column ${col}`;
  throw new InputValidationError(`XML parse failed: ${describe(msg)} (${where})`);
}
