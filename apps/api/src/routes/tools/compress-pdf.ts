import { copyFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gsCompressPdfQuality } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

// Mirrors the image "compress" tool: compress by a quality slider or to a
// target file size. For PDFs the size lever is image downsampling resolution
// (DPI), so quality 1..100 maps onto a DPI range and target-size binary-
// searches that DPI.
const settingsSchema = z.object({
  mode: z.enum(["quality", "targetSize"]).default("quality"),
  quality: z.number().int().min(1).max(100).optional(),
  targetSizeKb: z.number().positive().optional(),
});

const MIN_DPI = 20;
const MAX_DPI = 300;
const qualityToDpi = (q: number) => Math.round(MIN_DPI + ((q - 1) / 99) * (MAX_DPI - MIN_DPI));

export function registerCompressPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("compress-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);
      const outPath = join(ctx.scratchDir, `${base}_compressed.pdf`);

      if (settings.mode === "targetSize" && settings.targetSizeKb) {
        // Binary-search the DPI for the highest quality that still fits the
        // target. Output size is monotonic in DPI, so the search converges.
        const targetBytes = settings.targetSizeKb * 1024;
        let lo = MIN_DPI;
        let hi = MAX_DPI;
        let bestPath: string | null = null;
        for (let i = 0; i < 6 && lo <= hi; i++) {
          const dpi = Math.round((lo + hi) / 2);
          const candidate = join(ctx.scratchDir, `cand-${dpi}.pdf`);
          ctx.report(10 + i * 13, "Compressing");
          await gsCompressPdfQuality(inPath, candidate, dpi);
          const size = (await stat(candidate)).size;
          if (size <= targetBytes) {
            bestPath = candidate;
            lo = dpi + 1; // fits: try higher quality
          } else {
            hi = dpi - 1; // too big: compress harder
          }
        }
        if (!bestPath) {
          // Target unreachable (e.g. a text-only PDF below the floor); fall
          // back to the most aggressive compression we can do.
          bestPath = join(ctx.scratchDir, "cand-min.pdf");
          await gsCompressPdfQuality(inPath, bestPath, MIN_DPI);
        }
        await copyFile(bestPath, outPath);
      } else {
        ctx.report(10, "Compressing");
        await gsCompressPdfQuality(inPath, outPath, qualityToDpi(settings.quality ?? 75));
      }

      // A "Compress" tool must never enlarge the file. If re-encoding produced
      // something at least as large as the original (common for already
      // compressed or low-DPI scanned PDFs), keep the original bytes instead.
      if ((await stat(outPath)).size >= input.buffer.length) {
        await writeFile(outPath, input.buffer);
      }

      ctx.report(95, "Done");
      return {
        scratchPath: outPath,
        filename: `${base}_compressed.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
