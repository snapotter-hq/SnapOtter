import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { concatList } from "../../../apps/api/src/lib/animated-avif.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/**
 * Issue #4827: converting an animated GIF or WebP to AVIF kept frame 1 and
 * dropped the rest without a word. Sharp can't write an AVIF sequence (it
 * stacks the frames into one tall still), so convert hands animated input to
 * ffmpeg's avif muxer instead.
 */

const ffmpegPresent =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

const DELAYS = [100, 300, 500];
const WIDTH = 41;
const HEIGHT = 31;

/** Three frames at an odd size, the middle one fully transparent, uneven delays. */
async function animatedGif(): Promise<Buffer> {
  const frames = await Promise.all(
    DELAYS.map((_, i) =>
      sharp({
        create: {
          width: WIDTH,
          height: HEIGHT,
          channels: 4,
          background: { r: i * 100, g: 50, b: 0, alpha: i === 1 ? 0 : 1 },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  return await sharp(frames, { join: { across: 1, animated: true } })
    .gif({ delay: DELAYS, loop: 0 })
    .toBuffer();
}

interface ProbedStream {
  index: number;
  pix_fmt: string;
  width: number;
  height: number;
}

interface ProbedFrame {
  stream_index: number;
  pts_time: string;
  duration_time: string;
}

let workDir: string;

function probe(avif: Buffer): { streams: ProbedStream[]; frames: ProbedFrame[] } {
  const file = join(workDir, `probe-${Date.now()}-${Math.random()}.avif`);
  writeFileSync(file, avif);
  const out = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,pix_fmt,width,height:frame=stream_index,pts_time,duration_time",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (out.status !== 0) throw new Error(`ffprobe failed: ${out.stderr}`);
  return JSON.parse(out.stdout);
}

/** Frames of one stream, which carries more than one frame only in an AVIF sequence. */
function framesOf(frames: ProbedFrame[], index: number): ProbedFrame[] {
  return frames.filter((f) => f.stream_index === index);
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "animated-avif-test-"));
  registerConvert({ post: () => undefined } as unknown as FastifyInstance);
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!ffmpegPresent)("convert keeps animation when the target is AVIF (#4827)", () => {
  it("writes every GIF frame, with its delay and transparency, into an AVIF sequence", async () => {
    const convert = getToolConfig("convert");
    if (!convert) throw new Error("convert must be registered");

    const result = await convert.process(
      await animatedGif(),
      convert.settingsSchema.parse({ format: "avif" }),
      "frames.gif",
    );

    expect(result.contentType).toBe("image/avif");
    expect(result.filename).toBe("frames.avif");

    const { streams, frames } = probe(result.buffer);
    const color = streams.filter((s) => s.pix_fmt.startsWith("yuv"));
    const alpha = streams.filter((s) => s.pix_fmt === "gray");
    const sequence = color.find((s) => framesOf(frames, s.index).length > 1);
    if (!sequence) throw new Error(`no AVIF sequence track in ${JSON.stringify(streams)}`);

    expect({ width: sequence.width, height: sequence.height }).toEqual({
      width: WIDTH,
      height: HEIGHT,
    });
    // Each source frame lands at its cumulative start with its own delay. The
    // trailing frame repeats the last one so the concat demuxer honours that
    // last delay; it has no length of its own worth asserting.
    const seq = framesOf(frames, sequence.index);
    expect(seq.slice(0, DELAYS.length).map((f) => Number(f.pts_time))).toEqual([0, 0.1, 0.4]);
    expect(seq.slice(0, DELAYS.length).map((f) => Number(f.duration_time))).toEqual([
      0.1, 0.3, 0.5,
    ]);
    expect(alpha.length).toBeGreaterThan(0);
  });

  it("skips the alpha stream for an opaque GIF, which libvips still reports as having alpha", async () => {
    const convert = getToolConfig("convert");
    if (!convert) throw new Error("convert must be registered");
    const frames = await Promise.all(
      DELAYS.map((_, i) =>
        sharp({
          create: {
            width: WIDTH,
            height: HEIGHT,
            channels: 3,
            background: { r: i * 100, g: 0, b: 0 },
          },
        })
          .png()
          .toBuffer(),
      ),
    );
    const opaque = await sharp(frames, { join: { across: 1, animated: true } })
      .gif({ delay: DELAYS })
      .toBuffer();
    expect((await sharp(opaque).metadata()).hasAlpha).toBe(true);

    const result = await convert.process(
      opaque,
      convert.settingsSchema.parse({ format: "avif" }),
      "opaque.gif",
    );

    const { streams, frames: probed } = probe(result.buffer);
    expect(streams.some((s) => s.pix_fmt === "gray")).toBe(false);
    expect(streams.some((s) => framesOf(probed, s.index).length > 1)).toBe(true);
  });

  it("keeps every frame of an opaque animated WebP, with no alpha stream", async () => {
    const convert = getToolConfig("convert");
    if (!convert) throw new Error("convert must be registered");
    const source = readFixture(fixtures.image.animated.webp);
    const sourceMeta = await sharp(source).metadata();

    const result = await convert.process(
      source,
      convert.settingsSchema.parse({ format: "avif", quality: 80 }),
      "loop.webp",
    );

    expect(result.filename).toBe("loop.avif");
    const { streams, frames } = probe(result.buffer);
    expect(streams.some((s) => s.pix_fmt === "gray")).toBe(false);
    const sequence = streams.find((s) => framesOf(frames, s.index).length > 1);
    if (!sequence) throw new Error(`no AVIF sequence track in ${JSON.stringify(streams)}`);
    // The source pages plus the repeated closing frame.
    expect(framesOf(frames, sequence.index)).toHaveLength((sourceMeta.pages ?? 1) + 1);
  });

  it("leaves a single-frame GIF on the still path", async () => {
    const convert = getToolConfig("convert");
    if (!convert) throw new Error("convert must be registered");
    const still = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#336699" },
    })
      .gif()
      .toBuffer();

    const result = await convert.process(
      still,
      convert.settingsSchema.parse({ format: "avif" }),
      "still.gif",
    );

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("heif");
    expect({ width: meta.width, height: meta.height, pages: meta.pages ?? 1 }).toEqual({
      width: WIDTH,
      height: HEIGHT,
      pages: 1,
    });
  });
});

describe("concatList", () => {
  it("gives each frame its delay and repeats the last so that delay is kept", () => {
    expect(concatList(["/t/f0.png", "/t/f1.png"], [100, 250])).toBe(
      [
        "ffconcat version 1.0",
        "file '/t/f0.png'",
        "option framerate 1000",
        "duration 0.1",
        "file '/t/f1.png'",
        "option framerate 1000",
        "duration 0.25",
        "file '/t/f1.png'",
        "option framerate 1000",
        "",
      ].join("\n"),
    );
  });

  it("treats a missing or near-zero delay as 100 ms, the way browsers play a GIF", () => {
    const list = concatList(["/t/a.png", "/t/b.png", "/t/c.png"], [0, 10]);
    expect(list.match(/^duration .*$/gm)).toEqual(["duration 0.1", "duration 0.1", "duration 0.1"]);
  });

  it("escapes a single quote in a frame path", () => {
    expect(concatList(["/t/it's.png"], [100])).toContain("file '/t/it'\\''s.png'");
  });
});
