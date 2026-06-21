import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import { SUBTITLE_INPUTS } from "@snapotter/shared";
import { env } from "../config.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

export type MediaInputKind = "video" | "audio" | "image" | "subtitle";

const SUBTITLE_EXT_SET = new Set<string>(SUBTITLE_INPUTS);
const MAX_SUBTITLE_BYTES = 1 * 1024 * 1024; // 1 MiB

/**
 * Video/audio/image/subtitle validation via capped ffprobe (spec 4.7).
 * ffprobe needs a real file (mp4 moov atoms may trail), so the buffer
 * lands in the scratch dir for video/audio/image kinds.  Subtitle kind
 * skips ffprobe entirely (text-based, extension + content checks only).
 */
export class MediaInputHandler implements InputHandler {
  constructor(private kind: MediaInputKind) {}

  async prepare(
    raw: Buffer,
    filename: string,
    opts: { scratchDir: string },
  ): Promise<PreparedInput> {
    if (this.kind === "subtitle") {
      return this.prepareSubtitle(raw, filename);
    }

    const probeDir = join(opts.scratchDir, `probe-${randomUUID()}`);
    await mkdir(probeDir, { recursive: true });
    const probePath = join(probeDir, "input");
    try {
      await writeFile(probePath, raw);
      let info: Awaited<ReturnType<typeof probeMedia>>;
      try {
        info = await probeMedia(probePath);
      } catch {
        // ffprobe could not parse the upload. Surface a clean message; the raw
        // tool error is intentionally not exposed to the client, and a bad
        // upload is not a server fault worth logging from this low-level handler.
        throw new InputValidationError(
          `Unrecognized ${this.kind} file. It may be corrupt or in an unsupported format.`,
        );
      }
      const hasVideo = info.streams.some((s) => s.type === "video");
      const hasAudio = info.streams.some((s) => s.type === "audio");

      // ffprobe reports still images as single-frame video streams in
      // *_pipe/image2 containers with no duration.
      const IMAGE_CONTAINER_RE =
        /(^|,)(png_pipe|image2|bmp_pipe|gif_pipe|jpeg_pipe|tiff_pipe|webp_pipe|svg_pipe)($|,)/;
      const isStillImage = IMAGE_CONTAINER_RE.test(info.container) && info.durationS === null;

      if (this.kind === "image") {
        // Image kind: accept still images only; reject audio-only and real videos
        if (!hasVideo) {
          throw new InputValidationError("File is not a still image");
        }
        if (!isStillImage) {
          throw new InputValidationError("File is not a still image");
        }
        return { buffer: raw, filename };
      }

      if (this.kind === "video" && !hasVideo) {
        throw new InputValidationError("File contains no video stream");
      }
      if (this.kind === "video" && isStillImage) {
        throw new InputValidationError("File is a still image, not a video");
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

  private prepareSubtitle(raw: Buffer, filename: string): PreparedInput {
    const ext = extname(filename).toLowerCase();
    if (!SUBTITLE_EXT_SET.has(ext)) {
      throw new InputValidationError("Not a valid subtitle file (.srt, .vtt, .ass)");
    }
    if (raw.length > MAX_SUBTITLE_BYTES) {
      throw new InputValidationError("Not a valid subtitle file (.srt, .vtt, .ass)");
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
    // Detect the SRT/VTT cue timecode arrow (e.g. "00:00:01,000 --> 00:00:04,000")
    // by requiring the surrounding timestamp, not a bare "-->" (which also matches
    // non-subtitle text and tripped CodeQL's HTML-comment heuristic).
    const looksLikeSubtitle =
      /\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->/.test(text) || /\[Script Info\]/i.test(text);
    if (!looksLikeSubtitle) {
      throw new InputValidationError("Not a valid subtitle file (.srt, .vtt, .ass)");
    }
    return { buffer: raw, filename };
  }
}
