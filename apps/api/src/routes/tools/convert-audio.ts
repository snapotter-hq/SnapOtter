import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

// libmp3lame clamps the bitrate silently above these: MPEG-2.5 (8 kHz) tops out
// at 64 kbps, MPEG-2 (16/22.05 kHz) at 160 kbps. Reject instead of degrading.
const MP3_BITRATE_CAPS: Record<number, number> = { 8000: 64, 16000: 160, 22050: 160 };

const settingsSchema = z
  .object({
    format: z.enum(["mp3", "wav", "ogg", "flac", "m4a"]).default("mp3"),
    bitrateKbps: z.number().int().min(32).max(320).default(192),
    // Omitted = preserve the source sample rate (no -ar flag).
    sampleRate: z
      .union(
        [
          z.literal(8000),
          z.literal(16000),
          z.literal(22050),
          z.literal(32000),
          z.literal(44100),
          z.literal(48000),
          z.literal(96000),
        ],
        {
          errorMap: () => ({
            message: "must be one of 8000, 16000, 22050, 32000, 44100, 48000, 96000",
          }),
        },
      )
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.format !== "mp3" || !val.sampleRate) return;
    if (val.sampleRate === 96000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sampleRate"],
        message: "MP3 output supports sample rates up to 48000 Hz",
      });
      return;
    }
    const cap = MP3_BITRATE_CAPS[val.sampleRate];
    if (cap && val.bitrateKbps > cap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bitrateKbps"],
        message: `MP3 at ${val.sampleRate} Hz supports at most ${cap} kbps`,
      });
    }
  });

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

export function registerConvertAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-audio",
    settingsSchema,
    process: async () => {
      throw new Error("convert-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        const rate = settings.sampleRate ? ["-ar", String(settings.sampleRate)] : [];
        switch (settings.format) {
          case "wav":
            return ["-i", inPath, "-vn", "-c:a", "pcm_s16le", ...rate, out];
          case "ogg": {
            // libvorbis ABR (-b:a) fails with "encoder setup failed" when the bitrate is
            // too high for the source sample rate (e.g. 8 kHz). Use quality VBR (-q:a),
            // which adapts to the rate. Map bitrate -> quality (~bitrate/32: 192k -> q6).
            const quality = (settings.bitrateKbps / 32).toFixed(1);
            return ["-i", inPath, "-vn", "-c:a", "libvorbis", "-q:a", quality, ...rate, out];
          }
          case "flac":
            return ["-i", inPath, "-vn", "-c:a", "flac", ...rate, out];
          case "m4a":
            return [
              "-i",
              inPath,
              "-vn",
              "-c:a",
              "aac",
              "-b:a",
              `${settings.bitrateKbps}k`,
              ...rate,
              out,
            ];
          default:
            return [
              "-i",
              inPath,
              "-vn",
              "-c:a",
              "libmp3lame",
              "-b:a",
              `${settings.bitrateKbps}k`,
              ...rate,
              out,
            ];
        }
      });
      return {
        scratchPath: outPath,
        filename: outName,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
