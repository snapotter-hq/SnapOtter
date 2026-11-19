import { XMLValidator } from "fast-xml-parser";
import { InputValidationError } from "../modality/contract.js";

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
  throw new InputValidationError(`XML parse failed: ${msg} (${where})`);
}
