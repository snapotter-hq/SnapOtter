import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfAvailable, qpdfCheck, qpdfPageCount } from "@snapotter/doc-engine";
import { env } from "../config.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

const ZIP_MAGIC = Buffer.from("PK");

/**
 * Documents: header magic + qpdf structural check + page caps for PDFs
 * (spec 4.5/4.7). Office/EPUB containers get a zip-magic sanity check in
 * phase 3; deep validation happens when conversion engines consume them.
 * The "file" modality (csv/json/...) shares this handler as a passthrough.
 */
export class DocumentInputHandler implements InputHandler {
  async prepare(
    raw: Buffer,
    filename: string,
    opts: { scratchDir: string },
  ): Promise<PreparedInput> {
    if (raw.length === 0) throw new InputValidationError("Empty file");
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf")) {
      if (raw.subarray(0, 5).toString() !== "%PDF-") {
        throw new InputValidationError("File does not start with a PDF header");
      }
      if (qpdfAvailable()) {
        const dir = join(opts.scratchDir, `qpdf-${randomUUID()}`);
        await mkdir(dir, { recursive: true });
        const p = join(dir, "input.pdf");
        try {
          await writeFile(p, raw);
          try {
            await qpdfCheck(p);
          } catch (err) {
            throw new InputValidationError(
              `Damaged PDF: ${err instanceof Error ? err.message.slice(0, 300) : "structural check failed"}`,
            );
          }
          if (env.MAX_PDF_PAGES > 0) {
            const pages = await qpdfPageCount(p);
            if (pages > env.MAX_PDF_PAGES) {
              throw new InputValidationError(
                `PDF has ${pages} pages, exceeding the maximum of ${env.MAX_PDF_PAGES}`,
              );
            }
          }
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      }
    } else if (
      [".docx", ".xlsx", ".pptx", ".epub", ".odt", ".ods", ".odp"].some((e) => lower.endsWith(e))
    ) {
      if (!raw.subarray(0, 2).equals(ZIP_MAGIC)) {
        throw new InputValidationError("File is not a valid Office/EPUB container");
      }
    }
    return { buffer: raw, filename };
  }
}
