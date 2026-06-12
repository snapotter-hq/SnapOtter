import { join } from "node:path";
import { probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMergeVideos(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "merge-videos",
    maxInputs: 10,
    settingsSchema,
    process: async () => {
      throw new Error("merge-videos is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Merging needs at least two videos");
      }

      const paths = await stageMediaInputs(ctx);
      const probes = [];
      for (const p of paths) {
        probes.push(await probeMedia(p));
      }

      const first = probes[0].streams.find((s) => s.type === "video");
      if (!first?.width || !first?.height) {
        throw new InputValidationError("First input has no video stream");
      }

      // Canvas: first video's dims, rounded to even
      const W = first.width - (first.width % 2);
      const H = first.height - (first.height % 2);
      const totalS = probes.reduce((a, p) => a + (p.durationS ?? 0), 0) || null;

      // Build per-input normalize chains + concat
      const parts: string[] = [];
      const refs: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        parts.push(
          `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
        );
        const hasAudio = probes[i].streams.some((s) => s.type === "audio");
        if (hasAudio) {
          parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
        } else {
          const d = probes[i].durationS ?? 1;
          parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`);
        }
        refs.push(`[v${i}][a${i}]`);
      }

      const filter = `${parts.join(";")};${refs.join("")}concat=n=${paths.length}:v=1:a=1[v][a]`;
      const outPath = join(ctx.scratchDir, "media", "merged.mp4");

      const args = [
        ...paths.flatMap((p) => ["-i", p]),
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        resolveEncoder("h264"),
        "-crf",
        "20",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        resolveEncoder("aac"),
        outPath,
      ];

      await runFfmpegWithProgress(ctx, args, totalS);

      return {
        scratchPath: outPath,
        filename: "merged.mp4",
        contentType: "video/mp4",
      };
    },
  });
}
