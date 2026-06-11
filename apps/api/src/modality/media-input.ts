import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import { env } from "../config.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

/**
 * Video/audio validation via capped ffprobe (spec 4.7). ffprobe needs a real
 * file (mp4 moov atoms may trail), so the buffer lands in the scratch dir.
 */
export class MediaInputHandler implements InputHandler {
  constructor(private kind: "video" | "audio") {}

  async prepare(
    raw: Buffer,
    filename: string,
    opts: { scratchDir: string },
  ): Promise<PreparedInput> {
    const probeDir = join(opts.scratchDir, `probe-${randomUUID()}`);
    await mkdir(probeDir, { recursive: true });
    const probePath = join(probeDir, "input");
    try {
      await writeFile(probePath, raw);
      let info: Awaited<ReturnType<typeof probeMedia>>;
      try {
        info = await probeMedia(probePath);
      } catch (err) {
        throw new InputValidationError(
          `Unrecognized ${this.kind} file: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const hasVideo = info.streams.some((s) => s.type === "video");
      const hasAudio = info.streams.some((s) => s.type === "audio");
      if (this.kind === "video" && !hasVideo) {
        throw new InputValidationError("File contains no video stream");
      }
      if (this.kind === "audio" && !hasAudio) {
        throw new InputValidationError("File contains no audio stream");
      }
      const durationCap =
        this.kind === "video" ? env.MAX_VIDEO_DURATION_S : env.MAX_AUDIO_DURATION_S;
      if (durationCap > 0 && info.durationS !== null && info.durationS > durationCap) {
        throw new InputValidationError(
          `Duration ${Math.round(info.durationS)}s exceeds the maximum of ${durationCap}s`,
        );
      }
      if (
        this.kind === "video" &&
        env.MAX_VIDEO_BITRATE_KBPS > 0 &&
        info.bitrateKbps !== null &&
        info.bitrateKbps > env.MAX_VIDEO_BITRATE_KBPS
      ) {
        throw new InputValidationError(
          `Bitrate ${info.bitrateKbps}kbps exceeds the maximum of ${env.MAX_VIDEO_BITRATE_KBPS}kbps`,
        );
      }
      return { buffer: raw, filename };
    } finally {
      await rm(probeDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
