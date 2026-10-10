import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerRemoveGifBackground } from "../../../apps/api/src/routes/tools/remove-gif-background.js";

const aiMocks = vi.hoisted(() => ({
  colorize: vi.fn(),
  detectAnimation: vi.fn(),
  outpaint: vi.fn(),
  removeBackgroundAnimated: vi.fn(),
}));

// Keep the real exports the route modules read at import time and stub the
// model calls.
vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  ...aiMocks,
}));

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: join(tmpdir(), "snapotter-ai-parity-test"),
  report: vi.fn(),
};

let jpeg: Buffer;
let png: Buffer;

beforeAll(async () => {
  const source = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } },
  });
  jpeg = await source.jpeg().toBuffer();
  png = await source.png().toBuffer();

  aiMocks.colorize.mockResolvedValue({ buffer: png, width: 40, height: 30, method: "mock" });
  aiMocks.outpaint.mockResolvedValue(png);
  aiMocks.detectAnimation.mockResolvedValue({ animated: false, frames: 1 });
  aiMocks.removeBackgroundAnimated.mockResolvedValue({
    buffer: png,
    ext: "gif",
    contentType: "image/gif",
  });

  const app = { post: vi.fn(), get: vi.fn() } as unknown as FastifyInstance;
  registerAiCanvasExpand(app);
  registerColorize(app);
  registerRemoveGifBackground(app);
});

function processFn(toolId: string) {
  const config = getToolConfig(toolId);
  if (!config?.process) throw new Error(`${toolId} registers no process fn`);
  return config.process;
}

/**
 * A pipeline step or batch child runs the registry process fn (#2076), so the
 * fn has to match what the tool page produced through the AI handler: same
 * output format, same extension, same content type.
 */
describe("AI tool process fns match their handlers in pipelines (#2076)", () => {
  it("colorize keeps the input's format instead of forcing PNG", async () => {
    const out = await processFn("colorize")(
      jpeg,
      { intensity: 1, model: "auto" },
      "photo.jpg",
      ctx,
    );

    expect(out.filename).toBe("photo_colorized.jpg");
    expect(out.contentType).toBe("image/jpeg");
    expect((await sharp(out.buffer).metadata()).format).toBe("jpeg");
  });

  it("colorize still emits PNG for a PNG input", async () => {
    const out = await processFn("colorize")(png, { intensity: 1, model: "auto" }, "photo.png", ctx);

    expect(out.filename).toBe("photo_colorized.png");
    expect(out.contentType).toBe("image/png");
  });

  it("ai-canvas-expand honours format auto by following the input", async () => {
    const out = await processFn("ai-canvas-expand")(
      jpeg,
      { extendRight: 8, format: "auto", quality: 95 },
      "photo.jpg",
      ctx,
    );

    expect(out.filename).toBe("photo_extended.jpg");
    expect(out.contentType).toBe("image/jpeg");
  });

  it("ai-canvas-expand honours an explicit format over the input", async () => {
    const out = await processFn("ai-canvas-expand")(
      jpeg,
      { extendRight: 8, format: "webp", quality: 80 },
      "photo.jpg",
      ctx,
    );

    expect(out.filename).toBe("photo_extended.webp");
    expect(out.contentType).toBe("image/webp");
    expect((await sharp(out.buffer).metadata()).format).toBe("webp");
  });

  it("remove-gif-background accepts a still frame the way the tool page does", async () => {
    aiMocks.removeBackgroundAnimated.mockClear();

    const out = await processFn("remove-gif-background")(png, {}, "still.gif", ctx);

    expect(out.filename).toBe("still-nobg.gif");
    expect(out.contentType).toBe("image/gif");
    expect(aiMocks.removeBackgroundAnimated).toHaveBeenCalledOnce();
  });

  it("remove-gif-background passes the cancel sentinel", async () => {
    aiMocks.removeBackgroundAnimated.mockClear();

    await processFn("remove-gif-background")(png, {}, "still.gif", ctx);

    const options = aiMocks.removeBackgroundAnimated.mock.calls[0][2] as { cancelFile?: string };
    expect(options.cancelFile).toContain("cancel.flag");
  });
});
