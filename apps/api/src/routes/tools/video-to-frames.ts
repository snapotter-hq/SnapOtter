import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { probeMedia, runFfmpeg } from "@snapotter/media-engine";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    mode: z.enum(["all", "nth", "timestamps"]).default("all"),
    n: z.number().int().min(2).max(1000).default(10),
    timestamps: z.string().max(500).default(""),
    format: z.enum(["png", "jpg"]).default("png"),
  })
  .refine((s) => s.mode !== "timestamps" || s.timestamps.trim().length > 0, {
    message: "Provide timestamps",
  });

export function registerVideoToFrames(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-to-frames",
    settingsSchema,
    process: async () => {
      throw new Error("video-to-frames is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const durationS = info.durationS ?? 0;

      const framesDir = join(ctx.scratchDir, "media", "frames");
      await mkdir(framesDir, { recursive: true });

      if (settings.mode === "all") {
        // Guard: estimate frames as durationS * 30 (safe ceiling; probe lacks fps)
        if (durationS * 30 > 2000) {
          throw new InputValidationError("Too many frames; use every-Nth or timestamps mode");
        }
        ctx.report(5, "Extracting frames");
        await runFfmpeg(["-i", inPath, join(framesDir, `frame-%06d.${settings.format}`)], {
          signal: ctx.signal,
          timeoutMs: 30 * 60_000,
        });
      } else if (settings.mode === "nth") {
        ctx.report(5, "Extracting frames");
        await runFfmpeg(
          [
            "-i",
            inPath,
            "-vf",
            `select=not(mod(n\\,${settings.n}))`,
            "-fps_mode",
            "vfr",
            join(framesDir, `frame-%06d.${settings.format}`),
          ],
          { signal: ctx.signal, timeoutMs: 30 * 60_000 },
        );
      } else {
        // timestamps mode
        const stamps = settings.timestamps.split(",").map((t) => Number(t.trim()));
        for (const t of stamps) {
          if (Number.isNaN(t) || t < 0) {
            throw new InputValidationError(
              `Invalid timestamp "${t}": each timestamp must be a non-negative number`,
            );
          }
          if (t > durationS) {
            throw new InputValidationError(
              `Timestamp ${t}s is beyond the video duration of ${durationS.toFixed(1)}s`,
            );
          }
        }
        if (stamps.length > 50) {
          throw new InputValidationError("Too many timestamps; maximum is 50 per extraction");
        }
        for (let idx = 0; idx < stamps.length; idx++) {
          const t = stamps[idx];
          const frameName = `frame-${String(idx).padStart(3, "0")}.${settings.format}`;
          ctx.report(
            Math.min(90, 5 + Math.round(((idx + 1) / stamps.length) * 85)),
            `Extracting frame ${idx + 1}/${stamps.length}`,
          );
          await runFfmpeg(
            ["-ss", String(t), "-i", inPath, "-frames:v", "1", join(framesDir, frameName)],
            { signal: ctx.signal, timeoutMs: 60_000 },
          );
        }
      }

      // Collect produced frames
      const files = (await readdir(framesDir)).filter((f) => f.endsWith(`.${settings.format}`));
      files.sort();
      if (files.length === 0) {
        throw new Error("No frames extracted");
      }

      // Zip frames (same pattern as split-pdf.ts)
      ctx.report(92, "Creating archive");
      const zipPath = join(ctx.scratchDir, "media", `${base}_frames.zip`);
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
        filename: `${base}_frames.zip`,
        contentType: "application/zip",
      };
    },
  });
}
