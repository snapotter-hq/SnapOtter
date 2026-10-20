import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasAiJobHandler, runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerBackgroundReplace } from "../../../apps/api/src/routes/tools/background-replace.js";
import { registerRemoveGifBackground } from "../../../apps/api/src/routes/tools/remove-gif-background.js";
import { pairwise } from "../../helpers/pairwise.js";
import { pairwiseSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";

const mocks = vi.hoisted(() => ({
  removeBackground: vi.fn(),
  removeBackgroundAnimated: vi.fn(),
  isToolInstalled: vi.fn(() => true),
  receiveUpload: vi.fn(),
  getObjectBuffer: vi.fn(),
  putObject: vi.fn(),
  discardUnenqueuedUploads: vi.fn(),
  enqueueToolJob: vi.fn(),
  detectAnimation: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  removeBackground: mocks.removeBackground,
  removeBackgroundAnimated: mocks.removeBackgroundAnimated,
}));
vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: mocks.isToolInstalled,
}));
vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    getObjectBuffer: mocks.getObjectBuffer,
    putObject: mocks.putObject,
  };
});
vi.mock("../../../apps/api/src/lib/upload-cleanup.js", () => ({
  discardUnenqueuedUploads: mocks.discardUnenqueuedUploads,
  hasPersistedJobRow: vi.fn(async () => false),
}));
vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  insertToolJobAlias: vi.fn(),
}));
vi.mock("../../../apps/api/src/lib/animation-detect.js", () => ({
  detectAnimation: mocks.detectAnimation,
}));

const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
let validPng: Buffer;
let acceptsGifBg: (settings: unknown) => boolean;

beforeAll(async () => {
  validPng = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } },
  })
    .png()
    .toBuffer();

  const post = vi.fn((url: string, handler: (req: unknown, reply: unknown) => Promise<unknown>) => {
    handlers[url] = handler;
  });
  const app = { post } as unknown as FastifyInstance;
  registerBackgroundReplace(app);
  registerRemoveGifBackground(app);

  const gifSchema = getToolConfig("remove-gif-background")?.settingsSchema;
  if (!gifSchema) throw new Error("remove-gif-background is not registered");
  acceptsGifBg = (settings) => gifSchema.safeParse(settings).success;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.receiveUpload.mockImplementation(async (_part: unknown, jobId: string) => ({
    key: `uploads/${jobId}/photo.png`,
    filename: "photo.png",
    size: validPng.length,
  }));
  mocks.getObjectBuffer.mockResolvedValue(validPng);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.discardUnenqueuedUploads.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.detectAnimation.mockResolvedValue({ animated: true, frames: 2 });
  mocks.removeBackground.mockResolvedValue(validPng);
});

async function callRoute(path: string, settings: Record<string, unknown>) {
  const handler = handlers[path];
  if (!handler) throw new Error(`Route ${path} was not registered`);
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.payload = body;
      return this;
    },
  };
  const request = {
    headers: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
      yield { type: "field", fieldname: "settings", value: JSON.stringify(settings) };
    },
  };
  await handler(request, reply);
  return {
    statusCode: reply.statusCode,
    body: reply.payload as { error?: string; details?: string; jobId?: string },
  };
}

describe("background-replace color validation (#2282)", () => {
  const ROUTE = "/api/v1/tools/image/background-replace";

  it.each(["#FF0000", "#ff0000", "#F00", "#f00", "ff0000", "f00", " #FF5500 "])(
    "accepts the hex color %j on both color and gradient backgrounds",
    async (c) => {
      const colorRes = await callRoute(ROUTE, { backgroundType: "color", color: c });
      expect(colorRes.statusCode).toBe(202);

      const gradRes = await callRoute(ROUTE, {
        backgroundType: "gradient",
        gradientColor1: c,
        gradientColor2: "#000",
      });
      expect(gradRes.statusCode).toBe(202);
    },
  );

  it.each(["red", "#FF", "#FF00", "#GGGGGG", "#FF00000", "#FF000080", "", 'red"/><x'])(
    "rejects the malformed color %j with 400",
    async (c) => {
      const colorRes = await callRoute(ROUTE, { backgroundType: "color", color: c });
      expect(colorRes.statusCode).toBe(400);
      expect(colorRes.body.error).toBe("Invalid settings");

      const grad1Res = await callRoute(ROUTE, {
        backgroundType: "gradient",
        gradientColor1: c,
        gradientColor2: "#000000",
      });
      expect(grad1Res.statusCode).toBe(400);

      const grad2Res = await callRoute(ROUTE, {
        backgroundType: "gradient",
        gradientColor1: "#000000",
        gradientColor2: c,
      });
      expect(grad2Res.statusCode).toBe(400);
    },
  );

  it("requires both gradientColor1 and gradientColor2 when backgroundType is gradient", async () => {
    const missingBoth = await callRoute(ROUTE, { backgroundType: "gradient" });
    expect(missingBoth.statusCode).toBe(400);
    expect(missingBoth.body.error).toBe("Invalid settings");
    expect(missingBoth.body.details).toContain("gradientColor1");
    expect(missingBoth.body.details).toContain("gradientColor2");

    const missingSecond = await callRoute(ROUTE, {
      backgroundType: "gradient",
      gradientColor1: "#ff0000",
    });
    expect(missingSecond.statusCode).toBe(400);
    expect(missingSecond.body.details).toContain("gradientColor2");

    const missingFirst = await callRoute(ROUTE, {
      backgroundType: "gradient",
      gradientColor2: "#0000ff",
    });
    expect(missingFirst.statusCode).toBe(400);
    expect(missingFirst.body.details).toContain("gradientColor1");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("still defaults to a white color background when settings are empty", async () => {
    const res = await callRoute(ROUTE, {});
    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "background-replace",
        settings: expect.objectContaining({
          backgroundType: "color",
          color: "#ffffff",
        }),
      }),
    );
  });

  it("does not demand gradient stops when backgroundType is color", async () => {
    const res = await callRoute(ROUTE, {
      backgroundType: "color",
      color: "#ff0000",
      gradientColor1: "#000000",
    });
    expect(res.statusCode).toBe(202);
  });

  it("worker handler composites shorthand, hashless, and whitespace-padded hex colors", async () => {
    const colorOut = await runAiToolJob(
      {
        jobId: "j1",
        toolId: "background-replace",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/j1/photo.png"],
        filename: "photo.png",
        settings: { backgroundType: "color", color: " #f50 " },
        kind: "ai-tool",
      },
      validPng,
      { scratchDir: "/tmp", signal: new AbortController().signal, report: vi.fn() },
    );
    expect(colorOut.filename).toBe("photo_bg.png");
    const { data } = await sharp(colorOut.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 85, 0]);

    const gradOut = await runAiToolJob(
      {
        jobId: "j2",
        toolId: "background-replace",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/j2/photo.png"],
        filename: "photo.png",
        settings: {
          backgroundType: "gradient",
          gradientColor1: "f00",
          gradientColor2: " #00f ",
        },
        kind: "ai-tool",
      },
      validPng,
      { scratchDir: "/tmp", signal: new AbortController().signal, report: vi.fn() },
    );
    expect(gradOut.buffer.length).toBeGreaterThan(0);
  });

  it("worker handler rejects a gradient job missing its colors instead of falling back to white-to-black", async () => {
    expect(hasAiJobHandler("background-replace")).toBe(true);
    await expect(
      runAiToolJob(
        {
          jobId: "j1",
          toolId: "background-replace",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/j1/photo.png"],
          filename: "photo.png",
          settings: { backgroundType: "gradient" },
          kind: "ai-tool",
        },
        validPng,
        { scratchDir: "/tmp", signal: new AbortController().signal, report: vi.fn() },
      ),
    ).rejects.toThrow(/gradient background needs/i);
    expect(mocks.removeBackground).not.toHaveBeenCalled();
  });
});

describe("remove-gif-background color validation (#2282)", () => {
  const ROUTE = "/api/v1/tools/image/remove-gif-background";

  it.each(["#FF0000", "#ff0000", "#F00", "#f00", "ff0000", "f00", " #FF5500 "])(
    "accepts the hex color %j",
    async (c) => {
      expect(acceptsGifBg({ backgroundType: "color", backgroundColor: c })).toBe(true);
      expect(
        acceptsGifBg({ backgroundType: "gradient", gradientColor1: c, gradientColor2: "#000" }),
      ).toBe(true);

      const res = await callRoute(ROUTE, { backgroundType: "color", backgroundColor: c });
      expect(res.statusCode).toBe(202);
    },
  );

  it.each(["red", "#FF", "#FF00", "#GGGGGG", "#FF00000", "#FF000080", "", 'red"/><x'])(
    "rejects the malformed color %j everywhere a color is read",
    async (c) => {
      expect(acceptsGifBg({ backgroundType: "color", backgroundColor: c })).toBe(false);
      expect(
        acceptsGifBg({ backgroundType: "gradient", gradientColor1: c, gradientColor2: "#000000" }),
      ).toBe(false);
      expect(
        acceptsGifBg({ backgroundType: "gradient", gradientColor1: "#000000", gradientColor2: c }),
      ).toBe(false);

      const res = await callRoute(ROUTE, { backgroundType: "color", backgroundColor: c });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("Invalid settings");
      expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    },
  );

  it("requires backgroundColor when backgroundType is color", async () => {
    expect(acceptsGifBg({ backgroundType: "color" })).toBe(false);
    const res = await callRoute(ROUTE, { backgroundType: "color" });
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain("backgroundColor");
  });

  it("requires both gradient stops when backgroundType is gradient", async () => {
    expect(acceptsGifBg({ backgroundType: "gradient" })).toBe(false);
    expect(acceptsGifBg({ backgroundType: "gradient", gradientColor1: "#000000" })).toBe(false);
    expect(acceptsGifBg({ backgroundType: "gradient", gradientColor2: "#000000" })).toBe(false);

    const res = await callRoute(ROUTE, {
      backgroundType: "gradient",
      gradientColor1: "#000000",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain("gradientColor2");
  });

  it("still accepts settings that name no background, or a type that needs no color", () => {
    expect(acceptsGifBg({})).toBe(true);
    expect(acceptsGifBg({ backgroundType: "transparent" })).toBe(true);
    expect(acceptsGifBg({ backgroundType: "blur", blurIntensity: 40 })).toBe(true);
    expect(acceptsGifBg({ backgroundType: "transparent", backgroundColor: "#FF0000" })).toBe(true);
    expect(
      acceptsGifBg({
        backgroundType: "color",
        backgroundColor: "#FF0000",
        gradientColor1: "#000000",
      }),
    ).toBe(true);
  });

  it("worker handler and registry process fn reject missing or malformed colors before calling sidecar", async () => {
    const processFn = getToolConfig("remove-gif-background")?.process;
    if (!processFn) throw new Error("remove-gif-background process fn missing");

    for (const badSettings of [
      { backgroundType: "color" },
      { backgroundType: "color", backgroundColor: "red" },
      { backgroundType: "gradient", gradientColor1: "#000" },
    ]) {
      await expect(
        runAiToolJob(
          {
            jobId: "j-gif",
            toolId: "remove-gif-background",
            userId: null,
            pool: "ai",
            inputRefs: ["uploads/j-gif/anim.gif"],
            filename: "anim.gif",
            settings: badSettings,
            kind: "ai-tool",
          },
          validPng,
          { scratchDir: "/tmp", signal: new AbortController().signal, report: vi.fn() },
        ),
      ).rejects.toThrow();

      await expect(
        processFn(validPng, badSettings, "anim.gif", {
          scratchDir: "/tmp",
          signal: new AbortController().signal,
          report: vi.fn(),
        }),
      ).rejects.toThrow();
    }
    expect(mocks.removeBackgroundAnimated).not.toHaveBeenCalled();
  });

  it("pairwiseSettingsFor('remove-gif-background') keeps color and gradient background types reachable in pairwise sampling", () => {
    const schema = getToolConfig("remove-gif-background")?.settingsSchema;
    if (!schema) throw new Error("remove-gif-background is not registered");

    const axes = deriveAxes(schema);
    const base = pairwiseSettingsFor("remove-gif-background");
    const cases = pairwise(axes)
      .map((combo) => ({ ...base, ...compactCase(combo) }))
      .map((combo) => schema.safeParse(combo))
      .filter(
        (parsed): parsed is { success: true; data: { backgroundType?: string } } => parsed.success,
      );

    const backgroundTypes = new Set(cases.map((c) => c.data.backgroundType));
    expect(backgroundTypes.has("transparent")).toBe(true);
    expect(backgroundTypes.has("color")).toBe(true);
    expect(backgroundTypes.has("gradient")).toBe(true);
    expect(backgroundTypes.has("blur")).toBe(true);
  });
});
