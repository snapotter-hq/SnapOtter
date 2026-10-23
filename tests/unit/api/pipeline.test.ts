/**
 * Unit tests for pipeline route utility logic.
 *
 * Tests pipeline step validation schemas, tool resolution (content-aware resize),
 * unique filename deduplication, and the pipeline step schema constraints.
 */
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { SafeError } from "@snapotter/shared";
import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const onConflictDoUpdateMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ rowCount: number }>>(async () => ({ rowCount: 1 })),
);
const defaultInsertValuesImpl = vi.hoisted(() => (..._args: unknown[]) => {
  const p = Promise.resolve({ rowCount: 1 }) as Promise<{ rowCount: number }> & {
    onConflictDoUpdate: typeof onConflictDoUpdateMock;
  };
  p.onConflictDoUpdate = onConflictDoUpdateMock;
  return p;
});
const insertValuesMock = vi.hoisted(() => vi.fn(defaultInsertValuesImpl));
const updateSetMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const readFileSpy = vi.hoisted(() => vi.fn());
const rmSpy = vi.hoisted(() => vi.fn());
const spoolMultipartFileSpy = vi.hoisted(() => vi.fn());
const storeValidatedOcrPdfSpy = vi.hoisted(() => vi.fn());
const recordChildOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
const clearBatchCanceledMock = vi.hoisted(() => vi.fn(async () => {}));
const failBatchJobMock = vi.hoisted(() => vi.fn(async () => true));
const clearTerminalReplayKeyMock = vi.hoisted(() => vi.fn(async () => {}));
const updateJobProgressMock = vi.hoisted(() => vi.fn());
const updateSingleFileProgressMock = vi.hoisted(() => vi.fn(async () => {}));
const flowAddMock = vi.hoisted(() => vi.fn(async () => {}));
const waitForJobMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null),
);
const putObjectMock = vi.hoisted(() => vi.fn(async () => {}));
const putObjectStreamMock = vi.hoisted(() =>
  vi.fn<(key: string, stream: Readable, opts?: unknown) => Promise<number>>(async () => 42),
);
const deleteObjectMock = vi.hoisted(() => vi.fn(async () => {}));
const validatePdfPathMock = vi.hoisted(() => vi.fn(async () => {}));
const getToolConfigSpy = vi.hoisted(() => vi.fn());
const selectWhereMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Array<{ error?: unknown }>>>(async () => []),
);

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => selectWhereMock(...args),
        all: () => [],
      }),
    }),
    insert: () => ({ values: (...args: unknown[]) => insertValuesMock(...args) }),
    delete: () => ({ where: () => ({ run: vi.fn() }) }),
    update: () => ({
      set: (vals: unknown) => {
        updateSetMock(vals);
        return { where: () => Promise.resolve({ run: vi.fn() }) };
      },
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: {} },
    pipelines: { id: {} },
    userFiles: { id: {} },
    jobs: { id: {}, status: {}, error: {} },
  },
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError: reportErrorMock };
});

const envMock = vi.hoisted(() => ({
  BASE_PATH: "",
  WORKSPACE_PATH: "/tmp/test",
  SCRATCH_PATH: "",
  MAX_MEGAPIXELS: 100,
  MAX_SVG_SIZE_MB: 10,
  MAX_PIPELINE_STEPS: 20,
  MAX_PIPELINE_STEP_PIXELS: 0,
  MAX_BATCH_SIZE: 10,
  MAX_UPLOAD_SIZE_MB: 100,
  CONCURRENT_JOBS: 3,
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: envMock,
}));

vi.mock("../../../apps/api/src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/auto-orient.js", () => ({
  autoOrient: vi.fn((buf: Buffer) => Promise.resolve(buf)),
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", () => ({
  validateImageBuffer: vi.fn(() =>
    Promise.resolve({ valid: true, format: "png", width: 100, height: 100 }),
  ),
}));

vi.mock("../../../apps/api/src/lib/filename.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/filename.js")>();
  return {
    ...actual,
    sanitizeFilename: (n: string) => n,
  };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: vi.fn(),
    needsCliDecode: vi.fn(() => false),
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  return {
    ...actual,
    decompressSvgz: vi.fn((b: Buffer) => actual.decompressSvgz(b)),
    isSvgBuffer: vi.fn((b: Buffer) => actual.isSvgBuffer(b)),
    sanitizeSvg: vi.fn((b: Buffer) => actual.sanitizeSvg(b)),
  };
});

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: vi.fn(() => true),
  getFirstMissingBundleForTool: vi.fn(() => null),
}));

vi.mock("../../../apps/api/src/lib/errors.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/errors.js")>();
  return {
    ...actual,
    formatZodErrors: (issues: Array<{ message: string }>) =>
      issues.map((i) => i.message).join("; "),
  };
});

vi.mock("../../../apps/api/src/lib/env.js", () => ({
  resolveConcurrency: () => 2,
  resolveWorkerThreads: () => 2,
  loadEnv: () => ({}),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (readFileSpy.getMockImplementation()) {
        return readFileSpy(...args);
      }
      const buf = (await actual.readFile(...args)) as Buffer;
      readFileSpy(...args);
      return buf;
    },
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (rmSpy.getMockImplementation()) {
        await rmSpy(...args);
      } else {
        rmSpy(...args);
      }
      return actual.rm(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/ocr-pdf-ingress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/ocr-pdf-ingress.js")>();
  return {
    ...actual,
    spoolMultipartFile: async (...args: Parameters<typeof actual.spoolMultipartFile>) => {
      if (spoolMultipartFileSpy.getMockImplementation()) {
        return spoolMultipartFileSpy(...args);
      }
      const res = await actual.spoolMultipartFile(...args);
      spoolMultipartFileSpy(...args);
      return res;
    },
    storeValidatedOcrPdf: async (...args: Parameters<typeof actual.storeValidatedOcrPdf>) => {
      if (storeValidatedOcrPdfSpy.getMockImplementation()) {
        return storeValidatedOcrPdfSpy(...args);
      }
      return actual.storeValidatedOcrPdf(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: putObjectMock,
    putObjectStream: putObjectStreamMock,
    deleteObject: deleteObjectMock,
    getObjectStream: vi.fn(),
  };
});

vi.mock("../../../apps/api/src/modality/document-input.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/modality/document-input.js")>();
  return {
    ...actual,
    validatePdfPath: validatePdfPathMock,
  };
});

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  getFlowProducer: () => ({ add: flowAddMock }),
  injectTraceContext: vi.fn(),
  waitForJob: waitForJobMock,
}));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", () => ({
  clearBatchCanceled: clearBatchCanceledMock,
  recordChildOutcome: recordChildOutcomeMock,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  clearTerminalReplayKey: clearTerminalReplayKeyMock,
  failBatchJob: failBatchJobMock,
  updateJobProgress: updateJobProgressMock,
  updateSingleFileProgress: updateSingleFileProgressMock,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: vi.fn(() => true),
  hasEffectiveToolAccess: vi.fn(async () => true),
  requirePermission: () => vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

vi.mock("../../../apps/api/src/routes/tool-factory.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/routes/tool-factory.js")>();
  return {
    ...actual,
    getToolConfig: (toolId: string) => {
      if (getToolConfigSpy.getMockImplementation()) {
        return getToolConfigSpy(toolId);
      }
      return actual.getToolConfig(toolId);
    },
  };
});

import { autoOrient } from "../../../apps/api/src/lib/auto-orient.js";
import { getFirstMissingBundleForTool } from "../../../apps/api/src/lib/feature-status.js";
import { validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";
import { createUniqueNamer } from "../../../apps/api/src/lib/filename.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { hasEffectiveToolAccess } from "../../../apps/api/src/permissions.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import {
  pipelineDefinitionSchema,
  pipelineStepSchema,
  registerPipelineRoutes,
  resolvePipelineStepToolId,
  savePipelineSchema,
} from "../../../apps/api/src/routes/pipeline.js";
import {
  getRegisteredToolIds,
  getToolConfig,
  registerToolProcessFn,
} from "../../../apps/api/src/routes/tool-factory.js";

// ── Pipeline step schema tests ─────────────────────────────────────────

describe("pipeline step schema validation", () => {
  it("requires at least one step and enforces MAX_PIPELINE_STEPS", () => {
    const empty = pipelineDefinitionSchema.safeParse({ steps: [] });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe("Pipeline must have at least one step");
    }

    const atMax = pipelineDefinitionSchema.safeParse({
      steps: Array.from({ length: 20 }, () => ({ toolId: "resize", settings: {} })),
    });
    expect(atMax.success).toBe(true);

    const overMax = pipelineDefinitionSchema.safeParse({
      steps: Array.from({ length: 21 }, () => ({ toolId: "resize", settings: {} })),
    });
    expect(overMax.success).toBe(false);
    if (!overMax.success) {
      expect(overMax.error.issues[0]?.message).toBe("Pipeline exceeds maximum steps");
    }
  });

  it("validates step has toolId field", () => {
    const parsed = pipelineStepSchema.safeParse({ toolId: "resize", settings: { width: 100 } });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ toolId: "resize", settings: { width: 100 } });
    }
    expect(pipelineStepSchema.safeParse({ settings: {} }).success).toBe(false);
  });

  it("defaults settings to empty object when omitted", () => {
    const parsed = pipelineStepSchema.parse({ toolId: "compress" });
    expect(parsed).toEqual({ toolId: "compress", settings: {} });
  });

  it("validates savePipelineSchema name, optional description, and steps constraints", () => {
    expect(
      savePipelineSchema.safeParse({
        name: "Resize and Compress",
        description: "Web ready",
        steps: [{ toolId: "resize" }],
      }).success,
    ).toBe(true);
    expect(
      savePipelineSchema.safeParse({
        name: "Resize only",
        steps: [{ toolId: "resize" }],
      }).success,
    ).toBe(true);
    expect(
      savePipelineSchema.safeParse({
        name: "",
        steps: [{ toolId: "resize" }],
      }).success,
    ).toBe(false);
    expect(
      savePipelineSchema.safeParse({
        name: "a".repeat(101),
        steps: [{ toolId: "resize" }],
      }).success,
    ).toBe(false);
    expect(
      savePipelineSchema.safeParse({
        name: "Valid",
        description: "d".repeat(501),
        steps: [{ toolId: "resize" }],
      }).success,
    ).toBe(false);
    expect(
      savePipelineSchema.safeParse({
        name: "Empty steps",
        steps: [],
      }).success,
    ).toBe(false);
  });
});

// ── Tool resolution (content-aware resize routing) ─────────────────────

describe("content-aware resize routing", () => {
  it("resolves resize with contentAware to content-aware-resize", () => {
    expect(
      resolvePipelineStepToolId({
        toolId: "resize",
        settings: { contentAware: true, width: 200 },
      }),
    ).toBe("content-aware-resize");
  });

  it("keeps resize as-is without contentAware", () => {
    expect(
      resolvePipelineStepToolId({
        toolId: "resize",
        settings: { width: 200 },
      }),
    ).toBe("resize");
    expect(
      resolvePipelineStepToolId({
        toolId: "resize",
        settings: { contentAware: false, width: 200 },
      }),
    ).toBe("resize");
    expect(resolvePipelineStepToolId({ toolId: "resize" })).toBe("resize");
  });

  it("keeps non-resize tools unchanged", () => {
    expect(
      resolvePipelineStepToolId({
        toolId: "compress",
        settings: { quality: 80, contentAware: true },
      }),
    ).toBe("compress");
  });
});

// ── Unique filename deduplication ──────────────────────────────────────

describe("filename deduplication (createUniqueNamer)", () => {
  it("returns the original name when no conflicts", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("photo.png")).toBe("photo.png");
  });

  it("adds _1 suffix on first conflict", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("photo.png")).toBe("photo.png");
    expect(uniqueName("photo.png")).toBe("photo_1.png");
  });

  it("increments counter on repeated conflicts", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("photo.png")).toBe("photo.png");
    expect(uniqueName("photo_1.png")).toBe("photo_1.png");
    expect(uniqueName("photo.png")).toBe("photo_2.png");
  });

  it("handles filenames without extension", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("README")).toBe("README");
    expect(uniqueName("README")).toBe("README_1");
  });

  it("handles multiple dots in filename", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("my.photo.final.png")).toBe("my.photo.final.png");
    expect(uniqueName("my.photo.final.png")).toBe("my.photo.final_1.png");
  });

  it("tracks all used names across multiple calls", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("a.jpg")).toBe("a.jpg");
    expect(uniqueName("a.jpg")).toBe("a_1.jpg");
    expect(uniqueName("a.jpg")).toBe("a_2.jpg");
    expect(uniqueName("b.jpg")).toBe("b.jpg");
  });

  it("compares filenames case-insensitively and normalizes Unicode to NFC", () => {
    const uniqueName = createUniqueNamer();
    expect(uniqueName("Report.PDF")).toBe("Report.PDF");
    expect(uniqueName("report.pdf")).toBe("report_1.pdf");
    const composed = `caf${String.fromCharCode(0xe9)}.png`;
    const decomposed = `cafe${String.fromCharCode(0x301)}.png`;
    expect(uniqueName(composed)).toBe(composed);
    expect(uniqueName(decomposed)).toBe(`cafe${String.fromCharCode(0x301)}_1.png`);
  });
});

// ── Tool registry integration ──────────────────────────────────────────

describe("pipeline tool registry lookup", () => {
  const testToolId = `pipeline-test-${Math.random().toString(36).slice(2, 8)}`;

  it("getToolConfig returns undefined for unregistered tool", () => {
    expect(getToolConfig("nonexistent-tool-xyz")).toBeUndefined();
  });

  it("registered tool is found via getToolConfig", () => {
    registerToolProcessFn({
      toolId: testToolId,
      settingsSchema: {
        safeParse: (d: unknown) => ({ success: true, data: d }),
        parse: (d: unknown) => d,
      } as never,
      process: async (buf: Buffer) => ({
        buffer: buf,
        filename: "out.png",
        contentType: "image/png",
      }),
    });

    const config = getToolConfig(testToolId);
    expect(config).toBeDefined();
    expect(config?.toolId).toBe(testToolId);
  });

  it("registered tool appears in getRegisteredToolIds", () => {
    expect(getRegisteredToolIds()).toContain(testToolId);
  });

  it("registered tool process function executes correctly", async () => {
    const config = getToolConfig(testToolId);
    const result = await config?.process(Buffer.from("test"), {}, "input.png");
    expect(result.buffer).toEqual(Buffer.from("test"));
    expect(result.filename).toBe("out.png");
    expect(result.contentType).toBe("image/png");
  });
});

// ── Pipeline step error wrapping ───────────────────────────────────────

async function invokePipelineExecuteRoute(
  parts: Array<
    | { type: "file"; filename: string; content: Buffer }
    | { type: "field"; fieldname: string; value: string }
  >,
  logOverride?: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> },
) {
  let handler: ((req: unknown, rep: unknown) => Promise<unknown>) | undefined;
  await registerPipelineRoutes({
    post: vi.fn((url: string, _opts: unknown, fn: typeof handler) => {
      if (url === "/api/v1/pipeline/execute") handler = fn;
    }),
    get: vi.fn(),
    delete: vi.fn(),
    log: { info: vi.fn() },
  } as never);

  const request = {
    headers: {},
    method: "POST",
    routeOptions: { url: "/api/v1/pipeline/execute" },
    log: logOverride ?? { error: vi.fn(), warn: vi.fn() },
    raw: {
      aborted: false,
      once: vi.fn(),
      removeListener: vi.fn(),
    },
    parts: async function* () {
      for (const p of parts) {
        if (p.type === "file") {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: p.filename,
            file: Readable.from([p.content]),
          };
        } else {
          yield p;
        }
      }
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

  if (!handler) {
    throw new Error("POST /api/v1/pipeline/execute handler was not registered");
  }
  await handler(request, reply);
  return reply;
}

async function invokePipelineBatchRoute(
  parts: Array<
    | { type: "file"; filename: string; content: Buffer }
    | { type: "field"; fieldname: string; value: string }
  >,
  log: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } = {
    error: vi.fn(),
    warn: vi.fn(),
  },
) {
  let handler: ((req: unknown, rep: unknown) => Promise<unknown>) | undefined;
  await registerPipelineRoutes({
    post: vi.fn((url: string, _opts: unknown, fn: typeof handler) => {
      if (url === "/api/v1/pipeline/batch") handler = fn;
    }),
    get: vi.fn(),
    delete: vi.fn(),
    log: { info: vi.fn() },
  } as never);

  const request = {
    headers: {},
    log,
    raw: {
      aborted: false,
      once: vi.fn(),
      removeListener: vi.fn(),
    },
    parts: async function* () {
      for (const p of parts) {
        if (p.type === "file") {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: p.filename,
            file: Readable.from([p.content]),
          };
        } else {
          yield p;
        }
      }
    },
  };
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    log: request.log,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };

  if (!handler) {
    throw new Error("POST /api/v1/pipeline/batch handler was not registered");
  }
  await handler(request, reply);
  return reply;
}

describe("pipeline step error message formatting", () => {
  const stepErrorTestToolId = `pipeline-step-err-${Math.random().toString(36).slice(2, 8)}`;
  const stepSettingsSchema = z.object({
    width: z.number().int().positive("Width must be positive").optional(),
    height: z.number().int().positive("Height must be positive").optional(),
  });

  registerToolProcessFn({
    toolId: stepErrorTestToolId,
    settingsSchema: stepSettingsSchema,
    process: async (buf: Buffer) => ({
      buffer: buf,
      filename: "out.png",
      contentType: "image/png",
    }),
  });
  registerToolProcessFn({
    toolId: "protect-pdf",
    settingsSchema: z.object({ userPassword: z.string() }),
    process: async () => {
      throw new Error("unused");
    },
  });
  registerToolProcessFn({
    toolId: "ocr-pdf",
    settingsSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d ?? {} }),
      parse: (d: unknown) => d ?? {},
    } as never,
    process: async () => {
      throw new Error("unused");
    },
  });
  registerToolProcessFn({
    toolId: "resize",
    settingsSchema: stepSettingsSchema,
    process: async (buf: Buffer) => ({
      buffer: buf,
      filename: "out.png",
      contentType: "image/png",
    }),
  });

  it("formats unknown-tool 400 errors with 1-based step number and tool ID (#3346)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [
            { toolId: stepErrorTestToolId, settings: { width: 100 } },
            { toolId: "unknown-step-tool", settings: {} },
          ],
        }),
      },
    ]);

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({
      error: "Step 2 (unknown-step-tool): Tool not found or not available",
    });
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(flowAddMock).not.toHaveBeenCalled();

    const aliasReply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [
            { toolId: stepErrorTestToolId, settings: { width: 100 } },
            { toolId: "resize", settings: { contentAware: true, width: 100 } },
          ],
        }),
      },
    ]);

    expect(aliasReply.statusCode).toBe(400);
    expect(aliasReply.payload).toEqual({
      error: "Step 2 (resize): Tool not found or not available",
    });
  });

  it("formats invalid-settings 400 errors with 1-based step number, tool ID, and issue details (#3346)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [
            { toolId: stepErrorTestToolId, settings: { width: 100 } },
            { toolId: stepErrorTestToolId, settings: { width: -10 } },
          ],
        }),
      },
    ]);

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({
      error: `Step 2 (${stepErrorTestToolId}): Invalid settings`,
      details: [{ path: "width", message: "Width must be positive" }],
    });
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(flowAddMock).not.toHaveBeenCalled();
  });

  it("formats permission, password-tool, OCR capability, missing-bundle, and pixel-limit step errors with 1-based step index (#3346)", async () => {
    vi.clearAllMocks();
    const prevMaxPixels = envMock.MAX_PIPELINE_STEP_PIXELS;

    try {
      vi.mocked(hasEffectiveToolAccess).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const forbiddenReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "protect-pdf", settings: { userPassword: "secret" } },
            ],
          }),
        },
      ]);
      expect(forbiddenReply.statusCode).toBe(403);
      expect(forbiddenReply.payload).toEqual({
        error: "Step 2 (protect-pdf): You don't have permission to use this tool",
      });

      const passwordToolReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "protect-pdf", settings: { userPassword: "secret" } },
            ],
          }),
        },
      ]);
      expect(passwordToolReply.statusCode).toBe(400);
      expect(passwordToolReply.payload).toEqual({
        error:
          "Step 2 (protect-pdf): This tool cannot be used in pipelines because it requires a password",
      });

      const ocrIncompatibleReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "ocr-pdf", settings: { quality: "fast", language: "ko" } },
            ],
          }),
        },
      ]);
      expect(ocrIncompatibleReply.statusCode).toBe(501);
      expect(ocrIncompatibleReply.payload).toEqual({
        error: 'Step 2 (ocr-pdf): Feature "OCR" is incompatible',
        code: "FEATURE_INCOMPATIBLE",
        feature: "ocr",
        featureName: "OCR",
        requestedQuality: "fast",
        compatibilityReason: "fast-korean-unsupported",
        guidance: expect.any(String),
      });

      vi.mocked(getFirstMissingBundleForTool)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce("background-removal" as never);
      const missingBundleReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: stepErrorTestToolId, settings: {} },
            ],
          }),
        },
      ]);
      expect(missingBundleReply.statusCode).toBe(501);
      expect(missingBundleReply.payload).toEqual({
        error: `Step 2 (${stepErrorTestToolId}): Feature "Background Removal" is not installed`,
        code: "FEATURE_NOT_INSTALLED",
        feature: "background-removal",
        featureName: "Background Removal",
      });

      envMock.MAX_PIPELINE_STEP_PIXELS = 10_000;
      const pixelLimitReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: { width: 50, height: 50 } },
              { toolId: stepErrorTestToolId, settings: { width: 200, height: 100 } },
            ],
          }),
        },
      ]);
      expect(pixelLimitReply.statusCode).toBe(400);
      expect(pixelLimitReply.payload).toEqual({
        error: `Step 2 (${stepErrorTestToolId}): Output dimensions 200x100 exceed per-step pixel limit`,
      });
    } finally {
      vi.mocked(hasEffectiveToolAccess).mockReset().mockResolvedValue(true);
      vi.mocked(getFirstMissingBundleForTool).mockReset().mockReturnValue(null);
      envMock.MAX_PIPELINE_STEP_PIXELS = prevMaxPixels;
    }
  });

  it("forwards the worker finalize step failure message, canceled marker, or 5xx fault status (#3346)", async () => {
    vi.clearAllMocks();
    const parts = [
      { type: "file" as const, filename: "photo.png", content: Buffer.from("png-bytes") },
      {
        type: "field" as const,
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [
            { toolId: stepErrorTestToolId, settings: { width: 100 } },
            { toolId: stepErrorTestToolId, settings: { width: 80 } },
            { toolId: stepErrorTestToolId, settings: { width: 60 } },
          ],
        }),
      },
    ];

    try {
      waitForJobMock.mockResolvedValueOnce({
        outputRefs: [],
        filename: "photo.png",
        contentType: "",
        originalSize: 9,
        processedSize: 0,
        resultPayload: {
          error: "Step 3: Invalid dimensions",
          stepsCompleted: 2,
          steps: [
            { step: 1, toolId: stepErrorTestToolId, size: 9 },
            { step: 2, toolId: stepErrorTestToolId, size: 9 },
          ],
        },
      });

      const reply = await invokePipelineExecuteRoute(parts);
      expect(reply.statusCode).toBe(422);
      expect(reply.payload).toEqual({
        error: "Step 3: Invalid dimensions",
        completedSteps: [
          { step: 1, toolId: stepErrorTestToolId, size: 9 },
          { step: 2, toolId: stepErrorTestToolId, size: 9 },
        ],
      });

      waitForJobMock.mockResolvedValueOnce({
        outputRefs: [],
        filename: "photo.png",
        contentType: "",
        originalSize: 9,
        processedSize: 0,
        resultPayload: {
          error: "Canceled",
          canceled: true,
          stepsCompleted: 1,
          steps: [{ step: 1, toolId: stepErrorTestToolId, size: 9 }],
        },
      });

      const canceledReply = await invokePipelineExecuteRoute(parts);
      expect(canceledReply.statusCode).toBe(422);
      expect(canceledReply.payload).toEqual({
        error: "Canceled",
        canceled: true,
        completedSteps: [{ step: 1, toolId: stepErrorTestToolId, size: 9 }],
      });

      waitForJobMock.mockResolvedValueOnce({
        outputRefs: [],
        filename: "photo.png",
        contentType: "",
        originalSize: 9,
        processedSize: 0,
        resultPayload: {
          error: "Step 2: PDF engine is not available",
          httpStatus: 503,
          code: "ENGINE_UNAVAILABLE",
          details: "qpdf is not installed",
          stepsCompleted: 1,
          steps: [{ step: 1, toolId: stepErrorTestToolId, size: 9 }],
        },
      });
      const log = { error: vi.fn(), warn: vi.fn() };
      const serverFaultReply = await invokePipelineExecuteRoute(parts, log);
      expect(serverFaultReply.statusCode).toBe(503);
      expect(serverFaultReply.payload).toEqual({
        error: "Step 2: PDF engine is not available",
        code: "ENGINE_UNAVAILABLE",
        details: "qpdf is not installed",
        completedSteps: [{ step: 1, toolId: stepErrorTestToolId, size: 9 }],
      });
      expect(log.error).toHaveBeenCalledWith(
        { toolId: "pipeline", jobId: expect.any(String), code: "ENGINE_UNAVAILABLE" },
        "pipeline step failed on a server fault",
      );

      // When waitForJob rejects after processPipelineFinalize settled schema.jobs.error
      // with a 503 storage fault, answer 503 with the settled message and code (#3479).
      const reconstructedBullErr = new Error("The server's storage service is unavailable.");
      waitForJobMock.mockRejectedValueOnce(reconstructedBullErr);
      selectWhereMock.mockResolvedValueOnce([
        {
          error: {
            message: "The server's storage service is unavailable.",
            code: "storage-unavailable",
            httpStatus: 503,
          },
        },
      ]);
      const finalizeFaultLog = { error: vi.fn(), warn: vi.fn() };
      const finalizeFaultReply = await invokePipelineExecuteRoute(parts, finalizeFaultLog);
      expect(finalizeFaultReply.statusCode).toBe(503);
      expect(finalizeFaultReply.payload).toEqual({
        error: "The server's storage service is unavailable.",
        code: "storage-unavailable",
      });
      expect(finalizeFaultLog.error).toHaveBeenCalledWith(
        {
          err: reconstructedBullErr,
          toolId: "pipeline",
          jobId: expect.any(String),
          code: "storage-unavailable",
        },
        "pipeline finalize failed on a server fault",
      );

      // When the settled 5xx row has details and no code, include details and omit code (#3479).
      waitForJobMock.mockRejectedValueOnce(reconstructedBullErr);
      selectWhereMock.mockResolvedValueOnce([
        {
          error: {
            message: "Workspace storage limit reached",
            details: "Send fewer files at a time",
            httpStatus: 503,
          },
        },
      ]);
      const detailsFaultReply = await invokePipelineExecuteRoute(parts);
      expect(detailsFaultReply.statusCode).toBe(503);
      expect(detailsFaultReply.payload).toEqual({
        error: "Workspace storage limit reached",
        details: "Send fewer files at a time",
      });

      // When the settled row has no httpStatus (or a non-5xx httpStatus), rethrow the waitForJob rejection (#3479, #3791).
      const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
      const genericFinalizeErr = new Error("Pipeline processing failed");
      waitForJobMock.mockRejectedValueOnce(genericFinalizeErr);
      selectWhereMock.mockResolvedValueOnce([
        {
          error: {
            message: "Pipeline processing failed",
          },
        },
      ]);
      const nonServerFaultLog = { error: vi.fn(), warn: vi.fn() };
      await expect(invokePipelineExecuteRoute(parts, nonServerFaultLog)).rejects.toBe(
        genericFinalizeErr,
      );
      expect(classifyError(genericFinalizeErr, "http")).toBe("expected");
      expect(nonServerFaultLog.error).not.toHaveBeenCalled();

      // And on /api/v1/pipeline/batch when settledFailureResponse returns null (#3791, #3697).
      const batchUnsettledErr = new Error("The server's storage service is unavailable.");
      waitForJobMock.mockRejectedValueOnce(batchUnsettledErr);
      selectWhereMock.mockResolvedValueOnce([{ error: null }]);
      await expect(invokePipelineBatchRoute(parts)).rejects.toBe(batchUnsettledErr);
      expect(classifyError(batchUnsettledErr, "http")).toBe("expected");

      const batchRedisResetErr = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        syscall: "read",
      });
      waitForJobMock.mockRejectedValueOnce(batchRedisResetErr);
      selectWhereMock.mockResolvedValueOnce([{ error: null }]);
      await expect(invokePipelineBatchRoute(parts)).rejects.toBe(batchRedisResetErr);
      expect(classifyError(batchRedisResetErr, "http")).toBe("operational");

      // When reading schema.jobs.error rejects, warn, report via reportError, and rethrow the waitForJob rejection (#3479, #3792, #3697, #3807).
      const redisDownErr = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        syscall: "read",
      });
      const dbReadErr = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        syscall: "read",
      });
      reportErrorMock.mockClear();
      waitForJobMock.mockRejectedValueOnce(redisDownErr);
      selectWhereMock.mockRejectedValueOnce(dbReadErr);
      const readFailLog = { error: vi.fn(), warn: vi.fn() };
      await expect(invokePipelineExecuteRoute(parts, readFailLog)).rejects.toBe(redisDownErr);
      expect(classifyError(redisDownErr, "http")).toBe("operational");
      expect(classifyError(dbReadErr, "http")).toBe("operational");
      expect(readFailLog.warn).toHaveBeenCalledWith(
        { err: dbReadErr, jobId: expect.any(String) },
        "failed pipeline job row read failed",
      );
      expect(reportErrorMock).toHaveBeenCalledWith(dbReadErr, {
        source: "http",
        route: "/api/v1/pipeline/execute",
        method: "POST",
        jobId: expect.any(String),
      });

      // getFlowProducer().add bare ECONNRESET rejections on /execute and /batch are tagged with markUpstreamError (#3807)
      const executeFlowResetErr = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        syscall: "read",
      });
      flowAddMock.mockRejectedValueOnce(executeFlowResetErr);
      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(executeFlowResetErr);
      expect(classifyError(executeFlowResetErr, "http")).toBe("operational");

      const batchFlowResetErr = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        syscall: "read",
      });
      flowAddMock.mockRejectedValueOnce(batchFlowResetErr);
      await expect(invokePipelineBatchRoute(parts)).rejects.toBe(batchFlowResetErr);
      expect(classifyError(batchFlowResetErr, "http")).toBe("operational");
    } finally {
      selectWhereMock.mockReset().mockResolvedValue([]);
      waitForJobMock.mockReset();
      waitForJobMock.mockResolvedValue(null);
    }
  });

  it("formats step validation errors on /api/v1/pipeline/batch and /api/v1/pipeline/save (#3346)", async () => {
    vi.clearAllMocks();
    const prevMaxPixels = envMock.MAX_PIPELINE_STEP_PIXELS;

    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    await registerPipelineRoutes(app);
    await app.ready();

    try {
      const batchUnknownReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "unknown-batch-tool", settings: {} },
            ],
          }),
        },
      ]);
      expect(batchUnknownReply.statusCode).toBe(400);
      expect(batchUnknownReply.payload).toEqual({
        error: "Step 2 (unknown-batch-tool): Tool not found or not available",
      });

      vi.mocked(hasEffectiveToolAccess).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const batchForbiddenReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "protect-pdf", settings: { userPassword: "secret" } },
            ],
          }),
        },
      ]);
      expect(batchForbiddenReply.statusCode).toBe(403);
      expect(batchForbiddenReply.payload).toEqual({
        error: "Step 2 (protect-pdf): You don't have permission to use this tool",
      });

      const batchPasswordReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: {} },
              { toolId: "protect-pdf", settings: { userPassword: "secret" } },
            ],
          }),
        },
      ]);
      expect(batchPasswordReply.statusCode).toBe(400);
      expect(batchPasswordReply.payload).toEqual({
        error:
          "Step 2 (protect-pdf): This tool cannot be used in pipelines because it requires a password",
      });

      const batchInvalidSettingsReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [
              { toolId: stepErrorTestToolId, settings: { width: 100 } },
              { toolId: stepErrorTestToolId, settings: { width: -5 } },
            ],
          }),
        },
      ]);
      expect(batchInvalidSettingsReply.statusCode).toBe(400);
      expect(batchInvalidSettingsReply.payload).toEqual({
        error: `Step 2 (${stepErrorTestToolId}): Invalid settings`,
        details: [{ path: "width", message: "Width must be positive" }],
      });

      const saveUnknownRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Unknown Step Pipeline",
          steps: [
            { toolId: stepErrorTestToolId, settings: {} },
            { toolId: "unknown-save-tool", settings: {} },
          ],
        },
      });
      expect(saveUnknownRes.statusCode).toBe(400);
      expect(saveUnknownRes.json()).toEqual({
        error: "Step 2 (unknown-save-tool): Tool not found or not available",
      });

      vi.mocked(hasEffectiveToolAccess).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const saveForbiddenRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Forbidden Step Pipeline",
          steps: [
            { toolId: stepErrorTestToolId, settings: {} },
            { toolId: stepErrorTestToolId, settings: {} },
          ],
        },
      });
      expect(saveForbiddenRes.statusCode).toBe(403);
      expect(saveForbiddenRes.json()).toEqual({
        error: `Step 2 (${stepErrorTestToolId}): You don't have permission to use this tool`,
      });

      vi.mocked(hasEffectiveToolAccess).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const saveForbiddenPasswordRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Forbidden Password Step Pipeline",
          steps: [
            { toolId: stepErrorTestToolId, settings: {} },
            { toolId: "protect-pdf", settings: { userPassword: "secret" } },
          ],
        },
      });
      expect(saveForbiddenPasswordRes.statusCode).toBe(403);
      expect(saveForbiddenPasswordRes.json()).toEqual({
        error: "Step 2 (protect-pdf): You don't have permission to use this tool",
      });

      const savePasswordRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Password Step Pipeline",
          steps: [
            { toolId: stepErrorTestToolId, settings: {} },
            { toolId: "protect-pdf", settings: { userPassword: "secret" } },
          ],
        },
      });
      expect(savePasswordRes.statusCode).toBe(400);
      expect(savePasswordRes.json()).toEqual({
        error:
          "Step 2 (protect-pdf): This tool cannot be used in pipelines because it requires a password",
      });
    } finally {
      await app.close();
      vi.mocked(hasEffectiveToolAccess).mockReset().mockResolvedValue(true);
      envMock.MAX_PIPELINE_STEP_PIXELS = prevMaxPixels;
    }
  });

  it("resolves resize with contentAware to content-aware-resize in /api/v1/pipeline/save and /api/v1/pipeline/batch (#3347)", async () => {
    vi.clearAllMocks();

    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    await registerPipelineRoutes(app);
    await app.ready();

    try {
      const batchUnregisteredContentAwareReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
          }),
        },
      ]);
      expect(batchUnregisteredContentAwareReply.statusCode).toBe(400);
      expect(batchUnregisteredContentAwareReply.payload).toEqual({
        error: "Step 1 (resize): Tool not found or not available",
      });

      const saveUnregisteredContentAwareRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Seam Carve Unregistered",
          steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
        },
      });
      expect(saveUnregisteredContentAwareRes.statusCode).toBe(400);
      expect(saveUnregisteredContentAwareRes.json()).toEqual({
        error: "Step 1 (resize): Tool not found or not available",
      });
      expect(insertValuesMock).not.toHaveBeenCalled();

      const resizeConfig = getToolConfig("resize");
      getToolConfigSpy.mockImplementation((toolId: string) =>
        toolId === "content-aware-resize" || toolId === "resize" ? resizeConfig : undefined,
      );

      vi.mocked(hasEffectiveToolAccess).mockImplementation(
        async (_user, toolId) => toolId !== "content-aware-resize",
      );

      const batchForbiddenContentAwareReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
          }),
        },
      ]);
      expect(batchForbiddenContentAwareReply.statusCode).toBe(403);
      expect(batchForbiddenContentAwareReply.payload).toEqual({
        error: "Step 1 (resize): You don't have permission to use this tool",
      });

      insertValuesMock.mockClear();
      const saveForbiddenContentAwareRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Seam Carve Forbidden",
          steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
        },
      });
      expect(saveForbiddenContentAwareRes.statusCode).toBe(403);
      expect(saveForbiddenContentAwareRes.json()).toEqual({
        error: "Step 1 (resize): You don't have permission to use this tool",
      });
      expect(hasEffectiveToolAccess).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "user-1" }),
        "content-aware-resize",
      );
      expect(insertValuesMock).not.toHaveBeenCalled();

      const saveAllowedPlainResizeRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Plain Resize Allowed",
          steps: [{ toolId: "resize", settings: { contentAware: false, width: 200 } }],
        },
      });
      expect(saveAllowedPlainResizeRes.statusCode).toBe(201);
      expect(hasEffectiveToolAccess).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "user-1" }),
        "resize",
      );

      vi.mocked(hasEffectiveToolAccess).mockImplementation(
        async (_user, toolId) => toolId === "content-aware-resize",
      );
      const saveAllowedContentAwareRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "Seam Carve Allowed",
          steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
        },
      });
      expect(saveAllowedContentAwareRes.statusCode).toBe(201);
      expect(hasEffectiveToolAccess).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "user-1" }),
        "content-aware-resize",
      );

      insertValuesMock.mockClear();
      const batchAllowedContentAwareReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
          }),
        },
        { type: "field", fieldname: "clientJobId", value: "pipeline-batch-3347" },
      ]);
      expect(batchAllowedContentAwareReply.statusCode).toBe(202);
      const stepInsert = insertValuesMock.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .find((row) => row?.type === "pipeline-step");
      expect(stepInsert).toEqual(
        expect.objectContaining({
          id: "pipeline-batch-3347-f0-s0",
          toolId: "content-aware-resize",
          type: "pipeline-step",
        }),
      );

      reportErrorMock.mockClear();
      const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
      vi.mocked(validateImageBuffer).mockResolvedValueOnce({
        valid: true,
        format: "heif",
        width: 10,
        height: 10,
      });
      vi.mocked(decodeHeic).mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: open temp file"), {
          code: "ENOSPC",
          syscall: "open",
        }),
      );
      const batchHeicFaultReply = await invokePipelineBatchRoute([
        { type: "file", filename: "photo.heic", content: Buffer.from("heic-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "resize", settings: { contentAware: true, width: 200 } }],
          }),
        },
      ]);
      expect(batchHeicFaultReply.statusCode).toBe(503);
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          source: "http",
          toolId: "content-aware-resize",
          statusCode: 503,
        }),
      );
    } finally {
      await app.close();
      getToolConfigSpy.mockReset();
      vi.mocked(hasEffectiveToolAccess).mockReset().mockResolvedValue(true);
    }
  });
});

// ── POST /api/v1/pipeline/save database failure (#1988) ────────────────

describe("POST /api/v1/pipeline/save database error handling (#1988)", () => {
  it("lets a database insert failure reach registerErrorHandler (500 + logged) instead of returning 409", async () => {
    const saveTestToolId = `pipeline-save-test-${Math.random().toString(36).slice(2, 8)}`;
    registerToolProcessFn({
      toolId: saveTestToolId,
      settingsSchema: {
        safeParse: (d: unknown) => ({ success: true, data: d }),
        parse: (d: unknown) => d,
      } as never,
      process: async (buf: Buffer) => ({
        buffer: buf,
        filename: "out.png",
        contentType: "image/png",
      }),
    });

    const dbErr = new Error("connection terminated unexpectedly");
    insertValuesMock.mockRejectedValueOnce(dbErr);
    reportErrorMock.mockReset();

    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    await registerPipelineRoutes(app);

    const errorLogs: Array<{ bindings: unknown; msg: unknown }> = [];
    app.addHook("onRequest", async (request: FastifyRequest) => {
      vi.spyOn(request.log, "error").mockImplementation(((bindings: unknown, msg?: unknown) => {
        errorLogs.push({ bindings, msg });
      }) as typeof request.log.error);
    });

    await app.ready();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { "content-type": "application/json" },
        payload: {
          name: "My Saved Pipeline",
          steps: [{ toolId: saveTestToolId, settings: {} }],
        },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0]?.bindings).toMatchObject({
        err: dbErr,
        url: "/api/v1/pipeline/save",
        method: "POST",
      });
      expect(errorLogs[0]?.msg).toBe("Unhandled request error");
      expect(reportErrorMock).toHaveBeenCalledWith(
        dbErr,
        expect.objectContaining({
          source: "http",
          route: "/api/v1/pipeline/save",
          method: "POST",
          statusCode: 500,
        }),
      );
    } finally {
      await app.close();
    }
  });
});

// ── POST /api/v1/pipeline/batch ingress (#2684, #2685) ─────────────────

describe("POST /api/v1/pipeline/batch ingress (#2684, #2685, #2879)", () => {
  const batchTestToolId = `pipeline-batch-test-${Math.random().toString(36).slice(2, 8)}`;
  registerToolProcessFn({
    toolId: batchTestToolId,
    settingsSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d ?? {} }),
      parse: (d: unknown) => d ?? {},
    } as never,
    process: async (buf: Buffer) => ({
      buffer: buf,
      filename: "out.png",
      contentType: "image/png",
    }),
  });

  it("removes empty spooled files without calling readFile and preserves slot alignment (#2684)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineBatchRoute([
      { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
      { type: "file", filename: "real.png", content: Buffer.from("real-png") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
      },
      { type: "field", fieldname: "clientJobId", value: "pipeline-batch-empty-slot" },
    ]);

    expect(reply.statusCode).toBe(202);
    expect(spoolMultipartFileSpy).toHaveBeenCalledTimes(2);
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(String(readFileSpy.mock.calls[0]?.[0])).toMatch(/\/1-real\.png$/);
    expect(
      rmSpy.mock.calls.some((call: unknown[]) => String(call[0]).endsWith("/0-empty.png")),
    ).toBe(true);
    expect(recordChildOutcomeMock).toHaveBeenCalledWith(
      "pipeline-batch-empty-slot",
      2,
      "empty.png",
      "File is empty",
    );
    expect(updateSetMock).toHaveBeenCalledWith({
      settings: {
        flowChildCount: 1,
        fileIndexMap: [1],
        stepCount: 1,
      },
    });
    expect(flowAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalFiles: 2,
          settings: expect.objectContaining({
            flowChildCount: 1,
            fileIndexMap: [1],
            preFailureFaults: [{ filename: "empty.png", error: "File is empty" }],
          }),
        }),
      }),
    );
  });

  it("answers 422 when every uploaded file in a pipeline batch is empty (#2684)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineBatchRoute([
      { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
      },
      { type: "field", fieldname: "clientJobId", value: "pipeline-batch-all-empty" },
    ]);

    expect(reply.statusCode).toBe(422);
    expect(reply.payload).toEqual({
      error: "All files failed processing",
      errors: [{ filename: "empty.png", error: "File is empty" }],
    });
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(
      rmSpy.mock.calls.some((call: unknown[]) => String(call[0]).endsWith("/0-empty.png")),
    ).toBe(true);
    expect(flowAddMock).not.toHaveBeenCalled();
    expect(failBatchJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "pipeline-batch-all-empty",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 1,
        message: "All files failed processing",
        errors: [{ filename: "empty.png", error: "File is empty" }],
      }),
    );
  });

  it("logs a warning when failBatchJob matches no live row on all-prefail or mid-batch fault (#1555)", async () => {
    vi.clearAllMocks();
    failBatchJobMock.mockResolvedValue(false);

    try {
      const unappliedReply = await invokePipelineBatchRoute([
        { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
        },
        { type: "field", fieldname: "clientJobId", value: "pipeline-batch-unapplied" },
      ]);
      expect(unappliedReply.statusCode).toBe(422);
      expect(unappliedReply.log.warn).toHaveBeenCalledWith(
        { jobId: "pipeline-batch-unapplied" },
        expect.stringContaining("no terminal frame announced"),
      );

      putObjectMock.mockRejectedValueOnce(new Error("storage unavailable"));

      const faultLog = { error: vi.fn(), warn: vi.fn() };
      await expect(
        invokePipelineBatchRoute(
          [
            { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
            },
            { type: "field", fieldname: "clientJobId", value: "pipeline-batch-unapplied-fault" },
          ],
          faultLog,
        ),
      ).rejects.toThrow("storage unavailable");
      expect(faultLog.warn).toHaveBeenCalledWith(
        { jobId: "pipeline-batch-unapplied-fault" },
        expect.stringContaining("no terminal frame announced"),
      );
    } finally {
      putObjectMock.mockReset();
      putObjectMock.mockResolvedValue(undefined);
      failBatchJobMock.mockResolvedValue(true);
    }
  });

  it.each(["field-first", "file-first"] as const)(
    "answers 413 with the OCR aggregate safety limit message when spooled parts cross the 512 MB aggregate cap (%s) (#2685)",
    async (ordering) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      const prevMaxUpload = envMock.MAX_UPLOAD_SIZE_MB;
      envMock.MAX_UPLOAD_SIZE_MB = 0;

      try {
        const mib = 1024 * 1024;
        spoolMultipartFileSpy
          .mockResolvedValueOnce({
            path: "/tmp/scratch/0-first.png",
            filename: "first.png",
            size: 300 * mib,
          })
          .mockImplementationOnce(async (_part, _scratchDir, _index, opts) => {
            throw Object.assign(
              new Error(`Object exceeds the maximum allowed size (${opts?.maxBytes} bytes)`),
              {
                statusCode: 413,
                limitBytes: opts?.maxBytes,
              },
            );
          });

        const pipelinePart = {
          type: "field" as const,
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
          }),
        };
        const fileParts = [
          { type: "file" as const, filename: "first.png", content: Buffer.from("a") },
          { type: "file" as const, filename: "second.png", content: Buffer.from("b") },
        ];
        const parts =
          ordering === "field-first" ? [pipelinePart, ...fileParts] : [...fileParts, pipelinePart];

        const reply = await invokePipelineBatchRoute(parts);

        expect(reply.statusCode).toBe(413);
        expect(reply.payload).toEqual({
          error: "OCR pipeline input exceeds the 512 MB aggregate safety limit",
        });
        expect(spoolMultipartFileSpy.mock.calls[0]?.[3]?.maxBytes).toBe(512 * mib);
        expect(spoolMultipartFileSpy.mock.calls[1]?.[3]?.maxBytes).toBe(212 * mib);
        expect(readFileSpy).not.toHaveBeenCalled();
      } finally {
        spoolMultipartFileSpy.mockReset();
        envMock.MAX_UPLOAD_SIZE_MB = prevMaxUpload;
      }
    },
  );

  it("narrows partMaxBytes from configured fileMaxBytes to remainingAggregate when 0 < MAX_UPLOAD_SIZE_MB < 512 (#2685)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    const prevMaxUpload = envMock.MAX_UPLOAD_SIZE_MB;
    envMock.MAX_UPLOAD_SIZE_MB = 200;

    try {
      const mib = 1024 * 1024;
      spoolMultipartFileSpy
        .mockResolvedValueOnce({
          path: "/tmp/scratch/0-first.png",
          filename: "first.png",
          size: 200 * mib,
        })
        .mockResolvedValueOnce({
          path: "/tmp/scratch/1-second.png",
          filename: "second.png",
          size: 200 * mib,
        })
        .mockImplementationOnce(async (_part, _scratchDir, _index, opts) => {
          throw Object.assign(
            new Error(`Object exceeds the maximum allowed size (${opts?.maxBytes} bytes)`),
            {
              statusCode: 413,
              limitBytes: opts?.maxBytes,
            },
          );
        });

      const reply = await invokePipelineBatchRoute([
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
          }),
        },
        { type: "file", filename: "first.png", content: Buffer.from("a") },
        { type: "file", filename: "second.png", content: Buffer.from("b") },
        { type: "file", filename: "third.png", content: Buffer.from("c") },
      ]);

      expect(reply.statusCode).toBe(413);
      expect(reply.payload).toEqual({
        error: "OCR pipeline input exceeds the 512 MB aggregate safety limit",
      });
      expect(spoolMultipartFileSpy.mock.calls[0]?.[3]?.maxBytes).toBe(200 * mib);
      expect(spoolMultipartFileSpy.mock.calls[1]?.[3]?.maxBytes).toBe(200 * mib);
      expect(spoolMultipartFileSpy.mock.calls[2]?.[3]?.maxBytes).toBe(112 * mib);
      expect(readFileSpy).not.toHaveBeenCalled();
    } finally {
      spoolMultipartFileSpy.mockReset();
      envMock.MAX_UPLOAD_SIZE_MB = prevMaxUpload;
    }
  });

  it("does not apply the OCR aggregate cap to field-first non-OCR pipelines when MAX_UPLOAD_SIZE_MB is 0 (#2685)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    const prevMaxUpload = envMock.MAX_UPLOAD_SIZE_MB;
    envMock.MAX_UPLOAD_SIZE_MB = 0;

    try {
      const mib = 1024 * 1024;
      spoolMultipartFileSpy
        .mockResolvedValueOnce({
          path: "/tmp/scratch/0-first.png",
          filename: "first.png",
          size: 300 * mib,
        })
        .mockResolvedValueOnce({
          path: "/tmp/scratch/1-second.png",
          filename: "second.png",
          size: 300 * mib,
        });

      await invokePipelineBatchRoute([
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: batchTestToolId, settings: {} }],
          }),
        },
        { type: "file", filename: "first.png", content: Buffer.from("a") },
        { type: "file", filename: "second.png", content: Buffer.from("b") },
      ]).catch(() => {});

      expect(spoolMultipartFileSpy).toHaveBeenCalledTimes(2);
      expect(spoolMultipartFileSpy.mock.calls[0]?.[3]?.maxBytes).toBeUndefined();
      expect(spoolMultipartFileSpy.mock.calls[1]?.[3]?.maxBytes).toBeUndefined();
    } finally {
      spoolMultipartFileSpy.mockReset();
      envMock.MAX_UPLOAD_SIZE_MB = prevMaxUpload;
    }
  });

  it("answers 413 with the per-file upload limit when a single file exceeds fileMaxBytes (#2685)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();

    try {
      spoolMultipartFileSpy.mockImplementation(async (_part, _scratchDir, _index, opts) => {
        throw Object.assign(
          new Error(`Object exceeds the maximum allowed size (${opts?.maxBytes} bytes)`),
          {
            statusCode: 413,
            limitBytes: opts?.maxBytes,
          },
        );
      });

      const ocrReply = await invokePipelineBatchRoute([
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
          }),
        },
        { type: "file", filename: "huge.png", content: Buffer.from("a") },
      ]);
      expect(ocrReply.statusCode).toBe(413);
      expect(ocrReply.payload).toEqual({
        error: "File exceeds the 100 MB upload limit",
      });
      expect(spoolMultipartFileSpy.mock.calls[0]?.[3]?.maxBytes).toBe(100 * 1024 * 1024);

      const resizeReply = await invokePipelineBatchRoute([
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: batchTestToolId, settings: {} }],
          }),
        },
        { type: "file", filename: "huge.png", content: Buffer.from("a") },
      ]);
      expect(resizeReply.statusCode).toBe(413);
      expect(resizeReply.payload).toEqual({
        error: "File exceeds the 100 MB upload limit",
      });
      expect(spoolMultipartFileSpy.mock.calls[1]?.[3]?.maxBytes).toBe(100 * 1024 * 1024);
    } finally {
      spoolMultipartFileSpy.mockReset();
    }
  });

  it("answers 413 with the OCR aggregate safety limit message when totalStagedBytes exceeds aggregateBytes (#2685)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    const prevMaxUpload = envMock.MAX_UPLOAD_SIZE_MB;
    envMock.MAX_UPLOAD_SIZE_MB = 0;

    try {
      const mib = 1024 * 1024;
      spoolMultipartFileSpy
        .mockResolvedValueOnce({
          path: "/tmp/scratch/0-first.png",
          filename: "first.png",
          size: 300 * mib,
        })
        .mockResolvedValueOnce({
          path: "/tmp/scratch/1-second.png",
          filename: "second.png",
          size: 300 * mib,
        });

      const reply = await invokePipelineBatchRoute([
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
          }),
        },
        { type: "file", filename: "first.png", content: Buffer.from("a") },
        { type: "file", filename: "second.png", content: Buffer.from("b") },
        { type: "file", filename: "third.png", content: Buffer.from("c") },
      ]);

      expect(reply.statusCode).toBe(413);
      expect(reply.payload).toEqual({
        error: "OCR pipeline input exceeds the 512 MB aggregate safety limit",
      });
      expect(spoolMultipartFileSpy).toHaveBeenCalledTimes(2);
      expect(readFileSpy).not.toHaveBeenCalled();
    } finally {
      spoolMultipartFileSpy.mockReset();
      envMock.MAX_UPLOAD_SIZE_MB = prevMaxUpload;
    }
  });

  it.each([
    [
      "503 storage fault",
      Object.assign(new Error("The server's storage is full."), {
        statusCode: 503,
        code: "storage-full",
      }),
    ],
    ["500 server fault", Object.assign(new Error("storage exploded"), { statusCode: 500 })],
  ])(
    "rethrows a %s from spoolMultipartFile on /api/v1/pipeline/batch instead of answering locally (#1642)",
    async (_label, fault) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      spoolMultipartFileSpy.mockRejectedValueOnce(fault);
      try {
        await expect(
          invokePipelineBatchRoute([
            { type: "file", filename: "first.png", content: Buffer.from("a") },
          ]),
        ).rejects.toBe(fault);
      } finally {
        spoolMultipartFileSpy.mockReset();
      }
    },
  );

  it.each([
    [
      "Error instance",
      Object.assign(new Error("Unexpected end of form at /tmp/snapotter-scratch/secret/0-a.png"), {
        statusCode: 400,
      }),
    ],
    ["non-Error value", "Unexpected end of form at /tmp/snapotter-scratch/secret/0-a.png"],
  ])(
    "strips internal paths from details on a 400 multipart parse failure (%s) in /api/v1/pipeline/batch (#1642)",
    async (_label, thrown) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      spoolMultipartFileSpy.mockRejectedValueOnce(thrown);
      try {
        const reply = await invokePipelineBatchRoute([
          { type: "file", filename: "first.png", content: Buffer.from("a") },
        ]);
        expect(reply.statusCode).toBe(400);
        expect(reply.payload).toEqual({
          error: "Failed to parse multipart request",
          details: "Unexpected end of form at [internal]",
        });
      } finally {
        spoolMultipartFileSpy.mockReset();
      }
    },
  );

  it("decompresses .svgz, sanitizes SVG, and records preFailures on /api/v1/pipeline/batch (#3083)", async () => {
    vi.clearAllMocks();
    vi.mocked(validateImageBuffer).mockImplementation(async (_buf: Buffer, name?: string) => ({
      valid: true,
      format: name?.endsWith(".png") ? "png" : "svg",
      width: 100,
      height: 100,
    }));

    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><rect width="100" height="100" fill="red"/></svg>',
      "utf-8",
    );
    const svgz = gzipSync(rawSvg);
    const notSvgSvgz = gzipSync(Buffer.from("not an svg document", "utf-8"));
    const overElementSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
      "utf-8",
    );

    try {
      const reply = await invokePipelineBatchRoute([
        { type: "file", filename: "icon.svgz", content: svgz },
        { type: "file", filename: "bad.svgz", content: notSvgSvgz },
        { type: "file", filename: "too-many.svg", content: overElementSvg },
        { type: "file", filename: "good.png", content: Buffer.from("good-png") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: batchTestToolId, settings: {} }],
          }),
        },
        { type: "field", fieldname: "clientJobId", value: "pipeline-batch-svg" },
      ]);

      expect(reply.statusCode).toBe(202);
      expect(putObjectMock).toHaveBeenCalledTimes(2);
      const firstCall = putObjectMock.mock.calls[0] as unknown[] | undefined;
      const secondCall = putObjectMock.mock.calls[1] as unknown[] | undefined;
      const firstStored = (firstCall ? (firstCall[1] as Buffer) : Buffer.alloc(0)).toString(
        "utf-8",
      );
      expect(firstStored).toContain("<svg");
      expect(firstStored).not.toContain("<script");
      expect(secondCall ? String(secondCall[0]) : "").toMatch(
        /^uploads\/pipeline-batch-svg-f1-s0\/good\.png$/,
      );
      expect(recordChildOutcomeMock).toHaveBeenCalledWith(
        "pipeline-batch-svg",
        4,
        "bad.svgz",
        "SVGZ file does not contain valid SVG content after decompression",
      );
      expect(recordChildOutcomeMock).toHaveBeenCalledWith(
        "pipeline-batch-svg",
        4,
        "too-many.svg",
        "SVG exceeds maximum element count of 5000",
      );
      expect(flowAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalFiles: 4,
            settings: expect.objectContaining({
              flowChildCount: 2,
              fileIndexMap: [0, 3],
              preFailureFaults: [
                {
                  filename: "bad.svgz",
                  error: "SVGZ file does not contain valid SVG content after decompression",
                },
                {
                  filename: "too-many.svg",
                  error: "SVG exceeds maximum element count of 5000",
                },
              ],
            }),
          }),
        }),
      );
      expect(autoOrient).toHaveBeenCalledTimes(1);
    } finally {
      vi.mocked(validateImageBuffer).mockResolvedValue({
        valid: true,
        format: "png",
        width: 100,
        height: 100,
      });
    }
  });

  it("rethrows unexpected faults from decompressSvgz or sanitizeSvg and settles failBatchJob on /api/v1/pipeline/batch (#3580)", async () => {
    vi.clearAllMocks();
    const svgSanitize = await import("../../../apps/api/src/lib/svg-sanitize.js");
    vi.mocked(validateImageBuffer).mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });

    try {
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      vi.mocked(svgSanitize.sanitizeSvg).mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "icon.svg", content: Buffer.from("<svg/>") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-svg-sanitize-fault" },
        ]),
      ).rejects.toBe(sanitizeFault);
      expect(failBatchJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "pipeline-batch-svg-sanitize-fault",
          message: "Internal server error",
        }),
      );

      failBatchJobMock.mockClear();
      const decompressFault = new TypeError("unexpected gunzip fault");
      vi.mocked(svgSanitize.decompressSvgz).mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "icon.svgz", content: Buffer.from("<svg/>") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-svg-decompress-fault" },
        ]),
      ).rejects.toBe(decompressFault);
      expect(failBatchJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "pipeline-batch-svg-decompress-fault",
          message: "Internal server error",
        }),
      );
    } finally {
      vi.mocked(validateImageBuffer).mockResolvedValue({
        valid: true,
        format: "png",
        width: 100,
        height: 100,
      });
    }
  });

  it("stamps inputRefs on each per-file pipeline-finalize row so batch-finalize preserves filenames (#3141)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineBatchRoute([
      { type: "file", filename: "one.png", content: Buffer.from("one-png") },
      { type: "file", filename: "two.png", content: Buffer.from("two-png") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
      },
      { type: "field", fieldname: "clientJobId", value: "pipeline-batch-3141" },
    ]);

    expect(reply.statusCode).toBe(202);
    const finalizeInserts = insertValuesMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((row) => row?.type === "pipeline-finalize");
    expect(finalizeInserts).toEqual([
      expect.objectContaining({
        id: "pipeline-batch-3141-f0",
        type: "pipeline-finalize",
        inputRefs: ["uploads/pipeline-batch-3141-f0-s0/one.png"],
      }),
      expect.objectContaining({
        id: "pipeline-batch-3141-f1",
        type: "pipeline-finalize",
        inputRefs: ["uploads/pipeline-batch-3141-f1-s0/two.png"],
      }),
    ]);
  });

  it("preserves earlier preFailures in failBatchJob when a later file or flow enqueue faults (#3289)", async () => {
    vi.clearAllMocks();
    const workspaceCap = new SafeError("Workspace storage limit reached", {
      statusCode: 503,
      code: "workspace-cap",
    });
    putObjectMock.mockRejectedValueOnce(workspaceCap);

    try {
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
          { type: "file", filename: "b.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-3289-prefail-fault" },
        ]),
      ).rejects.toBe(workspaceCap);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-3289-prefail-fault",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [
          { filename: "empty.png", error: "File is empty" },
          { filename: "", error: "Workspace storage limit reached" },
        ],
        message: "Workspace storage limit reached",
        code: "workspace-cap",
      });

      failBatchJobMock.mockClear();
      const enqueueFault = new SafeError("Queue service unavailable", {
        statusCode: 503,
        code: "queue-unavailable",
      });
      flowAddMock.mockRejectedValueOnce(enqueueFault);

      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
          { type: "file", filename: "b.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-3289-flow-add-fault" },
        ]),
      ).rejects.toBe(enqueueFault);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-3289-flow-add-fault",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [
          { filename: "empty.png", error: "File is empty" },
          { filename: "", error: "Queue service unavailable" },
        ],
        message: "Queue service unavailable",
        code: "queue-unavailable",
      });
    } finally {
      putObjectMock.mockReset();
      putObjectMock.mockResolvedValue(undefined);
      flowAddMock.mockReset();
      flowAddMock.mockResolvedValue(undefined);
    }
  });

  it("masks non-SafeError 5xx and statusless SafeError messages as 'Internal server error' in failBatchJob (#2816)", async () => {
    vi.clearAllMocks();
    const taggedServerFault = Object.assign(
      new TypeError("Cannot read properties of undefined (reading 'byteLength')"),
      { statusCode: 500 },
    );
    putObjectMock.mockRejectedValueOnce(taggedServerFault);

    try {
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "a.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2816-tagged-500" },
        ]),
      ).rejects.toBe(taggedServerFault);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-2816-tagged-500",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 1,
        errors: [{ filename: "", error: "Internal server error" }],
        message: "Internal server error",
      });

      failBatchJobMock.mockClear();
      const untaggedRedisFault = new Error("Redis connection lost");
      flowAddMock.mockRejectedValueOnce(untaggedRedisFault);

      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "a.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2816-untagged-500" },
        ]),
      ).rejects.toBe(untaggedRedisFault);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-2816-untagged-500",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 1,
        errors: [{ filename: "", error: "Internal server error" }],
        message: "Internal server error",
      });

      failBatchJobMock.mockClear();
      const statuslessSafeError = new SafeError("sidecar exited with internal stderr", {
        code: "exit-1",
      });
      putObjectMock.mockRejectedValueOnce(statuslessSafeError);

      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "a.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          {
            type: "field",
            fieldname: "clientJobId",
            value: "pipeline-batch-2816-statusless-safe",
          },
        ]),
      ).rejects.toBe(statuslessSafeError);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-2816-statusless-safe",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 1,
        errors: [{ filename: "", error: "Internal server error" }],
        message: "Internal server error",
      });

      failBatchJobMock.mockClear();
      const upstreamGatewayFault = Object.assign(new Error("upstream gateway failure details"), {
        statusCode: 502,
        code: "ECONNRESET",
      });
      putObjectMock.mockRejectedValueOnce(upstreamGatewayFault);

      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "a.png", content: Buffer.from("valid-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({ steps: [{ toolId: batchTestToolId, settings: {} }] }),
          },
          {
            type: "field",
            fieldname: "clientJobId",
            value: "pipeline-batch-2816-502-code",
          },
        ]),
      ).rejects.toBe(upstreamGatewayFault);

      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-2816-502-code",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 1,
        errors: [{ filename: "", error: "Internal server error" }],
        message: "Internal server error",
      });
    } finally {
      putObjectMock.mockReset();
      putObjectMock.mockResolvedValue(undefined);
      flowAddMock.mockReset();
      flowAddMock.mockResolvedValue(undefined);
    }
  });

  it("continues processing when rm rejects after reading the spooled scratch file on /api/v1/pipeline/batch (#2879)", async () => {
    vi.clearAllMocks();
    readFileSpy.mockReset();
    rmSpy.mockReset();
    rmSpy.mockImplementation(async (target: unknown) => {
      if (String(target).endsWith("/0-first.png")) {
        throw new Error("EACCES: unlink failed");
      }
    });
    try {
      const reply = await invokePipelineBatchRoute([
        { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: batchTestToolId, settings: {} }],
          }),
        },
        { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2879-rm-reject" },
      ]);

      expect(reply.statusCode).toBe(202);
      expect(readFileSpy).toHaveBeenCalledTimes(1);
      expect(
        rmSpy.mock.calls.some(
          (call: unknown[]) =>
            String(call[0]).endsWith("/0-first.png") &&
            (call[1] as { force?: boolean } | undefined)?.force === true,
        ),
      ).toBe(true);
      expect(putObjectMock).toHaveBeenCalledWith(
        "uploads/pipeline-batch-2879-rm-reject-f0-s0/first.png",
        Buffer.from("first-ok"),
      );
    } finally {
      rmSpy.mockReset();
    }
  });

  it("removes the spooled scratch file in finally, settles failBatchJob, deletes earlier uploads, and propagates the readFile error when readFile rejects mid-batch on /api/v1/pipeline/batch (#2879)", async () => {
    vi.clearAllMocks();
    readFileSpy.mockReset();
    rmSpy.mockReset();
    const readErr = new Error("EIO: i/o error, read");
    readFileSpy.mockResolvedValueOnce(Buffer.from("first-ok")).mockRejectedValueOnce(readErr);
    rmSpy.mockImplementation(async (target: unknown) => {
      if (String(target).endsWith("/1-second.png")) {
        throw new Error("EACCES: unlink failed");
      }
    });
    try {
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
          { type: "file", filename: "second.png", content: Buffer.from("second-fail") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2879-read-reject" },
        ]),
      ).rejects.toBe(readErr);

      expect(
        rmSpy.mock.calls.some(
          (call: unknown[]) =>
            String(call[0]).endsWith("/1-second.png") &&
            (call[1] as { force?: boolean } | undefined)?.force === true,
        ),
      ).toBe(true);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(putObjectMock).toHaveBeenCalledWith(
        "uploads/pipeline-batch-2879-read-reject-f0-s0/first.png",
        Buffer.from("first-ok"),
      );
      expect(deleteObjectMock).toHaveBeenCalledWith(
        "uploads/pipeline-batch-2879-read-reject-f0-s0/first.png",
      );
      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "pipeline-batch-2879-read-reject",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [{ filename: "", error: "Internal server error" }],
        message: "Internal server error",
      });
    } finally {
      readFileSpy.mockReset();
      rmSpy.mockReset();
    }
  });

  it("calls deleteObject once for the failed upload and once for earlier committed uploads when storeValidatedOcrPdf fails after beforeStore on /api/v1/pipeline/batch (#2911)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    storeValidatedOcrPdfSpy.mockReset();
    putObjectStreamMock.mockReset();
    validatePdfPathMock.mockReset();
    validatePdfPathMock.mockResolvedValue(undefined);
    deleteObjectMock.mockReset();

    const storeErr = new Error("S3 stream failed");
    const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    const pdfBytes = Buffer.from("%PDF-1.4 fake");
    putObjectStreamMock
      .mockImplementationOnce(async (_key: string, stream: Readable) => {
        stream.destroy();
        return pdfBytes.length;
      })
      .mockImplementationOnce(async (_key: string, stream: Readable) => {
        stream.destroy();
        throw storeErr;
      });
    deleteObjectMock.mockRejectedValue(deleteErr);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    try {
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "first.pdf", content: pdfBytes },
          { type: "file", filename: "second.pdf", content: pdfBytes },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
            }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2911" },
        ]),
      ).rejects.toBe(storeErr);

      expect(deleteObjectMock.mock.calls).toEqual([
        ["uploads/pipeline-batch-2911-f1-s0/second.pdf"],
        ["uploads/pipeline-batch-2911-f0-s0/first.pdf"],
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        { err: deleteErr, key: "uploads/pipeline-batch-2911-f1-s0/second.pdf" },
        "Failed to delete failed OCR PDF upload",
      );

      // Post-write size mismatch inside storeValidatedOcrPdf also cleans up only once
      deleteObjectMock.mockClear();
      warnSpy.mockClear();
      putObjectStreamMock.mockImplementationOnce(async (_key: string, stream: Readable) => {
        stream.destroy();
        return pdfBytes.length - 1;
      });

      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "mismatch.pdf", content: pdfBytes },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
            }),
          },
          { type: "field", fieldname: "clientJobId", value: "pipeline-batch-2911-size" },
        ]),
      ).rejects.toThrow(
        `OCR PDF scratch file changed size (${pdfBytes.length} to ${pdfBytes.length - 1} bytes)`,
      );

      expect(deleteObjectMock.mock.calls).toEqual([
        ["uploads/pipeline-batch-2911-size-f0-s0/mismatch.pdf"],
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
      storeValidatedOcrPdfSpy.mockReset();
      putObjectStreamMock.mockReset();
      putObjectStreamMock.mockResolvedValue(42);
      validatePdfPathMock.mockReset();
      validatePdfPathMock.mockResolvedValue(undefined);
      deleteObjectMock.mockReset();
      deleteObjectMock.mockResolvedValue(undefined);
    }
  });

  it.each([
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ] as const)(
    "answers 503 %s (%s) when decodeHeic or decodeToSharpCompat fails writing to tmpdir on /api/v1/pipeline/batch, including on a DNG that Sharp can read (#2800)",
    async (errno, expectedCode) => {
      const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
      const { decodeToSharpCompat, needsCliDecode } = await import(
        "../../../apps/api/src/lib/format-decoders.js"
      );
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dngBytes = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));
      const fsErr = () =>
        Object.assign(new Error(`${errno}: open temp file`), {
          code: errno,
          syscall: "open",
        });

      try {
        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "heif",
          width: 10,
          height: 10,
        });
        vi.mocked(decodeHeic).mockRejectedValueOnce(fsErr());
        const batchHeicReply = await invokePipelineBatchRoute([
          { type: "file", filename: "photo.heic", content: Buffer.from("heic-bytes") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
        ]);
        expect(batchHeicReply.statusCode).toBe(503);
        expect(batchHeicReply.payload).toMatchObject({ code: expectedCode });

        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "raw",
          width: 10,
          height: 10,
        });
        vi.mocked(needsCliDecode).mockReturnValueOnce(true);
        vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(fsErr());
        const batchDngReply = await invokePipelineBatchRoute([
          { type: "file", filename: "photo.dng", content: dngBytes },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
        ]);
        expect(batchDngReply.statusCode).toBe(503);
        expect(batchDngReply.payload).toMatchObject({ code: expectedCode });
      } finally {
        vi.mocked(needsCliDecode).mockReturnValue(false);
      }
    },
  );

  it("answers 503 ENGINE_UNAVAILABLE with DecoderOutOfMemoryError when decodeHeic, decodeToSharpCompat, or the DNG Sharp fallback probe hits V8 OOM or SIGKILL on /api/v1/pipeline/batch (#3764)", async () => {
    const sharpMod = (await import("sharp")).default;
    const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
    const { DecoderUnavailableError, decodeToSharpCompat, needsCliDecode } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dngBytes = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";

    try {
      for (const makeRawOom of [
        () => new RangeError("Array buffer allocation failed"),
        () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
      ]) {
        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "heif",
          width: 10,
          height: 10,
        });
        vi.mocked(decodeHeic).mockRejectedValueOnce(makeRawOom());
        const batchHeicReply = await invokePipelineBatchRoute([
          { type: "file", filename: "photo.heic", content: Buffer.from("heic-bytes") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
        ]);
        expect(batchHeicReply.statusCode).toBe(503);
        expect(batchHeicReply.payload).toMatchObject({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "raw",
          width: 10,
          height: 10,
        });
        vi.mocked(needsCliDecode).mockReturnValueOnce(true);
        vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(makeRawOom());
        const batchDngReply = await invokePipelineBatchRoute([
          { type: "file", filename: "photo.dng", content: dngBytes },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
        ]);
        expect(batchDngReply.statusCode).toBe(503);
        expect(batchDngReply.payload).toMatchObject({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      for (const initialDecodeErr of [
        new DecoderUnavailableError("No dcraw_emu found."),
        new Error("dcraw failed"),
      ]) {
        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "raw",
          width: 10,
          height: 10,
        });
        vi.mocked(needsCliDecode).mockReturnValueOnce(true);
        vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(initialDecodeErr);
        const rawSpy = vi.spyOn(sharpMod.prototype, "raw").mockImplementationOnce(function (
          this: InstanceType<typeof sharpMod>,
        ) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
          } as unknown as InstanceType<typeof sharpMod>;
        });
        try {
          const probeReply = await invokePipelineBatchRoute([
            { type: "file", filename: "photo.dng", content: dngBytes },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: batchTestToolId, settings: {} }],
              }),
            },
          ]);
          expect(probeReply.statusCode).toBe(503);
          expect(probeReply.payload).toMatchObject({
            error: oomMessage,
            code: "ENGINE_UNAVAILABLE",
          });
        } finally {
          rawSpy.mockRestore();
        }
      }

      // Non-OOM RangeError in the Sharp probe still preserves DecoderUnavailableError
      vi.mocked(validateImageBuffer).mockResolvedValueOnce({
        valid: true,
        format: "raw",
        width: 10,
        height: 10,
      });
      vi.mocked(needsCliDecode).mockReturnValueOnce(true);
      vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(
        new DecoderUnavailableError("No dcraw_emu found."),
      );
      const nonOomRawSpy = vi.spyOn(sharpMod.prototype, "raw").mockImplementationOnce(function (
        this: InstanceType<typeof sharpMod>,
      ) {
        return {
          toBuffer: async () => {
            throw new RangeError("Invalid raw parameter");
          },
        } as unknown as InstanceType<typeof sharpMod>;
      });
      try {
        const nonOomReply = await invokePipelineBatchRoute([
          { type: "file", filename: "photo.dng", content: dngBytes },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: batchTestToolId, settings: {} }],
            }),
          },
        ]);
        expect(nonOomReply.statusCode).toBe(503);
        expect(nonOomReply.payload).toMatchObject({
          error: "No dcraw_emu found.",
          code: "ENGINE_UNAVAILABLE",
        });
      } finally {
        nonOomRawSpy.mockRestore();
      }
    } finally {
      vi.mocked(needsCliDecode).mockReturnValue(false);
    }
  });

  it("includes filename alongside statusCode, code, and details in preFailureFaults when a 5xx pre-failure is paired with a valid upload (#3150)", async () => {
    vi.clearAllMocks();
    const { InputValidationError } = await import("../../../apps/api/src/modality/contract.js");
    validatePdfPathMock
      .mockRejectedValueOnce(
        new InputValidationError(
          "PDF engine is not available",
          503,
          "qpdf is not installed",
          "ENGINE_UNAVAILABLE",
        ),
      )
      .mockResolvedValueOnce(undefined);

    const reply = await invokePipelineBatchRoute([
      { type: "file", filename: "broken.pdf", content: Buffer.alloc(42, 0x25) },
      { type: "file", filename: "ok.pdf", content: Buffer.alloc(42, 0x25) },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
        }),
      },
    ]);

    expect(reply.statusCode).toBe(202);
    expect(flowAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            flowChildCount: 1,
            fileIndexMap: [1],
            preFailureFaults: [
              {
                filename: "broken.pdf",
                error: "PDF engine is not available",
                statusCode: 503,
                code: "ENGINE_UNAVAILABLE",
                details: "qpdf is not installed",
              },
            ],
          }),
        }),
      }),
    );
  });
});

describe("POST /api/v1/pipeline/execute upload faults (#1642, #2860)", () => {
  const executeTestToolId = `pipeline-execute-test-${Math.random().toString(36).slice(2, 8)}`;
  registerToolProcessFn({
    toolId: executeTestToolId,
    settingsSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d ?? {} }),
      parse: (d: unknown) => d ?? {},
    } as never,
    process: async (buf: Buffer) => ({
      buffer: buf,
      filename: "out.png",
      contentType: "image/png",
    }),
  });
  registerToolProcessFn({
    toolId: "ocr-pdf",
    settingsSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d ?? {} }),
      parse: (d: unknown) => d ?? {},
    } as never,
    process: async () => {
      throw new Error("unused");
    },
  });

  it.each([
    [
      "503 storage fault",
      Object.assign(new Error("The server's storage is full."), {
        statusCode: 503,
        code: "storage-full",
      }),
    ],
    ["500 server fault", Object.assign(new Error("storage exploded"), { statusCode: 500 })],
  ])(
    "rethrows a %s from spoolMultipartFile on /api/v1/pipeline/execute (#1642)",
    async (_label, fault) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      spoolMultipartFileSpy.mockRejectedValueOnce(fault);
      try {
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "first.png", content: Buffer.from("a") },
          ]),
        ).rejects.toBe(fault);
      } finally {
        spoolMultipartFileSpy.mockReset();
      }
    },
  );

  it.each([
    [
      "503 storage fault",
      Object.assign(new Error("Workspace storage limit reached"), {
        statusCode: 503,
        code: "workspace-cap",
      }),
    ],
    ["500 server fault", Object.assign(new Error("storage exploded"), { statusCode: 500 })],
  ])(
    "rethrows a %s from storeValidatedOcrPdf on /api/v1/pipeline/execute and cleans up the scratch file (#1642)",
    async (_label, fault) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      storeValidatedOcrPdfSpy.mockReset();
      storeValidatedOcrPdfSpy.mockRejectedValueOnce(fault);
      try {
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "scan.pdf", content: Buffer.from("%PDF-1.4") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
              }),
            },
          ]),
        ).rejects.toBe(fault);
        expect(
          rmSpy.mock.calls.some((call: unknown[]) => String(call[0]).endsWith("/0-scan.pdf")),
        ).toBe(true);
      } finally {
        storeValidatedOcrPdfSpy.mockReset();
      }
    },
  );

  it("answers 413 naming the limit when storeValidatedOcrPdf exceeds the OCR cap on /api/v1/pipeline/execute (#1642)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    storeValidatedOcrPdfSpy.mockReset();
    storeValidatedOcrPdfSpy.mockRejectedValueOnce(
      Object.assign(new Error("Object exceeds the maximum allowed size (536870912 bytes)"), {
        statusCode: 413,
        limitBytes: 512 * 1024 * 1024,
      }),
    );
    try {
      const reply = await invokePipelineExecuteRoute([
        { type: "file", filename: "scan.pdf", content: Buffer.from("%PDF-1.4") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
          }),
        },
      ]);
      expect(reply.statusCode).toBe(413);
      expect(reply.payload).toEqual({ error: "File exceeds the 512 MB upload limit" });
      expect(
        rmSpy.mock.calls.some((call: unknown[]) => String(call[0]).endsWith("/0-scan.pdf")),
      ).toBe(true);
    } finally {
      storeValidatedOcrPdfSpy.mockReset();
    }
  });

  it.each([
    [
      "Error instance",
      Object.assign(new Error("Unexpected end of form at /tmp/snapotter-scratch/secret/0-a.png"), {
        statusCode: 400,
      }),
    ],
    ["non-Error value", "Unexpected end of form at /tmp/snapotter-scratch/secret/0-a.png"],
  ])(
    "strips internal paths from details on a 400 multipart parse failure (%s) in /api/v1/pipeline/execute (#1642)",
    async (_label, thrown) => {
      vi.clearAllMocks();
      spoolMultipartFileSpy.mockReset();
      spoolMultipartFileSpy.mockRejectedValueOnce(thrown);
      try {
        const reply = await invokePipelineExecuteRoute([
          { type: "file", filename: "first.png", content: Buffer.from("a") },
        ]);
        expect(reply.statusCode).toBe(400);
        expect(reply.payload).toEqual({
          error: "Failed to parse multipart request",
          details: "Unexpected end of form at [internal]",
        });
      } finally {
        spoolMultipartFileSpy.mockReset();
      }
    },
  );

  it("continues processing when rm rejects after reading the spooled scratch file on /api/v1/pipeline/execute (#2860)", async () => {
    vi.clearAllMocks();
    readFileSpy.mockReset();
    rmSpy.mockReset();
    rmSpy.mockImplementation(async (target: unknown) => {
      if (String(target).endsWith("/0-first.png")) {
        throw new Error("EACCES: unlink failed");
      }
    });
    try {
      const reply = await invokePipelineExecuteRoute([
        { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
      ]);

      expect(reply.statusCode).toBe(202);
      expect(readFileSpy).toHaveBeenCalledTimes(1);
      expect(
        rmSpy.mock.calls.some(
          (call: unknown[]) =>
            String(call[0]).endsWith("/0-first.png") &&
            (call[1] as { force?: boolean } | undefined)?.force === true,
        ),
      ).toBe(true);
      expect(putObjectMock).toHaveBeenCalledWith(
        expect.stringMatching(/^uploads\/.*\/first\.png$/),
        Buffer.from("first-ok"),
      );
    } finally {
      rmSpy.mockReset();
    }
  });

  it("removes the spooled scratch file in finally and propagates the readFile error when readFile rejects on /api/v1/pipeline/execute (#2860)", async () => {
    vi.clearAllMocks();
    readFileSpy.mockReset();
    rmSpy.mockReset();
    const readErr = new Error("EIO: i/o error, read");
    readFileSpy.mockRejectedValueOnce(readErr);
    rmSpy.mockImplementation(async (target: unknown) => {
      if (String(target).endsWith("/0-first.png")) {
        throw new Error("EACCES: unlink failed");
      }
    });
    try {
      await expect(
        invokePipelineExecuteRoute([
          { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ]),
      ).rejects.toBe(readErr);

      expect(
        rmSpy.mock.calls.some(
          (call: unknown[]) =>
            String(call[0]).endsWith("/0-first.png") &&
            (call[1] as { force?: boolean } | undefined)?.force === true,
        ),
      ).toBe(true);
      expect(putObjectMock).not.toHaveBeenCalled();
    } finally {
      readFileSpy.mockReset();
      rmSpy.mockReset();
    }
  });

  it("logs a warning with { err, key } and still propagates the flow error when deleteObject rejects during finally cleanup on /api/v1/pipeline/execute (#2837)", async () => {
    vi.clearAllMocks();
    spoolMultipartFileSpy.mockReset();
    storeValidatedOcrPdfSpy.mockReset();
    deleteObjectMock.mockReset();
    flowAddMock.mockReset();

    storeValidatedOcrPdfSpy.mockResolvedValueOnce(8);
    const flowErr = new Error("Redis flow add failed");
    const cleanupErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    flowAddMock.mockRejectedValueOnce(flowErr);
    deleteObjectMock.mockRejectedValueOnce(cleanupErr);
    const log = { error: vi.fn(), warn: vi.fn() };

    try {
      await expect(
        invokePipelineExecuteRoute(
          [
            { type: "file", filename: "scan.pdf", content: Buffer.from("%PDF-1.4") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
              }),
            },
          ],
          log,
        ),
      ).rejects.toBe(flowErr);

      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      const deletedKey = (deleteObjectMock.mock.calls[0] as unknown[] | undefined)?.[0];
      expect(deletedKey).toMatch(/^uploads\/.*\/scan\.pdf$/);
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith(
        { err: cleanupErr, key: deletedKey },
        "pipeline ingress cleanup failed",
      );
    } finally {
      storeValidatedOcrPdfSpy.mockReset();
      deleteObjectMock.mockReset();
      flowAddMock.mockReset();
    }
  });

  it("deletes the uploaded object in finally when pre-enqueue setup or flow add fails on a non-ocr-pdf pipeline, and keeps it once enqueued (#2910)", async () => {
    const parts = [
      { type: "file" as const, filename: "first.png", content: Buffer.from("first-ok") },
      {
        type: "field" as const,
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [{ toolId: executeTestToolId, settings: {} }],
        }),
      },
      { type: "field" as const, fieldname: "clientJobId", value: "pipeline-execute-2910" },
    ];

    try {
      // 1. clientJobId alias upsert rejects
      vi.clearAllMocks();
      const aliasErr = new Error("alias upsert failed");
      onConflictDoUpdateMock.mockRejectedValueOnce(aliasErr);

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(aliasErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const aliasUploadKey = String((putObjectMock.mock.calls[0] as unknown[] | undefined)?.[0]);
      expect(aliasUploadKey).toMatch(/^uploads\/.*\/first\.png$/);
      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).toHaveBeenCalledWith(aliasUploadKey);

      // 2. updateSingleFileProgress rejects
      vi.clearAllMocks();
      const progressErr = new Error("progress write failed");
      updateSingleFileProgressMock.mockRejectedValueOnce(progressErr);

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(progressErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const progressUploadKey = String((putObjectMock.mock.calls[0] as unknown[] | undefined)?.[0]);
      expect(progressUploadKey).toMatch(/^uploads\/.*\/first\.png$/);
      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).toHaveBeenCalledWith(progressUploadKey);

      // 3. schema.jobs step row insert rejects
      vi.clearAllMocks();
      const insertErr = new Error("step insert failed");
      insertValuesMock.mockImplementation((row: unknown) => {
        if ((row as { type?: string })?.type === "pipeline-step") {
          return Promise.reject(insertErr) as ReturnType<typeof insertValuesMock>;
        }
        return defaultInsertValuesImpl(row);
      });

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(insertErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const insertUploadKey = String((putObjectMock.mock.calls[0] as unknown[] | undefined)?.[0]);
      expect(insertUploadKey).toMatch(/^uploads\/.*\/first\.png$/);
      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).toHaveBeenCalledWith(insertUploadKey);

      // 4. schema.jobs parent pipeline row insert rejects
      vi.clearAllMocks();
      const parentInsertErr = new Error("parent insert failed");
      insertValuesMock.mockImplementation((row: unknown) => {
        if ((row as { type?: string })?.type === "pipeline") {
          return Promise.reject(parentInsertErr) as ReturnType<typeof insertValuesMock>;
        }
        return defaultInsertValuesImpl(row);
      });

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(parentInsertErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const parentInsertUploadKey = String(
        (putObjectMock.mock.calls[0] as unknown[] | undefined)?.[0],
      );
      expect(parentInsertUploadKey).toMatch(/^uploads\/.*\/first\.png$/);
      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).toHaveBeenCalledWith(parentInsertUploadKey);
      insertValuesMock.mockImplementation(defaultInsertValuesImpl);

      // 5. getFlowProducer().add rejects and deleteObject warning is logged when cleanup also rejects
      vi.clearAllMocks();
      const flowErr = new Error("Redis flow add failed");
      const cleanupErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
      flowAddMock.mockRejectedValueOnce(flowErr);
      deleteObjectMock.mockRejectedValueOnce(cleanupErr);
      const log = { error: vi.fn(), warn: vi.fn() };

      await expect(invokePipelineExecuteRoute(parts, log)).rejects.toBe(flowErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const flowUploadKey = String((putObjectMock.mock.calls[0] as unknown[] | undefined)?.[0]);
      expect(flowUploadKey).toMatch(/^uploads\/.*\/first\.png$/);
      expect(deleteObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).toHaveBeenCalledWith(flowUploadKey);
      expect(log.warn).toHaveBeenCalledWith(
        { err: cleanupErr, key: flowUploadKey },
        "pipeline ingress cleanup failed",
      );

      // 6. When putObject itself rejects, deleteObject is not called
      vi.clearAllMocks();
      const putErr = new Error("storage put failed");
      putObjectMock.mockRejectedValueOnce(putErr);

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(putErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).not.toHaveBeenCalled();

      // 7. Once getFlowProducer().add succeeds, a waitForJob rejection does not delete the upload
      vi.clearAllMocks();
      const waitErr = new Error("worker failed after enqueue");
      waitForJobMock.mockRejectedValueOnce(waitErr);

      await expect(invokePipelineExecuteRoute(parts)).rejects.toBe(waitErr);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(flowAddMock).toHaveBeenCalledTimes(1);
      expect(deleteObjectMock).not.toHaveBeenCalled();
    } finally {
      insertValuesMock.mockReset();
      insertValuesMock.mockImplementation(defaultInsertValuesImpl);
      putObjectMock.mockReset();
      putObjectMock.mockResolvedValue(undefined);
      onConflictDoUpdateMock.mockReset();
      onConflictDoUpdateMock.mockResolvedValue({ rowCount: 1 });
      updateSingleFileProgressMock.mockReset();
      updateSingleFileProgressMock.mockResolvedValue(undefined);
      flowAddMock.mockReset();
      flowAddMock.mockResolvedValue(undefined);
      deleteObjectMock.mockReset();
      deleteObjectMock.mockResolvedValue(undefined);
      waitForJobMock.mockReset();
      waitForJobMock.mockResolvedValue(null);
    }
  });

  it("decompresses .svgz, sanitizes SVG, and skips autoOrient on /api/v1/pipeline/execute (#3083)", async () => {
    vi.clearAllMocks();
    vi.mocked(validateImageBuffer).mockResolvedValueOnce({
      valid: true,
      format: "svg",
      width: 0,
      height: 0,
    });

    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><rect width="100" height="100" fill="red"/></svg>',
      "utf-8",
    );
    const svgz = gzipSync(rawSvg);

    const reply = await invokePipelineExecuteRoute([
      { type: "file", filename: "icon.svgz", content: svgz },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [{ toolId: executeTestToolId, settings: {} }],
        }),
      },
    ]);

    expect(reply.statusCode).toBe(202);
    expect(putObjectMock).toHaveBeenCalledTimes(1);
    const firstCall = putObjectMock.mock.calls[0] as unknown[] | undefined;
    const storedBuf = firstCall ? (firstCall[1] as Buffer) : Buffer.alloc(0);
    const storedSvg = storedBuf.toString("utf-8");
    expect(storedSvg).toContain("<svg");
    expect(storedSvg).not.toContain("<script");
    expect(storedSvg).not.toContain("alert(1)");
    expect(autoOrient).not.toHaveBeenCalled();
  });

  it("skips the 1x1 pixel probe, sanitizes disguised SVGs (.tga / .dng), and skips autoOrient on /api/v1/pipeline/execute and /api/v1/pipeline/batch (#3749)", async () => {
    vi.clearAllMocks();
    const sharpMod = (await import("sharp")).default;
    const { decodeToSharpCompat, needsCliDecode } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );

    const commentPaddedDirtySvg = Buffer.from(
      `<!-- ${"x".repeat(4500)} --><svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><script>alert(1)</script><feImage href="http://169.254.169.254/latest/meta-data/"/><rect width="25" height="25" fill="red"/></svg>`,
      "utf-8",
    );
    const commentPaddedOverCapSvg = Buffer.from(
      `<!-- ${"x".repeat(4500)} --><svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">${"<rect/>".repeat(5001)}</svg>`,
      "utf-8",
    );

    const resizeSpy = vi.spyOn(sharpMod.prototype, "resize");
    try {
      // 1. /api/v1/pipeline/execute with disguised .tga SVG
      vi.mocked(validateImageBuffer).mockResolvedValueOnce({
        valid: true,
        format: "tga",
        width: 0,
        height: 0,
      });
      vi.mocked(needsCliDecode).mockReturnValueOnce(true);
      vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(new Error("CLI decode failed"));

      const execReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "padded.tga", content: commentPaddedDirtySvg },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
      ]);

      expect(execReply.statusCode).toBe(202);
      expect(resizeSpy).not.toHaveBeenCalled();
      expect(autoOrient).not.toHaveBeenCalled();
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const execCall = putObjectMock.mock.calls[0] as unknown[] | undefined;
      const execStored = (execCall ? (execCall[1] as Buffer) : Buffer.alloc(0)).toString("utf-8");
      expect(execStored).toContain("<svg");
      expect(execStored).not.toContain("<script");
      expect(execStored).not.toContain("169.254.169.254");

      // Over-cap disguised SVG on /api/v1/pipeline/execute returns 400
      vi.mocked(validateImageBuffer).mockResolvedValueOnce({
        valid: true,
        format: "raw",
        width: 0,
        height: 0,
      });
      vi.mocked(needsCliDecode).mockReturnValueOnce(true);
      vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(new Error("CLI decode failed"));

      const execOverCapReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "padded.dng", content: commentPaddedOverCapSvg },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
      ]);
      expect(execOverCapReply.statusCode).toBe(400);
      expect(execOverCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });

      // 2. /api/v1/pipeline/batch with disguised .tga and over-cap .dng SVGs
      putObjectMock.mockClear();
      vi.mocked(validateImageBuffer)
        .mockResolvedValueOnce({ valid: true, format: "tga", width: 0, height: 0 })
        .mockResolvedValueOnce({ valid: true, format: "raw", width: 0, height: 0 });
      vi.mocked(needsCliDecode).mockReturnValueOnce(true).mockReturnValueOnce(true);
      vi.mocked(decodeToSharpCompat)
        .mockRejectedValueOnce(new Error("CLI decode failed"))
        .mockRejectedValueOnce(new Error("CLI decode failed"));

      const batchReply = await invokePipelineBatchRoute([
        { type: "file", filename: "padded.tga", content: commentPaddedDirtySvg },
        { type: "file", filename: "padded.dng", content: commentPaddedOverCapSvg },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
        { type: "field", fieldname: "clientJobId", value: "pipeline-batch-disguised-svg" },
      ]);

      expect(batchReply.statusCode).toBe(202);
      expect(resizeSpy).not.toHaveBeenCalled();
      expect(autoOrient).not.toHaveBeenCalled();
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      const batchCall = putObjectMock.mock.calls[0] as unknown[] | undefined;
      const batchStored = (batchCall ? (batchCall[1] as Buffer) : Buffer.alloc(0)).toString(
        "utf-8",
      );
      expect(batchStored).toContain("<svg");
      expect(batchStored).not.toContain("<script");
      expect(batchStored).not.toContain("169.254.169.254");
    } finally {
      resizeSpy.mockRestore();
      vi.mocked(needsCliDecode).mockReturnValue(false);
    }
  });

  it("answers 400 when decompressSvgz or sanitizeSvg rejects on /api/v1/pipeline/execute (#3083)", async () => {
    vi.clearAllMocks();
    vi.mocked(validateImageBuffer).mockResolvedValue({
      valid: true,
      format: "svg",
      width: 0,
      height: 0,
    });

    try {
      const notSvgSvgz = gzipSync(Buffer.from("not an svg document", "utf-8"));
      const badSvgzReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "bad.svgz", content: notSvgSvgz },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
      ]);
      expect(badSvgzReply.statusCode).toBe(400);
      expect(badSvgzReply.payload).toEqual({
        error: "SVGZ file does not contain valid SVG content after decompression",
      });

      const overElementSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
        "utf-8",
      );
      const overCapReply = await invokePipelineExecuteRoute([
        { type: "file", filename: "too-many.svg", content: overElementSvg },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
      ]);
      expect(overCapReply.statusCode).toBe(400);
      expect(overCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });
      expect(putObjectMock).not.toHaveBeenCalled();

      const svgSanitize = await import("../../../apps/api/src/lib/svg-sanitize.js");
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      vi.mocked(svgSanitize.sanitizeSvg).mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokePipelineExecuteRoute([
          { type: "file", filename: "icon.svg", content: Buffer.from("<svg/>") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ]),
      ).rejects.toBe(sanitizeFault);

      const decompressFault = new TypeError("unexpected gunzip fault");
      vi.mocked(svgSanitize.decompressSvgz).mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokePipelineExecuteRoute([
          { type: "file", filename: "icon.svgz", content: Buffer.from("<svg/>") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ]),
      ).rejects.toBe(decompressFault);
    } finally {
      vi.mocked(validateImageBuffer).mockResolvedValue({
        valid: true,
        format: "png",
        width: 100,
        height: 100,
      });
    }
  });

  it("stamps inputRefs on the pipeline parent row so stranded-job reconciliation can resolve originalSize (#2717)", async () => {
    vi.clearAllMocks();

    const reply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("photo-png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [
            { toolId: executeTestToolId, settings: {} },
            { toolId: executeTestToolId, settings: {} },
          ],
        }),
      },
    ]);

    expect(reply.statusCode).toBe(202);
    const parentInsert = insertValuesMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((row) => row?.type === "pipeline");
    expect(parentInsert).toBeDefined();
    const flowId = String(parentInsert?.id ?? "");
    expect(parentInsert).toEqual(
      expect.objectContaining({
        id: flowId,
        type: "pipeline",
        inputRefs: [`uploads/${flowId}/photo.png`],
      }),
    );
  });

  it("clears the Redis terminal replay key and batch cancel flag when claiming a clientJobId alias row and skips both when refused (#2739, #2740)", async () => {
    vi.clearAllMocks();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 1 });

    const claimedReply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("photo-png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [{ toolId: executeTestToolId, settings: {} }],
        }),
      },
      { type: "field", fieldname: "clientJobId", value: "reused-pipeline-alias" },
    ]);

    expect(claimedReply.statusCode).toBe(202);
    expect(claimedReply.payload).toEqual({ jobId: "reused-pipeline-alias", async: true });
    expect(clearBatchCanceledMock).toHaveBeenCalledTimes(1);
    expect(clearBatchCanceledMock).toHaveBeenCalledWith("reused-pipeline-alias");
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledTimes(1);
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledWith("reused-pipeline-alias");
    expect(updateSingleFileProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "reused-pipeline-alias", phase: "processing" }),
    );
    expect(onConflictDoUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearBatchCanceledMock.mock.invocationCallOrder[0],
    );
    expect(clearBatchCanceledMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateSingleFileProgressMock.mock.invocationCallOrder[0],
    );
    expect(onConflictDoUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearTerminalReplayKeyMock.mock.invocationCallOrder[0],
    );
    expect(clearTerminalReplayKeyMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateSingleFileProgressMock.mock.invocationCallOrder[0],
    );
    expect(updateSingleFileProgressMock.mock.invocationCallOrder[0]).toBeLessThan(
      flowAddMock.mock.invocationCallOrder[0],
    );

    vi.clearAllMocks();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 1 });
    const cancelDelErr = new Error("redis del cancel fault");
    const terminalDelErr = new Error("redis del fault");
    clearBatchCanceledMock.mockRejectedValueOnce(cancelDelErr);
    clearTerminalReplayKeyMock.mockRejectedValueOnce(terminalDelErr);
    const faultLog = { error: vi.fn(), warn: vi.fn() };

    const faultTolerantReply = await invokePipelineExecuteRoute(
      [
        { type: "file", filename: "photo.png", content: Buffer.from("photo-png-bytes") },
        {
          type: "field",
          fieldname: "pipeline",
          value: JSON.stringify({
            steps: [{ toolId: executeTestToolId, settings: {} }],
          }),
        },
        { type: "field", fieldname: "clientJobId", value: "reused-pipeline-alias-fault" },
      ],
      faultLog,
    );

    expect(faultTolerantReply.statusCode).toBe(202);
    expect(faultTolerantReply.payload).toEqual({
      jobId: "reused-pipeline-alias-fault",
      async: true,
    });
    expect(faultLog.warn).toHaveBeenCalledWith(
      {
        err: cancelDelErr,
        clientJobId: "reused-pipeline-alias-fault",
        pipelineFlowId: expect.any(String),
      },
      "failed to clear batch cancel flag for pipeline alias",
    );
    expect(faultLog.warn).toHaveBeenCalledWith(
      {
        err: terminalDelErr,
        clientJobId: "reused-pipeline-alias-fault",
        pipelineFlowId: expect.any(String),
      },
      "failed to clear terminal replay key for pipeline alias",
    );
    expect(updateSingleFileProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "reused-pipeline-alias-fault", phase: "processing" }),
    );

    vi.clearAllMocks();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 0 });

    const refusedReply = await invokePipelineExecuteRoute([
      { type: "file", filename: "photo.png", content: Buffer.from("photo-png-bytes") },
      {
        type: "field",
        fieldname: "pipeline",
        value: JSON.stringify({
          steps: [{ toolId: executeTestToolId, settings: {} }],
        }),
      },
      { type: "field", fieldname: "clientJobId", value: "refused-pipeline-alias" },
    ]);

    expect(refusedReply.statusCode).toBe(202);
    expect((refusedReply.payload as { jobId?: string })?.jobId).not.toBe("refused-pipeline-alias");
    expect(clearBatchCanceledMock).not.toHaveBeenCalled();
    expect(clearTerminalReplayKeyMock).not.toHaveBeenCalled();
    expect(updateSingleFileProgressMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ] as const)(
    "surfaces 503 %s (%s) when decodeHeic or decodeToSharpCompat fails writing to tmpdir on /api/v1/pipeline/execute, including on a DNG that Sharp can read (#2800)",
    async (errno, expectedCode) => {
      const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
      const { decodeToSharpCompat, needsCliDecode } = await import(
        "../../../apps/api/src/lib/format-decoders.js"
      );
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dngBytes = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));
      const fsErr = () =>
        Object.assign(new Error(`${errno}: open temp file`), {
          code: errno,
          syscall: "open",
        });

      try {
        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "heif",
          width: 10,
          height: 10,
        });
        vi.mocked(decodeHeic).mockRejectedValueOnce(fsErr());
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "photo.heic", content: Buffer.from("heic-bytes") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: executeTestToolId, settings: {} }],
              }),
            },
          ]),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          statusCode: 503,
          code: expectedCode,
        });

        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "raw",
          width: 10,
          height: 10,
        });
        vi.mocked(needsCliDecode).mockReturnValueOnce(true);
        vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(fsErr());
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "photo.dng", content: dngBytes },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: executeTestToolId, settings: {} }],
              }),
            },
          ]),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          statusCode: 503,
          code: expectedCode,
        });
      } finally {
        vi.mocked(needsCliDecode).mockReturnValue(false);
      }
    },
  );

  it("surfaces 503 ENGINE_UNAVAILABLE with DecoderOutOfMemoryError when decodeHeic or decodeToSharpCompat hits V8 OOM or SIGKILL on /api/v1/pipeline/execute (#3764)", async () => {
    const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
    const { decodeToSharpCompat, needsCliDecode } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dngBytes = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";

    try {
      for (const makeRawOom of [
        () => new RangeError("Array buffer allocation failed"),
        () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
      ]) {
        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "heif",
          width: 10,
          height: 10,
        });
        vi.mocked(decodeHeic).mockRejectedValueOnce(makeRawOom());
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "photo.heic", content: Buffer.from("heic-bytes") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: executeTestToolId, settings: {} }],
              }),
            },
          ]),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          message: oomMessage,
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
        });

        vi.mocked(validateImageBuffer).mockResolvedValueOnce({
          valid: true,
          format: "raw",
          width: 10,
          height: 10,
        });
        vi.mocked(needsCliDecode).mockReturnValueOnce(true);
        vi.mocked(decodeToSharpCompat).mockRejectedValueOnce(makeRawOom());
        await expect(
          invokePipelineExecuteRoute([
            { type: "file", filename: "photo.dng", content: dngBytes },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: executeTestToolId, settings: {} }],
              }),
            },
          ]),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          message: oomMessage,
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
        });
      }
    } finally {
      vi.mocked(needsCliDecode).mockReturnValue(false);
    }
  });

  it("routes DecoderOutOfMemoryError and 5xx faults from validateImageBuffer and autoOrient through reportEngineUnavailable on /api/v1/pipeline/execute and /api/v1/pipeline/batch (#3726)", async () => {
    const { DecoderOutOfMemoryError } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    let fakeNow = Date.now() + 40 * 60_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    try {
      // 1. /api/v1/pipeline/execute: validateImageBuffer and autoOrient OOM answer 503 with code ENGINE_UNAVAILABLE and report via reportEngineUnavailable
      for (const phase of ["validate", "orient"] as const) {
        fakeNow += 11 * 60_000;
        reportErrorMock.mockClear();
        const log = { error: vi.fn(), warn: vi.fn() };
        if (phase === "validate") {
          vi.mocked(validateImageBuffer).mockRejectedValueOnce(
            new DecoderOutOfMemoryError(oomMessage),
          );
        } else {
          vi.mocked(autoOrient).mockRejectedValueOnce(
            new RangeError("Array buffer allocation failed"),
          );
        }

        const reply = await invokePipelineExecuteRoute(
          [
            { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
            {
              type: "field",
              fieldname: "pipeline",
              value: JSON.stringify({
                steps: [{ toolId: executeTestToolId, settings: {} }],
              }),
            },
          ],
          log,
        );

        expect(reply.statusCode).toBe(503);
        expect(reply.payload).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
        expect(log.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "ENGINE_UNAVAILABLE",
            cause: "DecoderOutOfMemoryError",
            toolId: executeTestToolId,
          }),
          "Tool engine unavailable during input preparation",
        );
        expect(reportErrorMock).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "InputValidationError",
            statusCode: 503,
            code: "ENGINE_UNAVAILABLE",
          }),
          {
            source: "http",
            toolId: executeTestToolId,
            statusCode: 503,
          },
        );
      }

      // 2. /api/v1/pipeline/batch: validateImageBuffer OOM on file 0 and autoOrient OOM on file 1 record preFailures and continue with file 2
      fakeNow += 11 * 60_000;
      reportErrorMock.mockClear();
      flowAddMock.mockClear();
      vi.mocked(validateImageBuffer)
        .mockRejectedValueOnce(new DecoderOutOfMemoryError(oomMessage))
        .mockResolvedValueOnce({ valid: true, format: "png", width: 10, height: 10 })
        .mockResolvedValueOnce({ valid: true, format: "png", width: 10, height: 10 });
      vi.mocked(autoOrient)
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockImplementationOnce(async (buf: Buffer) => buf);

      const batchLog = { error: vi.fn(), warn: vi.fn() };
      const batchReply = await invokePipelineBatchRoute(
        [
          { type: "file", filename: "validate-oom.png", content: Buffer.from("v-oom") },
          { type: "file", filename: "orient-oom.png", content: Buffer.from("o-oom") },
          { type: "file", filename: "ok.png", content: Buffer.from("ok-png") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ],
        batchLog,
      );

      expect(batchReply.statusCode).toBe(202);
      expect(batchLog.warn).toHaveBeenCalledTimes(1);
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
      expect(flowAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settings: expect.objectContaining({
              flowChildCount: 1,
              fileIndexMap: [2],
              preFailureFaults: [
                {
                  filename: "validate-oom.png",
                  error: oomMessage,
                  statusCode: 503,
                  code: "ENGINE_UNAVAILABLE",
                },
                {
                  filename: "orient-oom.png",
                  error: oomMessage,
                  statusCode: 503,
                  code: "ENGINE_UNAVAILABLE",
                },
              ],
            }),
          }),
        }),
      );

      // 3. Unexpected non-5xx errors in validateImageBuffer or autoOrient still rethrow on both routes
      const unexpectedValidateErr = new TypeError("unexpected pipeline validate fault");
      vi.mocked(validateImageBuffer).mockRejectedValueOnce(unexpectedValidateErr);
      await expect(
        invokePipelineExecuteRoute([
          { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ]),
      ).rejects.toBe(unexpectedValidateErr);

      const unexpectedOrientErr = new TypeError("unexpected pipeline orient fault");
      vi.mocked(autoOrient).mockRejectedValueOnce(unexpectedOrientErr);
      await expect(
        invokePipelineBatchRoute([
          { type: "file", filename: "photo.png", content: Buffer.from("png-bytes") },
          {
            type: "field",
            fieldname: "pipeline",
            value: JSON.stringify({
              steps: [{ toolId: executeTestToolId, settings: {} }],
            }),
          },
        ]),
      ).rejects.toBe(unexpectedOrientErr);
    } finally {
      nowSpy.mockRestore();
      vi.mocked(validateImageBuffer).mockResolvedValue({
        valid: true,
        format: "png",
        width: 100,
        height: 100,
      });
      vi.mocked(autoOrient).mockImplementation(async (buf: Buffer) => buf);
    }
  });
});
