import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfPagesSpec } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const rangeField = z
  .string()
  .max(200)
  .regex(/^[0-9rz][0-9rz,-]*$/i, "Invalid page range");

const settingsSchema = z.object({
  order: rangeField,
});

export function registerOrganizePdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "organize-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("organize-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_organized.pdf`);
      ctx.report(10, "Reordering pages");
      await qpdfPagesSpec(inPath, settings.order, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_organized.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
