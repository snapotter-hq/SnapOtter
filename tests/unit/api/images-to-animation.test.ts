/**
 * images-to-video can write an animated GIF or WebP as well as an MP4 (#4826).
 *
 * The animated formats are built with Sharp alone, so this runs the route's
 * processV2 for real against tiny frames, with no ffmpeg on the host. The
 * factory is swapped for one that records the config, and ffmpeg is replaced
 * with a spy that fails the test if the animated path ever reaches it.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProcessResult = { scratchPath: string; filename: string; contentType: string };
type RouteConfig = {
  toolId: string;
  settingsSchema: { parse: (v: unknown) => Record<string, unknown> };
  processV2: (ctx: unknown) => Promise<ProcessResult>;
};

const registered: RouteConfig[] = [];
const ffmpegSpy = vi.fn(async () => "");

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return { ...actual, runFfmpegWithProgress: ffmpegSpy };
});

const { registerImagesToVideo } = await import(
  "../../../apps/api/src/routes/tools/images-to-video.js"
);
registerImagesToVideo({} as never);
const route = registered.find((r) => r.toolId === "images-to-video") as RouteConfig;

function solid(width: number, height: number, v: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: v, g: 0, b: 255 - v } } })
    .png()
    .toBuffer();
}

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-i2anim-"));
  ffmpegSpy.mockClear();
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

async function run(settings: Record<string, unknown>, frames: Buffer[]): Promise<ProcessResult> {
  return route.processV2({
    settings,
    scratchDir,
    inputs: frames.map((buffer, i) => ({ filename: `f${i}.png`, buffer })),
  });
}

describe("images-to-video animated output (#4826)", () => {
  it("keeps MP4 as the default output", () => {
    const parsed = route.settingsSchema.parse({});
    expect(parsed.outputFormat).toBe("mp4");
  });

  it("builds an animated GIF with one frame per image, the chosen delay and loop count", async () => {
    const frames = await Promise.all([40, 120, 200].map((v) => solid(32, 24, v)));
    const res = await run({ outputFormat: "gif", frameDelayMs: 150, loop: 3 }, frames);

    expect(res.filename).toBe("slideshow.gif");
    expect(res.contentType).toBe("image/gif");
    expect(ffmpegSpy).not.toHaveBeenCalled();

    const meta = await sharp(readFileSync(res.scratchPath)).metadata();
    expect(meta.format).toBe("gif");
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(32);
    expect(meta.pageHeight ?? meta.height).toBe(24);
    expect(meta.delay).toEqual([150, 150, 150]);
    expect(meta.loop).toBe(3);
  });

  it("builds an animated WebP that loops forever by default", async () => {
    const frames = await Promise.all([40, 200].map((v) => solid(20, 20, v)));
    const res = await run({ outputFormat: "webp", frameDelayMs: 80 }, frames);

    expect(res.filename).toBe("slideshow.webp");
    expect(res.contentType).toBe("image/webp");

    const meta = await sharp(readFileSync(res.scratchPath)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(2);
    expect(meta.delay).toEqual([80, 80]);
    expect(meta.loop).toBe(0);
  });

  it("fits frames of other sizes onto the first frame's canvas", async () => {
    const frames = [await solid(40, 20, 40), await solid(10, 30, 200), await solid(80, 80, 120)];
    const res = await run({ outputFormat: "gif" }, frames);

    const out = readFileSync(res.scratchPath);
    const meta = await sharp(out).metadata();
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(40);
    expect(meta.pageHeight ?? meta.height).toBe(20);

    // Frame 2 (10x30) is contained, so it is scaled to about 7x20 and centred,
    // leaving its left edge transparent.
    const { data, info } = await sharp(out, { page: 1, pages: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(0, 10)).toBe(0);
    expect(alphaAt(20, 10)).toBe(255);
  });

  it("refuses an animation over the GIF workload cap before encoding it", async () => {
    // One pixel past the per-side limit trips the cap on the first frame's size alone.
    const huge = await sharp({
      create: { width: 16_385, height: 2, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    const small = await solid(4, 4, 0);
    const err = await run({ outputFormat: "gif" }, [huge, small]).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect((err as { code?: string }).code).toBe("RESULT_TOO_LARGE");
    expect((err as Error).message).toContain("Use fewer or smaller images");
  });

  it("sizes the canvas from the first image as it is displayed, after EXIF rotation", async () => {
    // Stored 40x20 with orientation 6 (rotate 90), so it displays as 20x40.
    const rotated = await sharp(await solid(40, 20, 40))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const res = await run({ outputFormat: "gif" }, [rotated, await solid(20, 40, 200)]);

    const meta = await sharp(readFileSync(res.scratchPath)).metadata();
    expect(meta.width).toBe(20);
    expect(meta.pageHeight ?? meta.height).toBe(40);
  });

  it("reports an undecodable frame as an input error, not a crash", async () => {
    const png = await solid(16, 16, 40);
    const truncated = png.subarray(0, png.length - 40);
    const err = await run({ outputFormat: "webp" }, [png, truncated]).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
  });

  it("rejects a frame delay below what browsers honour", () => {
    expect(() => route.settingsSchema.parse({ outputFormat: "gif", frameDelayMs: 10 })).toThrow();
  });
});
