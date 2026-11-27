import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCropFits,
  type PdfCropBox,
  pdfcpuCrop,
  pdfcpuPageSizes,
} from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const sideMargin = z.number().min(0).max(2000).default(0);
const regionValue = z.number().min(0).max(14_400);

// Flat so pipelines and older API calls that only send `margin` keep working:
// `mode` defaults to "uniform", and each mode reads only its own fields.
// The region defaults to a 4x6 in shipping label in the top-left corner (#4988).
const settingsSchema = z.object({
  mode: z.enum(["uniform", "sides", "region"]).default("uniform"),
  margin: z.number().min(0).max(2000).default(20),
  top: sideMargin,
  right: sideMargin,
  bottom: sideMargin,
  left: sideMargin,
  x: regionValue.default(0),
  y: regionValue.default(0),
  width: regionValue.min(1).default(288),
  height: regionValue.min(1).default(432),
});

function cropBox(s: z.infer<typeof settingsSchema>): PdfCropBox {
  switch (s.mode) {
    case "uniform":
      return { mode: "uniform", margin: s.margin };
    case "sides":
      return { mode: "sides", top: s.top, right: s.right, bottom: s.bottom, left: s.left };
    case "region":
      return { mode: "region", x: s.x, y: s.y, width: s.width, height: s.height };
  }
}

export function registerCropPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "crop-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("crop-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const box = cropBox(settingsSchema.parse(ctx.settings));
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_cropped.pdf`);
      assertCropFits(box, await pdfcpuPageSizes(inPath, { signal: ctx.signal }));
      ctx.report(10, "Cropping");
      await pdfcpuCrop(inPath, box, outPath, { signal: ctx.signal });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_cropped.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
