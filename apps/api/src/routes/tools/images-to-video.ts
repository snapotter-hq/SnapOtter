import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { runFfmpegWithProgress } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute, type ToolProcessCtxV2 } from "../tool-factory.js";

const DIMS: Record<string, { w: number; h: number }> = {
  "1080p": { w: 1920, h: 1080 },
  "720p": { w: 1280, h: 720 },
  square: { w: 1080, h: 1080 },
};

const settingsSchema = z.object({
  secondsPerImage: z.number().min(0.5).max(10).default(2),
  resolution: z.enum(["1080p", "720p", "square"]).default("720p"),
  fps: z.number().int().min(10).max(60).default(30),
});

export function registerImagesToVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "images-to-video",
    maxInputs: 60,
    inputKinds: ["image"],
    settingsSchema,
    process: async () => {
      throw new Error("images-to-video is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Provide at least two images");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const { w: W, h: H } = DIMS[settings.resolution];

      const paths = await stageImageFrames(ctx);

      const parts: string[] = [];
      const refs: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        parts.push(
          `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`,
        );
        refs.push(`[v${i}]`);
      }
      const filter = `${parts.join(";")};${refs.join("")}concat=n=${paths.length}:v=1:a=0[v]`;

      const args = [
        ...paths.flatMap((p) => ["-loop", "1", "-t", String(settings.secondsPerImage), "-i", p]),
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-r",
        String(settings.fps),
        "-c:v",
        resolveEncoder("h264"),
        "-crf",
        "20",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        join(ctx.scratchDir, "media", "slideshow.mp4"),
      ];

      const progressDuration = paths.length * settings.secondsPerImage;
      await runFfmpegWithProgress(ctx, args, progressDuration);

      return {
        scratchPath: join(ctx.scratchDir, "media", "slideshow.mp4"),
        filename: "slideshow.mp4",
        contentType: "video/mp4",
      };
    },
  });
}

async function stageImageFrames(ctx: ToolProcessCtxV2): Promise<string[]> {
  const dir = join(ctx.scratchDir, "media", "frames");
  await mkdir(dir, { recursive: true });

  return Promise.all(
    ctx.inputs.map(async (input, index) => {
      const framePath = join(dir, `frame-${String(index).padStart(4, "0")}.png`);
      await sharp(input.buffer, { animated: false }).png().toFile(framePath);
      return framePath;
    }),
  );
}
