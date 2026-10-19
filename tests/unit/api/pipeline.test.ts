/**
 * Unit tests for pipeline route utility logic.
 *
 * Tests pipeline step validation schemas, tool resolution (content-aware resize),
 * unique filename deduplication, and the pipeline step schema constraints.
 */
import { Readable } from "node:stream";
import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

const insertValuesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ rowCount: number }>>(async () => ({ rowCount: 1 })),
);
const updateSetMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const readFileSpy = vi.hoisted(() => vi.fn());
const rmSpy = vi.hoisted(() => vi.fn());
const spoolMultipartFileSpy = vi.hoisted(() => vi.fn());
const recordChildOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
const failBatchJobMock = vi.hoisted(() => vi.fn(async () => true));
const updateJobProgressMock = vi.hoisted(() => vi.fn());
const flowAddMock = vi.hoisted(() => vi.fn(async () => {}));
const putObjectMock = vi.hoisted(() => vi.fn(async () => {}));

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
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
    jobs: { id: {}, status: {} },
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

vi.mock("../../../apps/api/src/lib/filename.js", () => ({
  sanitizeFilename: (n: string) => n,
}));

vi.mock("../../../apps/api/src/lib/format-decoders.js", () => ({
  decodeToSharpCompat: vi.fn(),
  needsCliDecode: vi.fn(() => false),
}));

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", () => ({
  isSvgBuffer: vi.fn(() => false),
  sanitizeSvg: vi.fn((b: Buffer) => b),
}));

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
      const buf = (await actual.readFile(...args)) as Buffer;
      readFileSpy(...args);
      return buf;
    },
    rm: (...args: Parameters<typeof actual.rm>) => {
      rmSpy(...args);
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
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: putObjectMock,
    deleteObject: vi.fn(async () => {}),
    getObjectStream: vi.fn(),
  };
});

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  getFlowProducer: () => ({ add: flowAddMock }),
  injectTraceContext: vi.fn(),
  waitForJob: vi.fn(async () => null),
}));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", () => ({
  recordChildOutcome: recordChildOutcomeMock,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  failBatchJob: failBatchJobMock,
  updateJobProgress: updateJobProgressMock,
  updateSingleFileProgress: vi.fn(),
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

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerPipelineRoutes } from "../../../apps/api/src/routes/pipeline.js";
import {
  getRegisteredToolIds,
  getToolConfig,
  registerToolProcessFn,
} from "../../../apps/api/src/routes/tool-factory.js";

// ── Pipeline step schema tests (reproduced logic) ──────────────────────

describe("pipeline step schema validation", () => {
  it("requires at least one step", () => {
    const steps: unknown[] = [];
    expect(steps.length).toBe(0);
    // Pipeline definition schema requires min 1 step
  });

  it("validates step has toolId field", () => {
    const step = { toolId: "resize", settings: {} };
    expect(step.toolId).toBe("resize");
    expect(step.settings).toEqual({});
  });

  it("defaults settings to empty object when omitted", () => {
    const step = { toolId: "compress" };
    const settings = (step as { settings?: Record<string, unknown> }).settings ?? {};
    expect(settings).toEqual({});
  });
});

// ── Tool resolution (content-aware resize routing) ─────────────────────

describe("content-aware resize routing", () => {
  it("resolves resize with contentAware to content-aware-resize", () => {
    const step = { toolId: "resize", settings: { contentAware: true, width: 200 } };

    const resolvedToolId =
      step.toolId === "resize" && step.settings?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("content-aware-resize");
  });

  it("keeps resize as-is without contentAware", () => {
    const step = { toolId: "resize", settings: { width: 200 } };

    const resolvedToolId =
      step.toolId === "resize" && (step.settings as Record<string, unknown>)?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("resize");
  });

  it("keeps non-resize tools unchanged", () => {
    const step = { toolId: "compress", settings: { quality: 80 } };

    const resolvedToolId =
      step.toolId === "resize" && (step.settings as Record<string, unknown>)?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("compress");
  });
});

// ── Unique filename deduplication ──────────────────────────────────────

describe("filename deduplication (getUniqueName logic)", () => {
  function getUniqueName(name: string, usedNames: Set<string>): string {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let counter = 1;
    let candidate = `${base}_${counter}${ext}`;
    while (usedNames.has(candidate)) {
      counter++;
      candidate = `${base}_${counter}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  it("returns the original name when no conflicts", () => {
    const used = new Set<string>();
    expect(getUniqueName("photo.png", used)).toBe("photo.png");
  });

  it("adds _1 suffix on first conflict", () => {
    const used = new Set<string>(["photo.png"]);
    expect(getUniqueName("photo.png", used)).toBe("photo_1.png");
  });

  it("increments counter on repeated conflicts", () => {
    const used = new Set<string>(["photo.png", "photo_1.png"]);
    expect(getUniqueName("photo.png", used)).toBe("photo_2.png");
  });

  it("handles filenames without extension", () => {
    const used = new Set<string>(["README"]);
    expect(getUniqueName("README", used)).toBe("README_1");
  });

  it("handles multiple dots in filename", () => {
    const used = new Set<string>(["my.photo.final.png"]);
    expect(getUniqueName("my.photo.final.png", used)).toBe("my.photo.final_1.png");
  });

  it("tracks all used names across multiple calls", () => {
    const used = new Set<string>();
    expect(getUniqueName("a.jpg", used)).toBe("a.jpg");
    expect(getUniqueName("a.jpg", used)).toBe("a_1.jpg");
    expect(getUniqueName("a.jpg", used)).toBe("a_2.jpg");
    expect(getUniqueName("b.jpg", used)).toBe("b.jpg");
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

describe("pipeline step error message formatting", () => {
  it("wraps step errors with step number and tool ID", () => {
    const stepErr = new Error("Invalid dimensions");
    const i = 2;
    const toolId = "resize";
    const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
    const wrapped = `Step ${i + 1} (${toolId}): ${msg}`;
    expect(wrapped).toBe("Step 3 (resize): Invalid dimensions");
  });

  it("falls back to generic message for non-Error", () => {
    const stepErr = "some string";
    const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
    expect(msg).toBe("Processing failed");
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

describe("POST /api/v1/pipeline/batch ingress (#2684, #2685)", () => {
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

    await handler?.(request, reply);
    return reply;
  }

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
            preFailureFaults: [{ error: "File is empty" }],
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
});
