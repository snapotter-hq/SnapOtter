import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg, softwareEncoder } from "@snapotter/media-engine";
import sharp from "sharp";
import type { FrameInfo } from "./animated-image.js";

/**
 * Animated AVIF output for the image tools (#4827).
 *
 * Sharp can't write an AVIF sequence: encoding a multi-frame pipeline to AVIF
 * stacks the frames into one tall still. ffmpeg's avif muxer can, but ffmpeg
 * can't decode animated WebP, so Sharp splits the frames and ffmpeg's concat
 * demuxer reassembles them with their delays. The alpha plane travels as a
 * second, single-plane stream, hence the "av1-alpha" encoder (libaom) rather
 * than the media tools' libsvtav1.
 */

/** Long enough for a capped animation (see gif-limits.ts) on a slow CPU. */
const ENCODE_TIMEOUT_MS = 5 * 60_000;

/** Browsers play a GIF delay of 10 ms or less as 100 ms; so does the output. */
const MIN_DELAY_MS = 10;
const DEFAULT_DELAY_MS = 100;

/**
 * ffconcat script for the extracted frames.
 *
 * `framerate 1000` puts each image on a millisecond timebase; at the image
 * demuxer's default 25 fps every delay would round to 40 ms steps. The last
 * frame is listed twice because concat drops the final entry's `duration`, so
 * without the repeat the last frame would play for one tick.
 */
export function concatList(framePaths: string[], delaysMs: number[] | undefined): string {
  const entry = (path: string) =>
    [`file '${path.replaceAll("'", "'\\''")}'`, "option framerate 1000"].join("\n");
  const lines = ["ffconcat version 1.0"];
  framePaths.forEach((path, i) => {
    const delay = delaysMs?.[i];
    const ms = delay !== undefined && delay > MIN_DELAY_MS ? delay : DEFAULT_DELAY_MS;
    lines.push(entry(path), `duration ${ms / 1000}`);
  });
  const last = framePaths.at(-1);
  if (last !== undefined) lines.push(entry(last));
  return `${lines.join("\n")}\n`;
}

/**
 * An AVIF quality (1..100, Sharp's scale) as an AV1 CRF (63..0), the scale
 * libaom and libsvtav1 share. Undefined keeps Sharp's default of 50.
 */
export function avifCrf(quality: number | undefined): number {
  return Math.round(63 * (1 - (quality ?? 50) / 100));
}

/** Whether a raw RGBA buffer has any pixel that isn't fully opaque. */
function hasTransparency(data: Buffer, channels: number): boolean {
  if (channels !== 4) return false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

export interface AnimatedAvifOptions {
  quality?: number;
  signal?: AbortSignal;
  /** The job's scratch dir; frames go to a temp dir when absent. */
  scratchDir?: string;
}

/** Encode an animation read by `readAnimation` as an animated AVIF. */
export async function encodeAnimatedAvif(
  buffer: Buffer,
  info: FrameInfo,
  options: AnimatedAvifOptions = {},
): Promise<Buffer> {
  const encoder = softwareEncoder("av1-alpha");
  // One decode for every frame. Opening the buffer once per page re-decodes
  // the animation from the start each time, which took most of a minute for a
  // 500-frame GIF.
  const { data, info: raw } = await sharp(buffer, { animated: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameBytes = raw.width * info.pageHeight * raw.channels;
  if (raw.height !== info.pageHeight * info.pages) {
    throw new Error(
      `animated AVIF: decoded ${raw.width}x${raw.height}, expected ${info.pages} frames of height ${info.pageHeight}`,
    );
  }
  // libvips reports every GIF as having alpha, transparent or not, so look at
  // the pixels rather than paying for an alpha stream nothing uses.
  const withAlpha = hasTransparency(data, raw.channels);

  const dir = await mkdtemp(join(options.scratchDir ?? tmpdir(), "animated-avif-"));
  try {
    const framePaths: string[] = [];
    for (let page = 0; page < info.pages; page++) {
      const frame = data.subarray(page * frameBytes, (page + 1) * frameBytes);
      const framePath = join(dir, `frame-${page}.png`);
      await writeFile(
        framePath,
        await sharp(frame, {
          raw: { width: raw.width, height: info.pageHeight, channels: raw.channels },
        })
          .png({ compressionLevel: 1 })
          .toBuffer(),
      );
      framePaths.push(framePath);
    }
    const listPath = join(dir, "frames.ffconcat");
    await writeFile(listPath, concatList(framePaths, info.delay));

    // The alpha stream comes out of an RGB source tagged with the identity
    // matrix, which libaom refuses for a subsampled plane, hence the setparams.
    const streams = withAlpha
      ? [
          "-filter_complex",
          "[0:v]format=rgba,split[c][a];[c]format=yuv420p[color];[a]alphaextract,format=gray,setparams=colorspace=bt709[alpha]",
          "-map",
          "[color]",
          "-map",
          "[alpha]",
        ]
      : ["-vf", "format=yuv420p"];
    const outPath = join(dir, "out.avif");
    await runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        ...streams,
        "-c:v",
        encoder,
        "-crf",
        String(avifCrf(options.quality)),
        "-cpu-used",
        "6",
        "-row-mt",
        "1",
        "-fps_mode",
        "passthrough",
        "-loop",
        String(info.loop ?? 0),
        "-f",
        "avif",
        outPath,
      ],
      { timeoutMs: ENCODE_TIMEOUT_MS, signal: options.signal },
    );
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
