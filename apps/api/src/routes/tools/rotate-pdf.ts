import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfRotate } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  angle: z.union([z.literal(90), z.literal(180), z.literal(270)]).default(90),
  range: z
    .string()
    .max(200)
    .regex(/^[0-9rz][0-9rz,-]*$/i, "Invalid page range")
    .default("1-z"),
});

export function registerRotatePdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "rotate-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("rotate-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_rotated.pdf`);
      ctx.report(10, "Rotating");
      await qpdfRotate(inPath, settings.angle, settings.range, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_rotated.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
