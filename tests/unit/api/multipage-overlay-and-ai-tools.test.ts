import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { getToolConfig, type ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerBlurFaces } from "../../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerCompose } from "../../../apps/api/src/routes/tools/compose.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerUpscale } from "../../../apps/api/src/routes/tools/upscale.js";
import { registerWatermarkImage } from "../../../apps/api/src/routes/tools/watermark-image.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/**
 * Issue #5104: these routes opened a multi-page TIFF or an animated GIF as a
 * still and answered 200 with page 1 alone.
 *
 * compose and watermark-image are plain sharp composites, so they now place
 * the overlay on every page. The AI tools run a model once per call, so they
 * refuse multi-frame input with a code the web app translates, rather than
 * multiplying model time by the page count.
 *
 * The model calls are stubbed to hand back a one-page PNG the size of the
 * input page, which is what the sidecars return, so the tests never need a
 * Python runtime.
 */

const ai = vi.hoisted(() => ({
  upscale: vi.fn(),
  blurFaces: vi.fn(),
  colorize: vi.fn(),
  restorePhoto: vi.fn(),
  outpaint: vi.fn(),
  inpaint: vi.fn(),
}));
const stored = vi.hoisted(() => new Map<string, Buffer>());

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  ...ai,
}));
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  putObject: async (key: string, data: Buffer) => {
    stored.set(key, data);
  },
  getObjectBuffer: async (key: string) => {
    const data = stored.get(key);
    if (!data) throw new Error(`no stored object at ${key}`);
    return data;
  },
}));

const PAGE_SIZE = 80;

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: join(tmpdir(), "snapotter-multipage-5104-test"),
  report: () => {},
};

let pagePng: Buffer;

async function solidPng(width: number, height: number, shade: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: { r: shade, g: shade, b: shade } },
  })
    .png()
    .toBuffer();
}

/** A 3-page TIFF whose pages differ in brightness. */
async function threePageTiff(): Promise<Buffer> {
  const pages = await Promise.all([60, 130, 210].map((s) => solidPng(PAGE_SIZE, PAGE_SIZE, s)));
  return await sharp(pages, { join: { across: 1, animated: true } })
    .tiff({ compression: "lzw" })
    .toBuffer();
}

async function pageShape(buffer: Buffer) {
  const meta = await sharp(buffer, { pages: -1 }).metadata();
  return {
    format: meta.format,
    pages: meta.pages ?? 1,
    width: meta.width,
    pageHeight: meta.pageHeight ?? meta.height,
  };
}

beforeAll(async () => {
  pagePng = await solidPng(PAGE_SIZE, PAGE_SIZE, 128);
  const app = { post: () => undefined } as unknown as FastifyInstance;
  registerAiCanvasExpand(app);
  registerBlurFaces(app);
  registerColorize(app);
  registerEraseObject(app);
  registerRestorePhoto(app);
  registerUpscale(app);
});

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  ai.upscale.mockResolvedValue({
    buffer: pagePng,
    format: "png",
    width: PAGE_SIZE,
    height: PAGE_SIZE,
    method: "lanczos",
  });
  ai.blurFaces.mockResolvedValue({ buffer: pagePng, facesDetected: 0, faces: [] });
  ai.colorize.mockResolvedValue({
    buffer: pagePng,
    width: PAGE_SIZE,
    height: PAGE_SIZE,
    method: "opencv",
  });
  ai.restorePhoto.mockResolvedValue({
    buffer: pagePng,
    width: PAGE_SIZE,
    height: PAGE_SIZE,
    steps: [],
    scratchCoverage: 0,
    facesEnhanced: 0,
    isGrayscale: false,
    colorized: false,
  });
  ai.outpaint.mockResolvedValue(pagePng);
  ai.inpaint.mockResolvedValue(pagePng);
});

const AI_PROCESS_TOOLS = [
  "ai-canvas-expand",
  "blur-faces",
  "colorize",
  "restore-photo",
  "upscale",
] as const;

const AI_JOB_TOOLS = [...AI_PROCESS_TOOLS, "erase-object"] as const;

const MODEL_FOR: Record<(typeof AI_JOB_TOOLS)[number], keyof typeof ai> = {
  "ai-canvas-expand": "outpaint",
  "blur-faces": "blurFaces",
  colorize: "colorize",
  "erase-object": "inpaint",
  "restore-photo": "restorePhoto",
  upscale: "upscale",
};

function aiJob(toolId: string, filename: string, settings: Record<string, unknown> = {}) {
  const data: ToolJobData = {
    jobId: `job-${toolId}`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-${toolId}/${filename}`, `uploads/job-${toolId}/mask.png`],
    filename,
    settings,
    kind: "ai-tool",
  };
  stored.set(`uploads/job-${toolId}/mask.png`, pagePng);
  return data;
}

/** erase-object's route resolves "auto" before it enqueues, so its jobs carry a format. */
function jobSettings(toolId: string, format: string): Record<string, unknown> {
  return toolId === "erase-object" ? { format } : {};
}

describe("AI tools refuse multi-frame input rather than keeping frame 1 (#5104)", () => {
  it.each(AI_PROCESS_TOOLS)("%s pipeline step refuses a multi-page TIFF", async (toolId) => {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);
    const settings = config.settingsSchema.parse({});
    await expect(
      config.process(readFixture(fixtures.image.multipageTiff), settings, "multipage.tiff", ctx),
    ).rejects.toMatchObject({ code: "MULTI_FRAME_UNSUPPORTED", message: /10 pages/ });
    expect(ai[MODEL_FOR[toolId]]).not.toHaveBeenCalled();
  });

  it.each(AI_PROCESS_TOOLS)("%s pipeline step refuses an animated GIF", async (toolId) => {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);
    const settings = config.settingsSchema.parse({});
    await expect(
      config.process(readFixture(fixtures.image.animated.gif), settings, "animated.gif", ctx),
    ).rejects.toMatchObject({ code: "MULTI_FRAME_UNSUPPORTED", message: /frames/ });
    expect(ai[MODEL_FOR[toolId]]).not.toHaveBeenCalled();
  });

  it("refuses an animated WebP going back out as WebP", async () => {
    await expect(
      runAiToolJob(
        aiJob("colorize", "animated.webp"),
        readFixture(fixtures.image.animated.webp),
        ctx,
      ),
    ).rejects.toMatchObject({ code: "MULTI_FRAME_UNSUPPORTED", message: /frames/ });
  });

  it.each(AI_JOB_TOOLS)("%s worker job refuses a multi-page TIFF", async (toolId) => {
    await expect(
      runAiToolJob(
        aiJob(toolId, "multipage.tiff", jobSettings(toolId, "tiff")),
        readFixture(fixtures.image.multipageTiff),
        ctx,
      ),
    ).rejects.toMatchObject({ code: "MULTI_FRAME_UNSUPPORTED", message: /10 pages/ });
  });

  it.each(AI_JOB_TOOLS)("%s worker job refuses an animated GIF", async (toolId) => {
    await expect(
      runAiToolJob(
        aiJob(toolId, "animated.gif", jobSettings(toolId, "gif")),
        readFixture(fixtures.image.animated.gif),
        ctx,
      ),
    ).rejects.toMatchObject({ code: "MULTI_FRAME_UNSUPPORTED" });
  });

  it.each(AI_JOB_TOOLS)(
    "%s worker job never reaches the model for a refused input",
    async (toolId) => {
      await expect(
        runAiToolJob(
          aiJob(toolId, "pages.tiff", jobSettings(toolId, "tiff")),
          await threePageTiff(),
          ctx,
        ),
      ).rejects.toThrow();
      expect(ai[MODEL_FOR[toolId]]).not.toHaveBeenCalled();
    },
  );

  it("still takes frame 1 of a GIF when the chosen format is a still one", async () => {
    const out = await runAiToolJob(
      aiJob("upscale", "animated.gif", { format: "png" }),
      readFixture(fixtures.image.animated.gif),
      ctx,
    );
    expect(out.contentType).toBe("image/png");
    expect(ai.upscale).toHaveBeenCalledOnce();
  });

  it("still runs a one-page TIFF", async () => {
    const onePage = await sharp(await threePageTiff(), { page: 0, pages: 1 })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const out = await runAiToolJob(aiJob("colorize", "page.tiff"), onePage, ctx);
    expect(await pageShape(out.buffer)).toMatchObject({ format: "tiff", pages: 1 });
  });

  it("still takes page 1 when the output format is a still one", async () => {
    const out = await runAiToolJob(
      aiJob("erase-object", "pages.tiff", { format: "png" }),
      await threePageTiff(),
      ctx,
    );
    expect(out.contentType).toBe("image/png");
    expect(ai.inpaint).toHaveBeenCalledOnce();
  });
});

type RouteHandler = (req: unknown, rep: unknown) => Promise<unknown>;

function handlerFor(register: (app: FastifyInstance) => void): RouteHandler {
  let handler: RouteHandler | undefined;
  register({
    post: (_url: string, fn: RouteHandler) => {
      handler = fn;
    },
  } as unknown as FastifyInstance);
  if (!handler) throw new Error("route not registered");
  return handler;
}

/** Drive a two-upload route with a fake multipart request; returns the reply and stored output. */
async function postTwoFiles(
  register: (app: FastifyInstance) => void,
  base: { fieldname: string; filename: string; content: Buffer },
  overlay: { fieldname: string; filename: string; content: Buffer },
  settings: Record<string, unknown> = {},
) {
  const request = {
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      for (const f of [base, overlay]) {
        yield {
          type: "file" as const,
          fieldname: f.fieldname,
          filename: f.filename,
          file: Readable.from([f.content]),
        };
      }
      yield { type: "field" as const, fieldname: "settings", value: JSON.stringify(settings) };
    },
  };
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
  await handlerFor(register)(request, reply);
  const output = [...stored.entries()].find(([key]) => key.startsWith("outputs/"))?.[1];
  return { reply, output };
}

const OVERLAY_ROUTES = [
  {
    toolId: "compose",
    register: registerCompose,
    overlayField: "overlay",
    settings: { x: 10, y: 10 },
  },
  {
    toolId: "watermark-image",
    register: registerWatermarkImage,
    overlayField: "watermark",
    settings: { opacity: 100, position: "center" },
  },
] as const;

/** The overlay is pure red, and every page is grey, so red at the centre proves it landed. */
async function centreIsRed(buffer: Buffer, page: number): Promise<boolean> {
  const { data, info } = await sharp(buffer, { page })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 3;
  return data[offset] > 200 && data[offset + 1] < 60 && data[offset + 2] < 60;
}

describe("compose and watermark-image keep every page (#5104)", () => {
  let red: Buffer;
  beforeAll(async () => {
    red = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
  });

  it.each(OVERLAY_ROUTES)(
    "$toolId overlays every page of a multi-page TIFF",
    async ({ register, overlayField, settings }) => {
      const { reply, output } = await postTwoFiles(
        register,
        { fieldname: "file", filename: "pages.tiff", content: await threePageTiff() },
        { fieldname: overlayField, filename: "red.png", content: red },
        settings,
      );
      expect(reply.statusCode).toBe(200);
      if (!output) throw new Error("no output stored");
      expect(await pageShape(output)).toEqual({
        format: "tiff",
        pages: 3,
        width: PAGE_SIZE,
        pageHeight: PAGE_SIZE,
      });
      for (let page = 0; page < 3; page++) {
        expect(await centreIsRed(output, page)).toBe(true);
      }
    },
  );

  it.each(OVERLAY_ROUTES)(
    "$toolId keeps every frame of an animated GIF",
    async ({ register, overlayField, settings }) => {
      const gif = readFixture(fixtures.image.animated.gif);
      const source = await sharp(gif).metadata();
      const { reply, output } = await postTwoFiles(
        register,
        { fieldname: "file", filename: "animated.gif", content: gif },
        { fieldname: overlayField, filename: "red.png", content: red },
        settings,
      );
      expect(reply.statusCode).toBe(200);
      if (!output) throw new Error("no output stored");
      const meta = await sharp(output).metadata();
      expect(meta.format).toBe("gif");
      expect(meta.pages).toBe(source.pages);
    },
  );

  it.each(OVERLAY_ROUTES)(
    "$toolId refuses a TIFF whose pages differ in size",
    async ({ register, overlayField, settings }) => {
      const { reply } = await postTwoFiles(
        register,
        {
          fieldname: "file",
          filename: "mixed.tiff",
          content: readFixture(fixtures.image.edge.multipageMixedSizesTiff),
        },
        { fieldname: overlayField, filename: "red.png", content: red },
        settings,
      );
      expect(reply.statusCode).toBeGreaterThanOrEqual(400);
      expect(reply.statusCode).toBeLessThan(500);
      expect(JSON.stringify(reply.payload)).toMatch(/2 pages of different sizes/);
    },
  );

  it.each(OVERLAY_ROUTES)(
    "$toolId still writes a single image for a still input",
    async ({ register, overlayField, settings }) => {
      const { reply, output } = await postTwoFiles(
        register,
        { fieldname: "file", filename: "page.png", content: pagePng },
        { fieldname: overlayField, filename: "red.png", content: red },
        settings,
      );
      expect(reply.statusCode).toBe(200);
      if (!output) throw new Error("no output stored");
      expect(await pageShape(output)).toMatchObject({ format: "png", pages: 1 });
      expect(await centreIsRed(output, 0)).toBe(true);
    },
  );
});
