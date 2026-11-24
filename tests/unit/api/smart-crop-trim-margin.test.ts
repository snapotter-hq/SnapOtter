/**
 * Smart Crop's trim mode cut to the last non-background pixel and ignored
 * padding, so `{ mode: "trim", padding: 20 }` passed the schema and came back
 * as a bare trim (#1194). Trim now grows the trimmed box by padding percent of
 * its own size, the same meaning padding has in subject and face modes, and
 * extracts that region from the original so the margin is real image content.
 */

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { growTrimBox, registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

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

async function trim(input: Buffer, extra: Record<string, unknown>) {
  const parsed = schema.safeParse({ mode: "trim", ...extra });
  expect(parsed.success).toBe(true);
  const out = await config.process(input, parsed.data, "product.png", ctx);
  return sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
}

// A 50 x 30 red block on a 200 x 100 grey backdrop, its top-left corner at (60, 20).
async function product() {
  const red = await sharp({ create: { width: 50, height: 30, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 200, height: 100, channels: 3, background: "#808080" } })
    .composite([{ input: red, left: 60, top: 20 }])
    .png()
    .toBuffer();
}

function pixel(data: Buffer, width: number, channels: number, x: number, y: number) {
  const i = (y * width + x) * channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("growTrimBox (#1194)", () => {
  it("leaves the box alone at 0% padding", () => {
    expect(growTrimBox({ left: 60, top: 20, width: 50, height: 30 }, 0, 200, 100)).toEqual({
      left: 60,
      top: 20,
      width: 50,
      height: 30,
    });
  });

  it("grows each side by half the padding percent of the box", () => {
    expect(growTrimBox({ left: 60, top: 20, width: 50, height: 30 }, 20, 200, 100)).toEqual({
      left: 55,
      top: 17,
      width: 60,
      height: 36,
    });
  });

  it("cuts the margin at the image edge instead of shifting the box", () => {
    expect(growTrimBox({ left: 2, top: 0, width: 50, height: 30 }, 40, 60, 40)).toEqual({
      left: 0,
      top: 0,
      width: 60,
      height: 36,
    });
  });

  it("never reaches past the image on any side", () => {
    expect(growTrimBox({ left: 0, top: 0, width: 200, height: 100 }, 50, 200, 100)).toEqual({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });
  });
});

describe("smart-crop trim margin (#1194)", () => {
  it("still cuts to the object when padding is 0", async () => {
    const { info } = await trim(await product(), {});
    expect([info.width, info.height]).toEqual([50, 30]);
  });

  it("keeps a margin of real backdrop around the object", async () => {
    const { data, info } = await trim(await product(), { padding: 20 });
    expect([info.width, info.height]).toEqual([60, 36]);
    // The corner is backdrop from the original image, not a padded canvas,
    // and the object sits 5 px in from the left and 3 px down from the top.
    expect(pixel(data, info.width, info.channels, 0, 0)).toEqual([128, 128, 128]);
    expect(pixel(data, info.width, info.channels, 4, 3)).toEqual([128, 128, 128]);
    expect(pixel(data, info.width, info.channels, 5, 3)).toEqual([255, 0, 0]);
  });

  it("pads the margined region, not the bare trim, to a square", async () => {
    const { data, info } = await trim(await product(), {
      padding: 20,
      padToSquare: true,
      padColor: "#0000ff",
    });
    expect([info.width, info.height]).toEqual([60, 60]);
    // Top rows are pad colour, the band in the middle starts with the margin.
    expect(pixel(data, info.width, info.channels, 0, 0)).toEqual([0, 0, 255]);
    expect(pixel(data, info.width, info.channels, 0, 30)).toEqual([128, 128, 128]);
  });
});
