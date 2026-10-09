/**
 * Sharp cannot trim an image with a side under 3 pixels. Both sides under 3 trip
 * its own "Image to trim must be at least 3x3 pixels"; a 2 x 10 strip gets past
 * that check and fails inside libvips' 3 x 3 median window with "rank: window
 * too large". Either way the worker saw a bare Error and reported a tiny upload
 * that passed intake as a server fault (#2202). processTrim now refuses with a
 * ToolInputError, which the worker records on the job row as a 400.
 */

import { isToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

vi.mock("@snapotter/ai", () => ({ detectFaces: vi.fn() }));

let schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } };
let config: NonNullable<ReturnType<typeof getToolConfig>>;

beforeAll(() => {
  registerSmartCrop({ post: vi.fn() } as unknown as FastifyInstance);
  const registered = getToolConfig("smart-crop");
  if (!registered) throw new Error("smart-crop was not registered");
  config = registered;
  schema = registered.settingsSchema as unknown as typeof schema;
});

const ctx = {} as ToolProcessCtx;

function trimSettings(extra: Record<string, unknown>) {
  const parsed = schema.safeParse({ mode: "trim", ...extra });
  expect(parsed.success).toBe(true);
  return parsed.data;
}

async function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
}

// A white strip with a red block across it. The block is 3 or more pixels on
// each side so libvips' 3 x 3 median keeps it; a 1 pixel line would vanish.
async function strip(width: number, height: number, block: sharp.Region) {
  const red = await solid(block.width, block.height);
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: red, left: block.left, top: block.top }])
    .png()
    .toBuffer();
}

// Both trim branches read the input: the plain trim and the pad-to-square one,
// which pads what it trimmed out to a square on its long side.
describe.each([
  ["plain trim", {}],
  ["pad to square", { padToSquare: true }],
] as const)("smart-crop %s: the 3 pixel minimum for trim (#2202)", (_branch, extra) => {
  const expectedSize = (w: number, h: number) =>
    "padToSquare" in extra ? [Math.max(w, h), Math.max(w, h)] : [w, h];

  it.each([
    [1, 1],
    [2, 2],
    [1, 2],
    [2, 1],
    [2, 10],
    [10, 2],
  ])("refuses %i x %i with a ToolInputError that names the size", async (w, h) => {
    const run = config.process(await solid(w, h), trimSettings(extra), "tiny.png", ctx);
    // The worker reads the marker, not the class, to answer a 400.
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(`(${w} x ${h} pixels)`);
  });

  it.each([
    [3, 3],
    [3, 10],
    [10, 3],
  ])("accepts %i x %i", async (w, h) => {
    // A solid image has no border to cut, so the trim keeps all of it.
    const out = await config.process(await solid(w, h), trimSettings(extra), "small.png", ctx);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual(expectedSize(w, h));
  });

  it.each([
    [3, 10, { left: 0, top: 3, width: 3, height: 4 }],
    [10, 3, { left: 3, top: 0, width: 4, height: 3 }],
  ] as const)("cuts the border off a %i x %i strip at the boundary", async (w, h, block) => {
    const input = await strip(w, h, block);
    const out = await config.process(input, trimSettings(extra), "strip.png", ctx);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual(expectedSize(block.width, block.height));
  });
});
