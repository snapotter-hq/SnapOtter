import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type PdfPageRotation,
  qpdfAssemblePages,
  qpdfPageCount,
  qpdfRotatePages,
} from "@snapotter/doc-engine";
import { PDF_MULTI_TOOL_LIMITS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

/**
 * PDF Multi-Tool: one route assembles the final document from a page plan
 * built in the editor — reorder, duplicate, delete, rotate, and pull pages
 * from additional PDFs, all in one submission.
 *
 * Inputs are the uploaded PDFs in document order: the file being edited is
 * always doc 0 (it may be the only input), followed by the extra documents in
 * the order they were added in the editor. Clients send one `pageCounts`
 * entry per uploaded file so the server can reject out-of-range pages with a
 * clear message. The server also checks each count against the actual PDF.
 */

const rotationSchema = z.union([z.literal(90), z.literal(180), z.literal(270)]);

const pageItemSchema = z.object({
  /** Index into the uploaded files, in upload order. */
  doc: z
    .number()
    .int()
    .min(0)
    .max(PDF_MULTI_TOOL_LIMITS.documents - 1),
  /** 1-based page number within that document. */
  page: z.number().int().min(1),
  /** Clockwise degrees to record on this page when copying. */
  rot: rotationSchema.optional(),
});

const settingsSchema = z.object({
  /** Output page plan, in output order. */
  items: z.array(pageItemSchema).min(1).max(PDF_MULTI_TOOL_LIMITS.outputPages),
  /** Real page count of each uploaded document, pdfjs-derived, indexer-aligned. */
  pageCounts: z.array(z.number().int().min(1).max(10_000)).max(PDF_MULTI_TOOL_LIMITS.documents),
});

function validatePlan(settings: z.infer<typeof settingsSchema>, inputCount: number) {
  if (settings.pageCounts.length !== inputCount) {
    throw new InputValidationError(
      `The plan describes ${settings.pageCounts.length} documents but ${inputCount} were uploaded`,
    );
  }
  for (const item of settings.items) {
    if (item.page > (settings.pageCounts[item.doc] ?? 0)) {
      throw new InputValidationError(
        `Page ${item.page} does not exist in document ${item.doc + 1}`,
      );
    }
  }
}

export function registerMultiToolPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "multi-tool-pdf",
    maxInputs: PDF_MULTI_TOOL_LIMITS.documents,
    minInputs: 1,
    settingsSchema,
    // Worker failures become HTTP 422. Validate the client plan before
    // enqueueing to preserve the documented 400 response.
    preValidate: ({ inputs, settings }) => validatePlan(settings, inputs.length),
    process: async () => {
      throw new Error("multi-tool-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      validatePlan(settings, ctx.inputs.length);

      // Stage every input once. Sequence-prefixed because two uploads can share
      // a filename.
      const docPaths: string[] = [];
      for (let i = 0; i < ctx.inputs.length; i++) {
        const safeName = ctx.inputs[i].filename.replace(/[^A-Za-z0-9._-]/g, "_");
        const docPath = join(ctx.scratchDir, `doc-${i}-${safeName}`);
        await writeFile(docPath, ctx.inputs[i].buffer);
        if ((await qpdfPageCount(docPath)) !== settings.pageCounts[i]) {
          throw new InputValidationError(`Page count does not match document ${i + 1}`);
        }
        docPaths.push(docPath);
      }
      ctx.report(10, "Staging documents");

      ctx.report(50, "Assembling pages");
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "") || "document";
      const outPath = join(ctx.scratchDir, "output.pdf");
      // Rotations belong to output positions, not source pages. Assemble
      // first so two copies of one source page can have different rotations.
      const rotations: PdfPageRotation[] = settings.items.flatMap((item, i) =>
        item.rot === undefined ? [] : [{ page: i + 1, angle: item.rot }],
      );
      const assembled = rotations.length ? join(ctx.scratchDir, "assembled.pdf") : outPath;
      await qpdfAssemblePages(docPaths, settings.items, assembled);
      if (rotations.length) await qpdfRotatePages(assembled, rotations, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_multi-tool.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
