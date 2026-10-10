import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  hasAiJobHandler,
  registerAiJobHandler,
} from "../../../../apps/api/src/jobs/ai-handlers.js";
import { selectJobDispatch } from "../../../../apps/api/src/jobs/worker.js";
import { getToolConfig } from "../../../../apps/api/src/routes/tool-factory.js";
import { registerAiCanvasExpand } from "../../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerBlurFaces } from "../../../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerNoiseRemoval } from "../../../../apps/api/src/routes/tools/noise-removal.js";
import { registerOcr } from "../../../../apps/api/src/routes/tools/ocr.js";
import { registerOcrPdf } from "../../../../apps/api/src/routes/tools/ocr-pdf.js";
import { registerRedEyeRemoval } from "../../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveBackground } from "../../../../apps/api/src/routes/tools/remove-background.js";
import { registerRemoveGifBackground } from "../../../../apps/api/src/routes/tools/remove-gif-background.js";
import { registerRestorePhoto } from "../../../../apps/api/src/routes/tools/restore-photo.js";
import { registerTransparencyFixer } from "../../../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../../../apps/api/src/routes/tools/upscale.js";

const aiMocks = vi.hoisted(() => ({
  colorize: vi.fn(),
  enhanceFaces: vi.fn(),
  noiseRemoval: vi.fn(),
  removeBackground: vi.fn(),
  removeRedEye: vi.fn(),
  restorePhoto: vi.fn(),
  upscale: vi.fn(),
}));

// Keep the real exports the AI route modules read at import time (the OCR
// capability strings and the like) and stub only the model calls.
vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  ...aiMocks,
}));

const fakeApp = { post: vi.fn(), get: vi.fn() } as unknown as FastifyInstance;

// The tools that register both an AI job handler and a registry process fn.
// The worker used to prefer the handler over the process fn for every job kind,
// so a pipeline step or batch child ran the handler while the process fns were
// dead code (#2076). ocr-pdf is separate: it registers the path-backed handler.
const AI_TOOLS = [
  "ai-canvas-expand",
  "blur-faces",
  "colorize",
  "enhance-faces",
  "noise-removal",
  "ocr",
  "red-eye-removal",
  "remove-background",
  "remove-gif-background",
  "restore-photo",
  "transparency-fixer",
  "upscale",
];

beforeAll(() => {
  registerAiCanvasExpand(fakeApp);
  registerBlurFaces(fakeApp);
  registerColorize(fakeApp);
  registerEnhanceFaces(fakeApp);
  registerNoiseRemoval(fakeApp);
  registerOcr(fakeApp);
  registerOcrPdf(fakeApp);
  registerRedEyeRemoval(fakeApp);
  registerRemoveBackground(fakeApp);
  registerRemoveGifBackground(fakeApp);
  registerRestorePhoto(fakeApp);
  registerTransparencyFixer(fakeApp);
  registerUpscale(fakeApp);
});

describe("job dispatch for AI tools (#2076)", () => {
  it("registers an AI handler for every tool in the list", () => {
    for (const toolId of AI_TOOLS) {
      expect(hasAiJobHandler(toolId), toolId).toBe(true);
    }
  });

  it("registers a registry process fn for every AI tool, the path-backed one included", () => {
    for (const toolId of [...AI_TOOLS, "ocr-pdf"]) {
      expect(getToolConfig(toolId)?.processV2, toolId).toBeDefined();
    }
  });

  it.each(AI_TOOLS)("runs the process fn for pipeline steps and batch children: %s", (toolId) => {
    expect(selectJobDispatch(toolId, "pipeline-step")).toBe("registry");
    expect(selectJobDispatch(toolId, "batch-child")).toBe("registry");
  });

  it.each(AI_TOOLS)("keeps the standalone ai-tool kind on the handler: %s", (toolId) => {
    expect(selectJobDispatch(toolId, "ai-tool")).toBe("ai-handler");
  });

  it("keeps ocr-pdf on its path-backed handler for every kind", () => {
    expect(hasAiJobHandler("ocr-pdf")).toBe(false);
    for (const kind of ["ai-tool", "pipeline-step", "batch-child", "tool"] as const) {
      expect(selectJobDispatch("ocr-pdf", kind)).toBe("ai-path");
    }
  });

  it("leaves a non-AI tool on the registry for every kind", () => {
    for (const kind of ["tool", "pipeline-step", "batch-child"] as const) {
      expect(selectJobDispatch("image-to-pdf", kind)).toBe("registry");
    }
  });

  it("keeps an AI tool that has no process fn on its handler for pipeline steps", () => {
    // Nothing in the catalog does this today; the rule has to stay safe if one
    // ever does, or the registry branch would throw "No tool config".
    registerAiJobHandler("wt-handler-only", async () => ({
      buffer: Buffer.from("x"),
      filename: "x.png",
      contentType: "image/png",
    }));

    expect(selectJobDispatch("wt-handler-only", "pipeline-step")).toBe("ai-handler");
  });
});
