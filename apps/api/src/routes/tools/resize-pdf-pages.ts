import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfcpuResize } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

/** Portrait width x height in points. */
const PAGE_SIZES = {
  "4x6in": [288, 432],
  "100x150mm": [283.46, 425.2],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  a6: [297.64, 419.53],
  letter: [612, 792],
  legal: [612, 1008],
} as const satisfies Record<string, readonly [number, number]>;

const POINTS_PER_UNIT = { in: 72, mm: 72 / 25.4 } as const;
const MIN_SIDE_POINTS = 36;
const MAX_SIDE_POINTS = 14400;

const settingsSchema = z
  .object({
    pageSize: z
      .enum(["4x6in", "100x150mm", "a4", "a5", "a6", "letter", "legal", "custom"])
      .default("4x6in"),
    // Bounded only when pageSize is custom (superRefine below), so a stale
    // custom value left in a pipeline step can't fail a preset.
    width: z.number().finite().default(4),
    height: z.number().finite().default(6),
    unit: z.enum(["in", "mm"]).default("in"),
    keepOrientation: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.pageSize !== "custom") return;
    const perUnit = POINTS_PER_UNIT[s.unit];
    for (const key of ["width", "height"] as const) {
      const points = s[key] * perUnit;
      if (points < MIN_SIDE_POINTS || points > MAX_SIDE_POINTS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message:
            s.unit === "in"
              ? "Custom page sides must be 0.5-200 in"
              : "Custom page sides must be 12.7-5080 mm",
        });
      }
    }
  });

export function registerResizePdfPages(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "resize-pdf-pages",
    settingsSchema,
    process: async () => {
      throw new Error("resize-pdf-pages is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const [width, height] =
        settings.pageSize === "custom"
          ? [
              settings.width * POINTS_PER_UNIT[settings.unit],
              settings.height * POINTS_PER_UNIT[settings.unit],
            ]
          : PAGE_SIZES[settings.pageSize];

      const outPath = join(ctx.scratchDir, `${base}_resized.pdf`);
      ctx.report(10, "Resizing pages");
      await pdfcpuResize(
        inPath,
        { width, height, keepOrientation: settings.keepOrientation },
        outPath,
        { signal: ctx.signal },
      );
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_resized.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
