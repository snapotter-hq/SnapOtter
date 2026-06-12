import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { resolveEncoder, resolveFontFile } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(200),
  position: z.enum(["tl", "tc", "tr", "l", "c", "r", "bl", "bc", "br"]).default("br"),
  fontSize: z.number().int().min(8).max(120).default(36),
  opacity: z.number().min(0.05).max(1).default(0.5),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
});

const POS: Record<string, string> = {
  tl: "x=24:y=24",
  tc: "x=(w-tw)/2:y=24",
  tr: "x=w-tw-24:y=24",
  l: "x=24:y=(h-th)/2",
  c: "x=(w-tw)/2:y=(h-th)/2",
  r: "x=w-tw-24:y=(h-th)/2",
  bl: "x=24:y=h-th-24",
  bc: "x=(w-tw)/2:y=h-th-24",
  br: "x=w-tw-24:y=h-th-24",
};

export function registerWatermarkVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "watermark-video",
    settingsSchema,
    process: async () => {
      throw new Error("watermark-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_watermarked${origExt}`;
      const contentType = videoContentType(origExt);

      const font = resolveFontFile();
      if (!font) {
        throw new Error("No usable font found for watermarking (set SNAPOTTER_FONT_FILE)");
      }

      const textFile = join(ctx.scratchDir, "wm-text.txt");
      await writeFile(textFile, settings.text, "utf8");

      const color = `${settings.color.replace("#", "0x")}@${settings.opacity.toFixed(2)}`;

      // expansion=none: user text is literal; %{...} sequences must not expand
      const vf = `drawtext=fontfile=${font.file}:textfile=${textFile}:fontsize=${settings.fontSize}:fontcolor=${color}:${POS[settings.position]}:expansion=none`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => [
        "-i",
        inPath,
        "-vf",
        vf,
        "-c:v",
        resolveEncoder("h264"),
        "-crf",
        "20",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        out,
      ]);

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
