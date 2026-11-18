/**
 * image-pad accepted a 100:1 custom ratio with 50% padding, built a
 * multi-gigapixel blur canvas for about three minutes, then failed when libvips
 * refused to read that canvas back ("Input image exceeds pixel limit"). The
 * failure was reported to Sentry as a bug (NODE-A9) and reached the client as
 * a bare "Image padding failed" (#4404). The canvas is now sized up front and
 * an oversized one is a 400 before any pixel work.
 */

import { isSafeMessageError, isToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  assertPadCanvasFits,
  MAX_PAD_CANVAS_PIXELS,
  padCanvasFor,
  registerImagePad,
} from "../../../apps/api/src/routes/tools/image-pad.js";

type Config = NonNullable<ReturnType<typeof getToolConfig>>;
let config: Config;

// The settings from the Sentry event and the QA repro.
const extreme = {
  target: "custom",
  ratioW: 100,
  ratioH: 1,
  background: "blur",
  color: "#ffffff",
  padding: 50,
} as const;

beforeAll(() => {
  registerImagePad({ post: vi.fn() } as unknown as FastifyInstance);
  const registered = getToolConfig("image-pad");
  if (!registered) throw new Error("image-pad was not registered");
  config = registered;
});

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } })
    .png()
    .toBuffer();
}

describe("padCanvasFor", () => {
  it("adds the margin as a percentage of the ratio canvas's larger side", () => {
    // 300x200 at 100:1 is a 20000x200 canvas; 50% of 20000 is 10000 per edge.
    expect(padCanvasFor(300, 200, extreme)).toEqual({ finalW: 40000, finalH: 20200 });
    expect(padCanvasFor(300, 200, { target: "1:1", ratioW: 1, ratioH: 1, padding: 0 })).toEqual({
      finalW: 300,
      finalH: 300,
    });
  });
});

describe("assertPadCanvasFits", () => {
  it("accepts a canvas at the limit and rejects one pixel over it as a ToolInputError", () => {
    expect(MAX_PAD_CANVAS_PIXELS).toBe(268_402_689);
    expect(() => assertPadCanvasFits(16383, 16383)).not.toThrow();
    let caught: unknown;
    try {
      assertPadCanvasFits(16384, 16383);
    } catch (err) {
      caught = err;
    }
    expect(isToolInputError(caught)).toBe(true);
    expect((caught as Error).message).toContain("16384 x 16383");
  });
});

describe("image-pad oversized canvas (#4404)", () => {
  it("rejects the request in preValidate, before a job is enqueued", async () => {
    const buffer = await png(300, 200);
    const preValidate = config.preValidate;
    if (!preValidate) throw new Error("image-pad has no preValidate");
    await expect(
      preValidate({ inputs: [{ filename: "in.png", buffer }], settings: extreme }),
    ).rejects.toSatisfy(isToolInputError);
  });

  it("lets a canvas within the limit through preValidate", async () => {
    const buffer = await png(300, 200);
    const preValidate = config.preValidate;
    if (!preValidate) throw new Error("image-pad has no preValidate");
    await expect(
      preValidate({
        inputs: [{ filename: "in.png", buffer }],
        settings: { ...extreme, ratioW: 16, ratioH: 9, padding: 10 },
      }),
    ).resolves.toBeUndefined();
  });

  it("leaves an unreadable upload to the job instead of throwing from preValidate", async () => {
    const preValidate = config.preValidate;
    if (!preValidate) throw new Error("image-pad has no preValidate");
    await expect(
      preValidate({
        inputs: [{ filename: "in.png", buffer: Buffer.from("not an image") }],
        settings: extreme,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails the job fast as a ToolInputError, not a bug-kind SafeError", async () => {
    // Pipelines and batch runs skip preValidate, so the job checks again.
    const buffer = await png(300, 200);
    let caught: unknown;
    try {
      await config.process(buffer, extreme, "in.png");
    } catch (err) {
      caught = err;
    }
    expect(isToolInputError(caught)).toBe(true);
    expect(isSafeMessageError(caught)).toBe(false);
    expect((caught as Error).message).toContain("40000 x 20200");
  });

  it("answers a canvas too wide for WebP as a ToolInputError (the area check can't see it)", async () => {
    // 20000 x 200 is 4 MP, well inside the area limit, but the WebP encoder caps
    // each side at 16383, and a WebP input stays WebP.
    const webp = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer();
    let caught: unknown;
    try {
      await config.process(webp, { ...extreme, background: "color", padding: 0 }, "in.webp");
    } catch (err) {
      caught = err;
    }
    expect(isToolInputError(caught)).toBe(true);
    expect(isSafeMessageError(caught)).toBe(false);
  });

  it("still pads a normal request", async () => {
    const buffer = await png(300, 200);
    const result = await config.process(
      buffer,
      { ...extreme, ratioW: 1, ratioH: 1, padding: 0 },
      "in.png",
    );
    const out = result.buffer ? await sharp(result.buffer).metadata() : undefined;
    expect(out?.width).toBe(300);
    expect(out?.height).toBe(300);
  });
});
