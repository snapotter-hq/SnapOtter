import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  rowsPerFile: z.number().int().min(1).max(1_000_000).default(1000),
  keepHeader: z.boolean().default(true),
});

export function registerSplitCsv(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "split-csv",
    settingsSchema,
    process: async () => {
      throw new Error("split-csv is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");

      const parsed = Papa.parse<string[]>(input.buffer.toString("utf8"), {
        header: false,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) {
        throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
      }
      const allRows = parsed.data;
      if (allRows.length === 0) {
        throw new Error("CSV file is empty");
      }

      const header = settings.keepHeader ? allRows[0] : null;
      const dataRows = settings.keepHeader ? allRows.slice(1) : allRows;

      // Chunk data rows
      const chunks: string[][][] = [];
      for (let i = 0; i < dataRows.length; i += settings.rowsPerFile) {
        chunks.push(dataRows.slice(i, i + settings.rowsPerFile));
      }

      // Write part files to scratch
      const partPaths: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const rows = header ? [header, ...chunks[i]] : chunks[i];
        const csv = Papa.unparse(rows);
        const partPath = join(ctx.scratchDir, `part-${i + 1}.csv`);
        await writeFile(partPath, csv, "utf8");
        partPaths.push(partPath);
        const pct = Math.min(80, 10 + Math.round(((i + 1) / chunks.length) * 70));
        ctx.report(pct, `Writing part ${i + 1} of ${chunks.length}`);
      }

      // Zip the parts (mirrors split-pdf archiver pattern)
      ctx.report(85, "Creating archive");
      const zipPath = join(ctx.scratchDir, `${base}_parts.zip`);
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 5 } });
        output.on("close", () => resolve());
        archive.on("error", (err: Error) => reject(err));
        archive.pipe(output);
        for (let i = 0; i < partPaths.length; i++) {
          archive.file(partPaths[i], { name: `part-${i + 1}.csv` });
        }
        void archive.finalize();
      });

      return {
        scratchPath: zipPath,
        filename: `${base}_parts.zip`,
        contentType: "application/zip",
      };
    },
  });
}
