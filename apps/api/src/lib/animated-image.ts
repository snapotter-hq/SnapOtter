import sharp, { type Metadata, type Sharp } from "sharp";
import { assertGifWorkload } from "./gif-limits.js";
import { logger } from "./logger.js";

/**
 * Animation-aware plumbing for the Sharp-backed image tools (issue #1083).
 *
 * `sharp(buffer)` decodes frame 1 and drops the rest, so every tool that built
 * its pipeline that way turned an animated GIF into a still and reported the
 * smaller byte count as a successful edit.
 *
 * Passing `{ animated: true }` keeps the frames, but it lays them out as one
 * tall strip, and Sharp's operations divide into three groups that have to be
 * handled differently:
 *
 *   - Page-aware (`resize`, `extract`, `extend`): these read and write the
 *     per-frame height on their own, so the strip needs no special care.
 *   - Whole-strip (`composite`): one overlay lands on frame 1 only, and
 *     `flip` mirrors the strip, which reverses the frame order.
 *   - Unsupported (`rotate`): Sharp refuses multi-page input outright, and any
 *     operation that rebuilds from a raw buffer loses the page count because
 *     Sharp ignores `pages`/`pageHeight` on raw input. Those go frame by frame
 *     through `mapFrames`.
 */

/**
 * Frame geometry and timing for a decoded animation.
 *
 * Distinct from `AnimationInfo` in `animation-detect.ts`, which answers a
 * narrower question (how many frames, APNG included) for the ingress checks.
 * This one carries what a rebuild needs.
 */
export interface FrameInfo {
  /** True only for genuinely multi-frame input; stills keep the old path. */
  animated: boolean;
  pages: number;
  /** Height of a single frame, not of the stacked strip. */
  pageHeight: number;
  width: number;
  /** Per-frame delays in milliseconds, preserved across a rebuild. */
  delay?: number[];
  loop?: number;
}

const STILL: FrameInfo = { animated: false, pages: 1, pageHeight: 0, width: 0 };

/**
 * Read frame information without paying for an animated decode.
 *
 * A plain Sharp handle already reports `pages` for GIF and animated WebP, and
 * its `height` there is the per-frame height, so this costs one header read.
 * Multi-frame input is pushed through the same `assertGifWorkload` cap the GIF
 * tools use, rather than introducing a second limit.
 */
async function readAnimation(buffer: Buffer): Promise<FrameInfo> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err) {
    // Treating an unreadable header as a still is what the caller wants for
    // genuinely broken input, since it reopens the buffer and fails with its
    // own message a line later. A transient failure lands here too though, and
    // that silently reinstates the frame dropping this module exists to stop,
    // so it gets a log line rather than nothing.
    logger.warn(
      { err },
      "could not read image header for animation detection; treating as a still",
    );
    return STILL;
  }

  const pages = meta.pages ?? 1;
  if (pages <= 1) return STILL;

  const workload = assertGifWorkload(
    { width: meta.width, height: meta.height, pages },
    meta.format === "webp" ? "Animated WebP input" : "GIF input",
  );

  return {
    animated: true,
    pages,
    pageHeight: workload.height,
    width: workload.width,
    delay: meta.delay,
    loop: meta.loop,
  };
}

/**
 * Frame information, but only when `outputFormat` can carry an animation.
 *
 * This gate is not optional. Encoding a multi-frame strip to JPEG, PNG or AVIF
 * does not drop the extra frames, it writes them as one image `pages` times
 * taller than the original, so a 100x100 GIF converted to JPEG comes out as a
 * 100x300 contact sheet. Reporting the input as a still keeps those conversions
 * on the single-frame path, which is the correct result for them anyway.
 */
export async function readAnimationFor(buffer: Buffer, outputFormat: string): Promise<FrameInfo> {
  if (!animatedContainerFor(outputFormat)) return STILL;
  return await readAnimation(buffer);
}

/**
 * Whether the input holds more than one frame, regardless of where it is going.
 *
 * For the few tools that pick their output container from the input's alpha
 * needs rather than its format: they have to know there are frames to protect
 * before they can choose a container that holds them.
 */
export async function isAnimated(buffer: Buffer): Promise<boolean> {
  return (await readAnimation(buffer)).animated;
}

/** Open a pipeline that keeps every frame; stills get the plain handle. */
export function openAnimated(buffer: Buffer, info: FrameInfo): Sharp {
  return info.animated ? sharp(buffer, { animated: true }) : sharp(buffer);
}

/** Containers that can actually hold an animation on the way out. */
type AnimatedContainer = "gif" | "webp";

function animatedContainerFor(format: string): AnimatedContainer | undefined {
  if (format === "gif") return "gif";
  if (format === "webp") return "webp";
  return undefined;
}

/**
 * Run a still-image transform over each frame and rebuild the animation.
 *
 * For tools whose pipeline cannot survive the strip at all: `rotate` throws on
 * multi-page input, and anything that reconstructs from `.raw()` comes back as
 * a single tall frame because Sharp ignores page hints on raw input.
 *
 * Frames travel as PNG in both directions so nothing is lost on the way in or
 * out; every caller resolves its output format from the original buffer before
 * splitting, so no tool needs the frame to arrive in a particular container.
 */
async function mapFrames(
  buffer: Buffer,
  info: FrameInfo,
  container: AnimatedContainer,
  transform: (frame: Buffer, index: number) => Promise<Buffer>,
): Promise<Buffer> {
  const rebuilt: Buffer[] = [];
  for (let page = 0; page < info.pages; page++) {
    // PNG both ways. Handing the tool a frame re-encoded as WebP would cost a
    // lossy generation before the tool has done anything (Sharp's default is
    // quality 80), and a GIF frame would cost a palette pass; joining encoded
    // GIF frames also loses the page count outright.
    const frame = await sharp(buffer, { page, pages: 1 }).png().toBuffer();
    rebuilt.push(
      await sharp(await transform(frame, page))
        .png()
        .toBuffer(),
    );
  }

  const joined = sharp(rebuilt, { join: { across: 1, animated: true } });
  return container === "gif"
    ? await joined.gif({ delay: info.delay, loop: info.loop }).toBuffer()
    : await joined.webp({ delay: info.delay, loop: info.loop }).toBuffer();
}

/**
 * Apply a still-image tool to every frame, or decline and let the caller run
 * its normal single-pass path.
 *
 * Returns `undefined` when there is nothing to do: a single-frame input, or an
 * output format that cannot hold an animation. Converting an animated GIF to
 * JPEG really does produce a still, so that case is not a failure.
 *
 * `still` is the tool's own logic, unchanged, receiving one frame at a time.
 */
export async function runPerFrame(
  inputBuffer: Buffer,
  outputFormat: string,
  still: (frame: Buffer) => Promise<Buffer>,
): Promise<Buffer | undefined> {
  // Container first: reading the animation applies the frame cap, and an input
  // headed for a still format should not be rejected over a frame count that is
  // about to be discarded anyway. readAnimationFor gates in the same order.
  const container = animatedContainerFor(outputFormat);
  if (!container) return undefined;

  const info = await readAnimation(inputBuffer);
  if (!info.animated) return undefined;

  return await mapFrames(inputBuffer, info, container, (frame) => still(frame));
}
