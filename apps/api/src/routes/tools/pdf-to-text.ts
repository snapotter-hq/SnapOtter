import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type PdfTextResult, pdfTextPy } from "@snapotter/doc-engine";
import { NO_TEXT_LAYER_CODE } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

const SCANNED_MESSAGE =
  "This PDF has no extractable text layer. It looks scanned or image-only, so use the PDF OCR tool to read its text.";
const UNREADABLE_MESSAGE =
  "This PDF has a text layer, but its fonts don't map to readable characters, so use the PDF OCR tool to read its text.";

/**
 * Only call it a scan when no page returned characters at all. A page whose
 * characters failed the readability test has a real text layer the user can
 * see on screen, so "image-only" would read as flatly wrong there (#954). An
 * older sidecar sends no counts, and keeps the wording it always had.
 */
function noTextLayerMessage(result: PdfTextResult): string {
  return (result.unreadablePages ?? 0) > 0 ? UNREADABLE_MESSAGE : SCANNED_MESSAGE;
}

export function registerPdfToText(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-to-text",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-to-text is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}.txt`);
      ctx.report(10, "Extracting text");
      const result = await pdfTextPy(inPath, outPath, { signal: ctx.signal });
      // A scanned or image-only PDF has no text layer, so extraction returns an
      // empty file. Rather than hand back a silent 0-byte "success", refuse it
      // (#589). The code lets the web app offer OCR as a button instead of a
      // dead end (#1164); OCR stays the user's call because it needs an AI
      // bundle and runs for minutes.
      if (!result.hasText) {
        throw new InputValidationError(
          noTextLayerMessage(result),
          422,
          undefined,
          NO_TEXT_LAYER_CODE,
        );
      }
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.txt`,
        contentType: "text/plain",
        // The .txt keeps every page as extracted, unreadable ones included:
        // dropping text on a heuristic is worse than showing it. Say how many
        // pages it was so the junk isn't silent (#954).
        resultPayload: {
          chars: result.chars,
          ...(result.unreadablePages && result.pages
            ? { unreadablePages: { count: result.unreadablePages, total: result.pages } }
            : {}),
        },
      };
    },
  });
}
