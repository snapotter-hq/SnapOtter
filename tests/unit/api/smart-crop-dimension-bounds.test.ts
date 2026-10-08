/**
 * smart-crop handed its width, height and targetSize to Sharp unbounded. Past
 * 100000000 Sharp throws a bare Error, and a size whose padded intermediate
 * passes its 268 megapixel input limit throws "Input image exceeds pixel limit":
 * both reached the worker as a server fault instead of a 400 (#2064). The
 * schema now refuses a request that can't run.
 */

import { MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

vi.mock("@snapotter/ai", () => ({ detectFaces: vi.fn() }));

let schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } };

beforeAll(() => {
  registerSmartCrop({ post: vi.fn() } as unknown as FastifyInstance);
  const config = getToolConfig("smart-crop");
  if (!config) throw new Error("smart-crop was not registered");
  schema = config.settingsSchema as unknown as typeof schema;
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
    expect(result.error?.message).toMatch(/pixels/i);
  });

  it("applies the padded check to face mode too, which falls back to the subject path", () => {
    expect(schema.safeParse({ mode: "face", width: MAX, height: MAX, padding: 10 }).success).toBe(
      false,
    );
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
