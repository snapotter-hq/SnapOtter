import { copyFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gsCompressPdfTuned } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

// Mirrors the image "compress" tool: compress by a quality slider or to a
// target file size. Both size levers (image DPI and JPEG quality) are folded
// into one monotonic quality axis (paramsForQuality). Quality mode runs one
// pass at the slider value; target-size binary-searches the axis for the
// largest output that still fits the target.
const settingsSchema = z.object({
  mode: z.enum(["quality", "targetSize"]).default("quality"),
  quality: z.number().int().min(1).max(100).optional(),
  targetSizeKb: z.number().positive().optional(),
});

const MIN_DPI = 20;
const MAX_DPI = 300;

/**
 * Single monotonic quality axis shared by both modes. Quality 1..100 maps to a
 * (dpi, qFactor) pair whose output size increases with q. The top half (q>=50)
 * preserves resolution and trades JPEG quality; the bottom half drops resolution
 * for aggressive targets. Verified monotonic on real scans (see spec).
 */
export function paramsForQuality(q: number): { dpi: number; qFactor: number } {
  const clamped = Math.max(1, Math.min(100, Math.round(q)));
  const dpi = clamped >= 50 ? MAX_DPI : Math.round(MIN_DPI + ((MAX_DPI - MIN_DPI) * clamped) / 50);
  const qFactor = 0.1 + 2.4 * ((100 - clamped) / 99) ** 1.5;
  return { dpi, qFactor };
}

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

      let resultPayload: Record<string, unknown> | undefined;

      if (settings.mode === "targetSize" && settings.targetSizeKb) {
        const targetBytes = settings.targetSizeKb * 1024;
        // Binary-search the quality axis for the largest output that still fits.
        // Memoize by q so repeated probes never re-run ghostscript.
        const cache = new Map<number, { path: string; size: number }>();
        const runQ = async (q: number) => {
          const key = Math.max(1, Math.min(100, Math.round(q)));
          const hit = cache.get(key);
          if (hit) return hit;
          const { dpi, qFactor } = paramsForQuality(key);
          const path = join(ctx.scratchDir, `cand-q${key}.pdf`);
          await gsCompressPdfTuned(inPath, path, dpi, qFactor);
          const entry = { path, size: (await stat(path)).size };
          cache.set(key, entry);
          return entry;
        };

        let lo = 1;
        let hi = 100;
        let best: { path: string; size: number } | null = null;
        let smallest: { path: string; size: number } | null = null;
        const MAX_ITERS = 8;
        for (let iter = 0; iter < MAX_ITERS && lo <= hi; iter++) {
          const q = Math.round((lo + hi) / 2);
          ctx.report(10 + iter * 10, "Searching");
          const cand = await runQ(q);
          if (!smallest || cand.size < smallest.size) smallest = cand;
          if (cand.size <= targetBytes) {
            if (!best || cand.size > best.size) best = cand;
            if (cand.size >= targetBytes * 0.9) break; // close enough
            lo = q + 1; // room to grow: raise quality
          } else {
            hi = q - 1; // too big: compress harder
          }
        }

        // smallest is always set after >=1 iteration.
        const chosen = best ?? (smallest as { path: string; size: number });
        if (chosen.size >= input.buffer.length) {
          await writeFile(outPath, input.buffer); // never enlarge
        } else {
          await copyFile(chosen.path, outPath);
        }
        const finalSize = (await stat(outPath)).size;
        resultPayload = { targetKb: settings.targetSizeKb, targetMet: finalSize <= targetBytes };
      } else {
        ctx.report(10, "Compressing");
        const { dpi, qFactor } = paramsForQuality(settings.quality ?? 75);
        await gsCompressPdfTuned(inPath, outPath, dpi, qFactor);
        // A "Compress" tool must never enlarge the file.
        if ((await stat(outPath)).size >= input.buffer.length) {
          await writeFile(outPath, input.buffer);
        }
      }

      ctx.report(95, "Done");
      return {
        scratchPath: outPath,
        filename: `${base}_compressed.pdf`,
        contentType: "application/pdf",
        resultPayload,
      };
    },
  });
}
