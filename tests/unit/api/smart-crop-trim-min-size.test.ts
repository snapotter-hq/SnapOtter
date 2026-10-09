/**
 * Sharp cannot trim an image with a side under 3 pixels. Both sides under 3 trip
 * its own "Image to trim must be at least 3x3 pixels"; a 2 x 10 strip gets past
 * that check and fails inside libvips' 3 x 3 median window with "rank: window
 * too large". Either way the worker saw a bare Error and reported a tiny upload
 * that passed intake as a server fault (#2202). processTrim now refuses with a
 * ToolInputError, which the worker answers as a 400.
 */

import { ToolInputError } from "@snapotter/shared";
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

async function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
}

// Both trim branches read the input: the plain trim and the pad-to-square one.
const BRANCHES: Record<string, unknown>[] = [{}, { padToSquare: true }];

describe("smart-crop trim on an image with a side under 3 pixels (#2202)", () => {
  it.each([
    [1, 1],
    [2, 2],
    [1, 2],
    [2, 1],
    [2, 10],
    [10, 2],
  ])("refuses %i x %i with a ToolInputError that names the size", async (w, h) => {
    const input = await solid(w, h);
    for (const extra of BRANCHES) {
      const settings = schema.safeParse({ mode: "trim", ...extra }).data;
      const run = config.process(input, settings, "tiny.png", ctx);
      await expect(run).rejects.toBeInstanceOf(ToolInputError);
      await expect(run).rejects.toThrow(`${w} x ${h} pixels`);
    }
  });

  it.each([
    [3, 3],
    [3, 10],
    [10, 3],
  ])("still trims %i x %i", async (w, h) => {
    const input = await solid(w, h);
    for (const extra of BRANCHES) {
      const settings = schema.safeParse({ mode: "trim", ...extra }).data;
      const out = await config.process(input, settings, "small.png", ctx);
      const meta = await sharp(out.buffer).metadata();
      // A solid image trims to itself; the square branch pads it out to its long side.
      const side = Math.max(w, h);
      const expected = extra.padToSquare ? [side, side] : [w, h];
      expect([meta.width, meta.height]).toEqual(expected);
    }
  });
});
