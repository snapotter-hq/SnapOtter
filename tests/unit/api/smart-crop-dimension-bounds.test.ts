/**
 * smart-crop handed its width, height and targetSize to Sharp unbounded. Past
 * 100000000 Sharp throws a bare Error, and a size whose padded intermediate
 * passes its 268 megapixel input limit throws "Input image exceeds pixel limit":
 * both reached the worker as a server fault instead of a 400 (#2064). The
 * schema now refuses a request that can't run.
 */

import { MAX_RESIZE_OUTPUT_DIMENSION, ToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

vi.mock("@snapotter/ai", () => ({ detectFaces: vi.fn() }));

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

describe("smart-crop size bounds (#2064)", () => {
  it.each(["width", "height", "targetSize"] as const)("refuses a %s past the ceiling", (field) => {
    expect(schema.safeParse({ [field]: MAX + 1 }).success).toBe(false);
    expect(schema.safeParse({ [field]: 100_000_001 }).success).toBe(false);
  });

  it.each(["width", "height", "targetSize"] as const)("accepts a %s at the ceiling", (field) => {
    // The other side stays at its default, so only the single-field bound is in play.
    expect(schema.safeParse({ mode: "trim", [field]: MAX }).success).toBe(true);
  });

  it("still takes ordinary sizes", () => {
    expect(schema.safeParse({ width: 1080, height: 1350, padding: 20 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("refuses a pair whose padded intermediate passes Sharp's input pixel limit", () => {
    // 16383 x 16383 with 10% padding resizes to 18021 x 18021 before the extract.
    const result = schema.safeParse({ width: MAX, height: MAX, padding: 10 });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/pixel limit/i);
  });

  it("applies the padded check to face mode too, which falls back to the subject path", () => {
    expect(schema.safeParse({ mode: "face", width: MAX, height: MAX, padding: 10 }).success).toBe(
      false,
    );
  });

  it("puts the padded limit exactly where Sharp's is", () => {
    // 10% padding: 14894 pads to 16383 (fits), 14895 pads to 16385 (does not).
    expect(schema.safeParse({ width: 14894, height: 14894, padding: 10 }).success).toBe(true);
    const over = schema.safeParse({ width: 14895, height: 14895, padding: 10 });
    expect(over.success).toBe(false);
    // The message names the padded size, since 14895 x 14895 alone is well under the limit.
    expect(over.error?.message).toContain("16385 x 16385");
  });

  it("gives one error, not two, for a width past the ceiling", () => {
    const result = schema.safeParse({ width: 100_000_001, height: 10 });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toMatch(/total pixels|pixel limit/i);
  });

  it("applies the same rules to the 'attention' and 'content' aliases", () => {
    // attention is subject, so the padded check runs; content is trim, so it does not.
    expect(
      schema.safeParse({ mode: "attention", width: MAX, height: MAX, padding: 10 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ mode: "content", width: MAX, height: MAX, padding: 50 }).success,
    ).toBe(true);
  });

  it("accepts a large pair that fits once padded", () => {
    // 8000 x 8000 at 10% padding is 8800 x 8800, about 77 megapixels.
    expect(schema.safeParse({ width: 8000, height: 8000, padding: 10 }).success).toBe(true);
  });

  it("counts the unpadded pair too", () => {
    // 16383 x 16383 is exactly Sharp's limit and still runs unpadded.
    expect(schema.safeParse({ width: MAX, height: MAX }).success).toBe(true);
  });

  it("does not apply the pair check to trim mode, which ignores width and height", () => {
    expect(schema.safeParse({ mode: "trim", width: MAX, height: MAX, padding: 50 }).success).toBe(
      true,
    );
  });
});

describe("smart-crop trim: pad to square without a targetSize (#2064)", () => {
  const ctx = {} as ToolProcessCtx;

  async function strip(width: number, height: number) {
    return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
      .png()
      .toBuffer();
  }

  it("refuses a square that would pass Sharp's input pixel limit with a 400-class error", async () => {
    // 1 MP in, but padded to a 16384 x 16384 square before the output is re-read.
    const input = await strip(16384, 64);
    const settings = schema.safeParse({ mode: "trim", padToSquare: true }).data;
    await expect(config.process(input, settings, "wide.png", ctx)).rejects.toBeInstanceOf(
      ToolInputError,
    );
  });

  it("still pads an ordinary image to a square", async () => {
    const input = await strip(120, 40);
    const settings = schema.safeParse({ mode: "trim", padToSquare: true }).data;
    const out = await config.process(input, settings, "wide.png", ctx);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([120, 120]);
  });
});
