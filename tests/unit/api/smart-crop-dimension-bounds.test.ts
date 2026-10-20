/**
 * smart-crop handed its width, height and targetSize to Sharp unbounded. Past
 * 100000000 Sharp throws a bare Error, and a size whose intermediate passes the
 * pixel limit either throws in Sharp or allocates hundreds of MB to several GB
 * in the API worker (#2064, #2203). The schema caps output and padded pairs at
 * MAX_RESIZE_OUTPUT_PIXELS (64 MP), and processSubject refuses a cover
 * intermediate whose aspect-ratio stretch exceeds that limit.
 */

import { MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/image-engine";
import { isToolInputError, MAX_RESIZE_OUTPUT_DIMENSION, ToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

const mocks = vi.hoisted(() => ({
  detectFaces: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({ detectFaces: mocks.detectFaces }));

let schema: {
  safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { message: string } };
};
let config: NonNullable<ReturnType<typeof getToolConfig>>;

beforeAll(() => {
  registerSmartCrop({ post: vi.fn() } as unknown as FastifyInstance);
  const registered = getToolConfig("smart-crop");
  if (!registered) throw new Error("smart-crop was not registered");
  config = registered;
  schema = registered.settingsSchema as unknown as typeof schema;
});

const MAX = MAX_RESIZE_OUTPUT_DIMENSION;
const MAX_SQUARE = Math.sqrt(MAX_RESIZE_OUTPUT_PIXELS);

describe("smart-crop size bounds (#2064, #2203)", () => {
  it.each(["width", "height"] as const)("refuses a %s past the ceiling", (field) => {
    expect(schema.safeParse({ [field]: MAX + 1 }).success).toBe(false);
    expect(schema.safeParse({ [field]: 100_000_001 }).success).toBe(false);
  });

  it.each(["width", "height"] as const)("accepts a %s at the ceiling", (field) => {
    // The other side stays at its 1080 default (16383 x 1080 = 17.7 MP <= 64 MP).
    expect(schema.safeParse({ [field]: MAX }).success).toBe(true);
  });

  it("caps targetSize at the 64 MP square side (8192)", () => {
    expect(schema.safeParse({ mode: "trim", targetSize: MAX_SQUARE }).success).toBe(true);
    expect(schema.safeParse({ mode: "trim", targetSize: MAX_SQUARE + 1 }).success).toBe(false);
    expect(schema.safeParse({ mode: "trim", targetSize: MAX }).success).toBe(false);
    expect(schema.safeParse({ mode: "trim", targetSize: 100_000_001 }).success).toBe(false);
  });

  it("still takes ordinary sizes", () => {
    expect(schema.safeParse({ width: 1080, height: 1350, padding: 20 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("refuses an unpadded pair over the 64 MP output pixel limit", () => {
    expect(schema.safeParse({ width: MAX_SQUARE, height: MAX_SQUARE }).success).toBe(true);
    const overSquare = schema.safeParse({ width: MAX_SQUARE, height: MAX_SQUARE + 1 });
    expect(overSquare.success).toBe(false);
    expect(overSquare.error?.message).toContain(`${MAX_SQUARE} x ${MAX_SQUARE + 1}`);
    expect(overSquare.error?.message).toMatch(/pixel limit/i);

    // 16383 x 4096 is 67,104,768 (fits); 16383 x 4097 is 67,121,151 (over).
    expect(schema.safeParse({ width: MAX, height: 4096 }).success).toBe(true);
    expect(schema.safeParse({ width: MAX, height: 4097 }).success).toBe(false);
    expect(schema.safeParse({ width: MAX, height: MAX }).success).toBe(false);
  });

  it("refuses a pair whose padded intermediate passes the 64 MP pixel limit", () => {
    // 8000 x 8000 is 64 MP unpadded, but 10% padding resizes to 8800 x 8800 (77.44 MP).
    expect(schema.safeParse({ width: 8000, height: 8000 }).success).toBe(true);
    const result = schema.safeParse({ width: 8000, height: 8000, padding: 10 });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/pixel limit/i);
    expect(result.error?.message).toContain("8800 x 8800");
  });

  it("applies the pair and padded checks to face mode too, which falls back to the subject path", () => {
    expect(schema.safeParse({ mode: "face", width: MAX, height: MAX }).success).toBe(false);
    expect(schema.safeParse({ mode: "face", width: 8000, height: 8000, padding: 10 }).success).toBe(
      false,
    );
  });

  it("puts the padded limit exactly at 64 MP", () => {
    // 10% padding: 7447 pads to 8192 (67,108,864, fits), 7448 pads to 8193 (67,125,249, over).
    expect(schema.safeParse({ width: 7447, height: 7447, padding: 10 }).success).toBe(true);
    const over = schema.safeParse({ width: 7448, height: 7448, padding: 10 });
    expect(over.success).toBe(false);
    // The message names the padded size, since 7448 x 7448 alone is under the limit.
    expect(over.error?.message).toContain("8193 x 8193");
  });

  it("gives one error, not two, for a width past the ceiling", () => {
    const result = schema.safeParse({ width: 100_000_001, height: 10 });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toMatch(/total pixels|pixel limit/i);

    const padded = schema.safeParse({ width: 100_000_001, height: 10, padding: 10 });
    expect(padded.success).toBe(false);
    expect(padded.error?.message).not.toMatch(/total pixels|pixel limit/i);
  });

  it("applies the same rules to the 'attention' and 'content' aliases", () => {
    // attention is subject, so the pair check runs; content is trim, so it does not.
    expect(
      schema.safeParse({ mode: "attention", width: 8000, height: 8000, padding: 10 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ mode: "content", width: MAX, height: MAX, padding: 50 }).success,
    ).toBe(true);
  });

  it("accepts a large pair that fits once padded", () => {
    // 7000 x 7000 at 10% padding is 7700 x 7700, about 59.3 megapixels.
    expect(schema.safeParse({ width: 7000, height: 7000, padding: 10 }).success).toBe(true);
  });

  it("does not apply the pair check to trim mode, which ignores width and height", () => {
    expect(schema.safeParse({ mode: "trim", width: MAX, height: MAX, padding: 50 }).success).toBe(
      true,
    );
  });
});

describe("smart-crop trim: pad to square without a targetSize (#2064, #2203)", () => {
  const ctx = {} as ToolProcessCtx;

  async function strip(width: number, height: number) {
    return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
      .png()
      .toBuffer();
  }

  it("refuses a square that would pass the 64 MP pixel limit with a 400-class error", async () => {
    // 0.5 MP in, but padded to an 8193 x 8193 square (67,125,249 pixels > 64 MP).
    const input = await strip(MAX_SQUARE + 1, 64);
    const settings = schema.safeParse({ mode: "trim", padToSquare: true }).data;
    const run = config.process(input, settings, "wide.png", ctx);
    await expect(run).rejects.toBeInstanceOf(ToolInputError);
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(`Set targetSize to ${MAX_SQUARE} or less`);
  });

  it("still pads an ordinary image to a square", async () => {
    const input = await strip(120, 40);
    const settings = schema.safeParse({ mode: "trim", padToSquare: true }).data;
    const out = await config.process(input, settings, "wide.png", ctx);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([120, 120]);
  });
});

describe("smart-crop subject: cover intermediate pixel limit (#2203)", () => {
  const ctx = {} as ToolProcessCtx;

  async function rect(width: number, height: number) {
    return sharp({ create: { width, height, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
  }

  it("refuses a cover stretch over 64 MP when aspect ratios badly mismatch", async () => {
    // 1000 x 100 cropped to 10 x 4000 scales by 40x to a 40000 x 4000 (160 MP) cover intermediate.
    const input = await rect(1000, 100);
    const settings = schema.safeParse({ mode: "subject", width: 10, height: 4000 }).data;
    const run = config.process(input, settings, "strip.png", ctx);
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(/40000 x 4000/);
    await expect(run).rejects.toThrow(String(MAX_RESIZE_OUTPUT_PIXELS));
  });

  it("refuses a wide target on a 4:3 input whose cover intermediate exceeds 64 MP", async () => {
    // 400 x 300 cropped to 16383 x 1 scales by 16383/400 to 16383 x 12287 (~201 MP).
    const input = await rect(400, 300);
    const settings = schema.safeParse({ mode: "subject", width: MAX, height: 1 }).data;
    const run = config.process(input, settings, "photo.png", ctx);
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(/16383 x 12287/);
  });

  it("accounts for padding when checking the cover intermediate", async () => {
    // 1000 x 100 at 10 x 2500 has a 25000 x 2500 (62.5 MP) unpadded cover, which fits;
    // with 20% padding the resize target is 12 x 3000, stretching the cover to 30000 x 3000 (90 MP).
    const input = await rect(1000, 100);
    const padded = schema.safeParse({
      mode: "subject",
      width: 10,
      height: 2500,
      padding: 20,
    }).data;
    const run = config.process(input, padded, "strip.png", ctx);
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(/30000 x 3000/);
  });

  it("refuses an oversized cover intermediate on the face mode no-face fallback", async () => {
    mocks.detectFaces.mockResolvedValueOnce({ facesDetected: 0, faces: [] });
    const input = await rect(1000, 100);
    const settings = schema.safeParse({ mode: "face", width: 10, height: 4000 }).data;
    await expect(config.process(input, settings, "strip.png", ctx)).rejects.toSatisfy(
      isToolInputError,
    );
  });

  it("refuses an oversized cover intermediate when a detected face produces a sub-pixel crop width", async () => {
    // With width: 10, height: 4000 (aspect 1:400) on a 1000 x 100 strip, cropH clamps to 100
    // and cropW is 0.25, which rounds to width 0 and falls back to processSubject.
    mocks.detectFaces.mockResolvedValueOnce({
      facesDetected: 1,
      faces: [{ x: 400, y: 20, w: 60, h: 60 }],
    });
    const input = await rect(1000, 100);
    const settings = schema.safeParse({ mode: "face", width: 10, height: 4000 }).data;
    await expect(config.process(input, settings, "strip.png", ctx)).rejects.toSatisfy(
      isToolInputError,
    );
  });

  it("crops when the cover intermediate stays within 64 MP", async () => {
    const input = await rect(1000, 100);
    const settings = schema.safeParse({ mode: "subject", width: 100, height: 100 }).data;
    const out = await config.process(input, settings, "strip.png", ctx);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([100, 100]);
  });
});
