import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type MediaStreamInfo, probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, wavPcmCodec } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(["mp3", "wav", "flac", "m4a"]).default("mp3"),
});

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

/** Functions, so the encoder is resolved per job rather than at module load (#1270). */
const ENCODERS: Record<string, (sources: Array<MediaStreamInfo | undefined>) => string[]> = {
  mp3: () => ["-c:a", resolveEncoder("mp3"), "-b:a", "192k"],
  wav: (sources) => ["-c:a", wavPcmCodec(sources)],
  flac: () => ["-c:a", "flac"],
  m4a: () => ["-c:a", "aac", "-b:a", "192k"],
};

export function registerMergeAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "merge-audio",
    maxInputs: 10,
    minInputs: 2,
    settingsSchema,
    process: async () => {
      throw new Error("merge-audio is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Merging needs at least two audio files");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const paths = await stageMediaInputs(ctx);

      // Probe each for total duration (progress mapping) and WAV bit depth
      let totalS = 0;
      const sources: Array<MediaStreamInfo | undefined> = [];
      for (const p of paths) {
        const info = await probeMedia(p);
        totalS += info.durationS ?? 0;
        sources.push(info.streams.find((s) => s.type === "audio"));
      }

      // Build per-input normalize chains + audio-only concat
      const parts: string[] = [];
      const refs: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        parts.push(
          `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
        );
        refs.push(`[a${i}]`);
      }
      const filter = `${parts.join(";")};\n${refs.join("")}concat=n=${paths.length}:v=0:a=1[a]`;

      const dir = join(ctx.scratchDir, "media");
      await mkdir(dir, { recursive: true });
      const outPath = join(dir, `merged.${settings.format}`);

      const args = [
        ...paths.flatMap((p) => ["-i", p]),
        "-filter_complex",
        filter,
        "-map",
        "[a]",
        ...ENCODERS[settings.format](sources),
        outPath,
      ];

      await runFfmpegWithProgress(ctx, args, totalS || null);

      return {
        scratchPath: outPath,
        filename: `merged.${settings.format}`,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
