import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import { SUBTITLE_INPUTS } from "@snapotter/shared";
import { env } from "../config.js";
import { isBinarySpawnFailure } from "../lib/binary-overrides.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

export type MediaInputKind = "video" | "audio" | "image" | "subtitle";

const SUBTITLE_EXT_SET = new Set<string>(SUBTITLE_INPUTS);
const MAX_SUBTITLE_BYTES = 1 * 1024 * 1024; // 1 MiB

/**
 * True when the probe failed because the engine is missing or misconfigured,
 * rather than because the file is bad. Two ways to get here: nothing on PATH
 * and no override, which media-engine reports before spawning; or a spawn
 * failure (ENOENT for a missing FFPROBE_PATH, EACCES for a directory or missing
 * execute bit, ENOEXEC for a wrong-architecture binary, ENOMEM/EAGAIN).
 * Both are the operator's container. A real parse failure carries ffprobe's own
 * stderr and must keep being treated as a client error.
 */
function isEngineUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (/\bffprobe binary not found\b/.test(err.message)) return true;
  return isBinarySpawnFailure(err);
}

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
    opts: { scratchDir: string; signal?: AbortSignal },
  ): Promise<PreparedInput> {
    opts.signal?.throwIfAborted();
    if (this.kind === "subtitle") {
      return this.prepareSubtitle(raw, filename);
    }

    const probeDir = join(opts.scratchDir, `probe-${randomUUID()}`);
    await mkdir(probeDir, { recursive: true });
    const probePath = join(probeDir, "input");
    try {
      opts.signal?.throwIfAborted();
      await writeFile(probePath, raw, { signal: opts.signal });
      let info: Awaited<ReturnType<typeof probeMedia>>;
      try {
        info = await probeMedia(probePath, { signal: opts.signal });
      } catch (err) {
        opts.signal?.throwIfAborted();
        if (err instanceof Error && err.name === "AbortError") {
          throw err;
        }
        // An absent engine is the operator's container, not the caller's file.
        // Reporting it as a corrupt upload sends them to inspect a file that is
        // perfectly fine, and hides the one fact that would fix it.
        if (isEngineUnavailable(err)) {
          const converted = new InputValidationError(
            "Media processing is unavailable on this server because ffmpeg is not installed.",
            503,
            "Install ffmpeg in the container or set FFMPEG_PATH and FFPROBE_PATH.",
            "ENGINE_UNAVAILABLE",
          );
          converted.cause = err;
          throw converted;
        }
        // ffprobe could not parse the upload. Surface a clean message; the raw
        // tool error is intentionally not exposed to the client, and a bad
        // upload is not a server fault worth logging from this low-level handler.
        throw new InputValidationError(
          `Unrecognized ${this.kind} file. It may be corrupt or in an unsupported format.`,
        );
      }
      opts.signal?.throwIfAborted();
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
    } catch (err) {
      opts.signal?.throwIfAborted();
      throw err;
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
