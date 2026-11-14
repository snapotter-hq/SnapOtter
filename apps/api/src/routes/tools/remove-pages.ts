import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfPageCount, qpdfPagesSpecUnchecked } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { compressPageRuns, parsePageSpec } from "../../lib/page-spec.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const rangeField = z
  .string()
  .max(200)
  .regex(/^[0-9rz][0-9rz,-]*$/i, "Invalid page range");

const CANNOT_REMOVE_ALL_PAGES = "CANNOT_REMOVE_ALL_PAGES";

const settingsSchema = z.object({
  pages: rangeField,
});

export function registerRemovePages(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "remove-pages",
    settingsSchema,
    process: async () => {
      throw new Error("remove-pages is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      ctx.report(10, "Analyzing pages");
      const total = await qpdfPageCount(inPath, { signal: ctx.signal });
      const removeSet = parsePageSpec(settings.pages, total);

      // Build the keep list: all pages NOT in the remove set
      const keepPages: number[] = [];
      for (let i = 1; i <= total; i++) {
        if (!removeSet.has(i)) {
          keepPages.push(i);
        }
      }

      if (keepPages.length === 0) {
        throw new InputValidationError(
          "Cannot remove every page from the document",
          400,
          undefined,
          CANNOT_REMOVE_ALL_PAGES,
        );
      }

      const keepSpec = compressPageRuns(keepPages);
      const outPath = join(ctx.scratchDir, `${base}_removed.pdf`);
      ctx.report(30, "Removing pages");
      await qpdfPagesSpecUnchecked(inPath, keepSpec, outPath, { signal: ctx.signal });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_removed.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
