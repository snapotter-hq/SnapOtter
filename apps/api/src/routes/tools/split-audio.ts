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

// Stream copy cuts on codec frame boundaries, so a remainder shorter than a
// couple of frames becomes a part ffprobe cannot open (#4438). Matches
// trim-audio's MIN_TRIM_WINDOW_S: below this, the tail joins the previous part.
const MIN_TAIL_S = 0.1;
const NOTHING_TO_SPLIT = "Nothing to split: output would be a single segment";

/**
 * The -segment_time to pass for time mode, or null when the input fits in one
 * part. A remainder under MIN_TAIL_S is spread across the full parts by
 * stretching each one slightly (by at most 2 * MIN_TAIL_S / parts), so the
 * last cut lands past the end of the input. A cut list (-segment_times)
 * would keep exact boundaries but can outgrow Linux's 128 KiB per-argument
 * limit on long inputs split into short parts.
 */
export function timeModeSegmentLength(durationS: number, segmentS: number): number | null {
  const fullParts = Math.floor(durationS / segmentS);
  const tailS = durationS - fullParts * segmentS;
  if (tailS >= MIN_TAIL_S) {
    return fullParts >= 1 ? segmentS : null;
  }
  if (fullParts < 2) {
    return null;
  }
  return (durationS + MIN_TAIL_S) / fullParts;
}

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
        } else if (duration === null || duration === undefined) {
          segLen = settings.segmentS;
        } else {
          const stretched = timeModeSegmentLength(duration, settings.segmentS);
          if (stretched === null) {
            throw new InputValidationError(NOTHING_TO_SPLIT);
          }
          segLen = stretched;
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
        throw new InputValidationError(NOTHING_TO_SPLIT);
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
