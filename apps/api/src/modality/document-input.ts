import { randomUUID } from "node:crypto";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  QpdfTimeoutError,
  qpdfAvailable,
  qpdfCheck,
  qpdfPageCount,
  qpdfRequiresPassword,
} from "@snapotter/doc-engine";
import { env } from "../config.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

const ZIP_MAGIC = Buffer.from("PK");

/** instanceof plus a name check, so a future dual copy of doc-engine cannot silently revert timeouts to "damaged". */
function isQpdfTimeout(err: unknown): boolean {
  return (
    err instanceof QpdfTimeoutError || (err instanceof Error && err.name === "QpdfTimeoutError")
  );
}

export interface PdfPathValidationOptions {
  lenient?: boolean;
  rejectPasswordProtected?: boolean;
  signal?: AbortSignal;
}

/** Validate a PDF in place so large callers never need a Node.js Buffer. */
export async function validatePdfPath(
  filePath: string,
  opts: PdfPathValidationOptions = {},
): Promise<void> {
  opts.signal?.throwIfAborted();
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead === 0) throw new InputValidationError("Empty file");
    if (bytesRead < header.length || header.toString() !== "%PDF-") {
      throw new InputValidationError("File does not start with a PDF header");
    }
  } finally {
    await handle.close();
  }

  opts.signal?.throwIfAborted();
  if (opts.lenient || !qpdfAvailable()) return;

  const passwordProtected = await qpdfRequiresPassword(filePath);
  opts.signal?.throwIfAborted();
  if (passwordProtected) {
    if (opts.rejectPasswordProtected) {
      throw new InputValidationError(
        "This PDF is password-protected. Unlock it first with the Unlock PDF tool, then try again.",
      );
    }
    // Without a password qpdf cannot safely inspect the structure or pages.
    return;
  }

  try {
    await qpdfCheck(filePath);
  } catch (err) {
    if (!isQpdfTimeout(err)) {
      throw new InputValidationError(
        `Damaged PDF: ${err instanceof Error ? err.message.slice(0, 300) : "structural check failed"}`,
      );
    }
    // A big-but-healthy PDF on a slow host can outlive the check budget
    // (issue #920). That is inconclusive, not damage: proceed like the
    // password-protected branch above, where qpdf also cannot inspect the
    // structure. Tradeoff: a file crafted to stall qpdf passes this gate,
    // but every downstream engine (qpdf, ghostscript, LibreOffice, ...)
    // runs under its own timeout and fails loudly on a broken file.
    const size = await stat(filePath)
      .then((s) => s.size)
      .catch(() => 0);
    console.warn(
      `[document-input] ${(err as Error).message} for ${filePath} (${size} bytes); skipping structural validation`,
    );
  }
  opts.signal?.throwIfAborted();

  if (env.MAX_PDF_PAGES > 0) {
    let pages: number;
    try {
      pages = await qpdfPageCount(filePath);
    } catch (err) {
      if (isQpdfTimeout(err)) {
        // Fail closed: the cap is a resource guard, so a file that stalls the
        // page-count probe must not slip past it. Say so instead of a 500.
        throw new InputValidationError(
          `Could not count this PDF's pages within the time limit, and this server caps PDFs at ${env.MAX_PDF_PAGES} pages. Try a smaller file.`,
        );
      }
      throw err;
    }
    opts.signal?.throwIfAborted();
    if (pages > env.MAX_PDF_PAGES) {
      throw new InputValidationError(
        `PDF has ${pages} pages, exceeding the maximum of ${env.MAX_PDF_PAGES}`,
      );
    }
  }
}

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
    opts: {
      scratchDir: string;
      lenient?: boolean;
      rejectPasswordProtected?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<PreparedInput> {
    if (raw.length === 0) throw new InputValidationError("Empty file");
    const lower = filename.toLowerCase();
    // PDF-only consumers set rejectPasswordProtected. Do not let a misleading
    // client filename bypass their PDF magic and structural validation.
    if (opts.rejectPasswordProtected || lower.endsWith(".pdf")) {
      if (raw.subarray(0, 5).toString() !== "%PDF-") {
        throw new InputValidationError("File does not start with a PDF header");
      }
      // When lenient, skip qpdfCheck + page-cap (repair-pdf's input is
      // intentionally damaged). The %PDF- header check above still runs.
      if (!opts.lenient && qpdfAvailable()) {
        const dir = join(opts.scratchDir, `qpdf-${randomUUID()}`);
        await mkdir(dir, { recursive: true });
        const p = join(dir, "input.pdf");
        try {
          await writeFile(p, raw);
          await validatePdfPath(p, opts);
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
