import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { probeMedia, runFfmpeg } from "@snapotter/media-engine";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["time", "parts", "silence"]).default("time"),
  segmentS: z.number().min(1).max(3600).default(60),
  parts: z.number().int().min(2).max(20).default(2),
  thresholdDb: z.number().min(-80).max(-20).default(-40),
  minSilenceS: z.number().min(0.1).max(10).default(0.3),
});

export function registerSplitAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "split-audio",
    settingsSchema,
    process: async () => {
      throw new Error("split-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const srcExt = extname(ctx.inputs[0].filename) || ".mp3";

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const duration = info.durationS;

      const framesDir = join(ctx.scratchDir, "media", "parts");
      await mkdir(framesDir, { recursive: true });

      if (settings.mode === "time" || settings.mode === "parts") {
        let segLen: number;
        if (settings.mode === "parts") {
          if (duration === null || duration === undefined) {
            throw new InputValidationError("Could not determine audio duration");
          }
          segLen = Math.max(0.1, duration / settings.parts + 0.001);
        } else {
          segLen = settings.segmentS;
        }

        ctx.report(5, "Splitting audio");
        await runFfmpeg(
          [
            "-i",
            inPath,
            "-f",
            "segment",
            "-segment_time",
            String(segLen),
            "-c",
            "copy",
            join(framesDir, `part-%03d${srcExt}`),
          ],
          { signal: ctx.signal, timeoutMs: 10 * 60_000 },
        );
      } else {
        // silence mode: pass 1 - detect silence regions
        ctx.report(5, "Detecting silence");
        const nullOut = join(ctx.scratchDir, "media", "null.out");
        const stderr = await runFfmpeg(
          [
            "-i",
            inPath,
            "-af",
            `silencedetect=noise=${settings.thresholdDb}dB:d=${settings.minSilenceS}`,
            "-f",
            "null",
            nullOut,
          ],
          { signal: ctx.signal, timeoutMs: 10 * 60_000 },
        );

        // Parse silence_start / silence_end pairs and compute midpoints
        const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
        const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
        const cuts: number[] = [];
        for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
          cuts.push((starts[i] + ends[i]) / 2);
        }
        if (cuts.length === 0) {
          throw new InputValidationError("No silence found to split at");
        }

        // Build segment boundaries
        const d = duration ?? 0;
        const boundaries = [0, ...cuts, d];
        const total = boundaries.length - 1;

        for (let seg = 0; seg < total; seg++) {
          const from = boundaries[seg];
          const to = boundaries[seg + 1];
          const partPath = join(framesDir, `part-${String(seg).padStart(3, "0")}${srcExt}`);
          ctx.report(
            Math.min(90, 10 + Math.round(((seg + 1) / total) * 80)),
            `Extracting segment ${seg + 1}/${total}`,
          );
          await runFfmpeg(
            ["-ss", String(from), "-to", String(to), "-i", inPath, "-c", "copy", partPath],
            {
              signal: ctx.signal,
              timeoutMs: 60_000,
            },
          );
        }
      }

      // Collect produced parts
      const files = (await readdir(framesDir)).filter((f) => f.endsWith(srcExt));
      files.sort();
      if (files.length < 2) {
        throw new InputValidationError("Nothing to split: output would be a single segment");
      }

      // Zip parts (same pattern as video-to-frames)
      ctx.report(92, "Creating archive");
      const zipPath = join(ctx.scratchDir, "media", `${base}_parts.zip`);
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 5 } });
        output.on("close", () => resolve());
        archive.on("error", (err: Error) => reject(err));
        archive.pipe(output);
        for (const f of files) {
          archive.file(join(framesDir, f), { name: f });
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
