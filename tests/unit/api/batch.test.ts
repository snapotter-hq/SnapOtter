/**
 * Unit tests for batch processing route utility logic.
 *
 * Tests filename deduplication, batch size enforcement, skip-preprocess
 * logic for metadata tools, and the file results map construction.
 */
import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  autoOrient: vi.fn(async (buf: Buffer) => buf),
  deleteObject: vi.fn(async () => {}),
  failBatchJob: vi.fn(async () => true),
  flowAdd: vi.fn(async () => {}),
  getFirstMissingBundleForTool: vi.fn((): string | null => null),
  getToolConfig: vi.fn(() => ({ settingsSchema: z.record(z.unknown()) })),
  putObject: vi.fn<(key: string, data: Buffer) => Promise<void>>(async () => {}),
  readFile: vi.fn<(...args: unknown[]) => Promise<Buffer>>(),
  recordChildOutcome: vi.fn(async () => {}),
  requireToolAccess: vi.fn(async () => ({ id: "user-1" })),
  rm: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  spoolMultipartFile: vi.fn(),
  storeValidatedOcrPdf: vi.fn(async () => 42),
  updateJobProgress: vi.fn(),
  validateImageBuffer: vi.fn<
    (_buf: Buffer, _name: string) => Promise<{ valid: boolean; format: string }>
  >(async () => ({ valid: true, format: "png" })),
  waitForJob: vi.fn(async () => null),
  workspaceHeadroomBytes: vi.fn(async (): Promise<number | null> => null),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (mocks.readFile.getMockImplementation()) {
        return mocks.readFile(...args);
      }
      const buf = (await actual.readFile(...args)) as Buffer;
      mocks.readFile(...args);
      return buf;
    },
    rm: (...args: Parameters<typeof actual.rm>) => {
      mocks.rm(...args);
      return actual.rm(...args);
    },
  };
});

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
        all: () => [],
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: {} },
    jobs: { id: {}, status: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    WORKSPACE_PATH: "/tmp/test",
    SCRATCH_PATH: "",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_BATCH_SIZE: 10,
    MAX_UPLOAD_SIZE_MB: 100,
    MAX_WORKSPACE_SIZE_GB: 0,
    FILE_MAX_AGE_HOURS: 24,
    CONCURRENT_JOBS: 3,
  },
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: vi.fn(() => true),
  getFirstMissingBundleForTool: mocks.getFirstMissingBundleForTool,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requireToolAccess: mocks.requireToolAccess,
}));

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  getToolConfig: mocks.getToolConfig,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    deleteObject: mocks.deleteObject,
    getObjectStream: vi.fn(),
    putObject: mocks.putObject,
    workspaceHeadroomBytes: mocks.workspaceHeadroomBytes,
  };
});

vi.mock("../../../apps/api/src/lib/ocr-pdf-ingress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/ocr-pdf-ingress.js")>();
  return {
    ...actual,
    spoolMultipartFile: async (...args: Parameters<typeof actual.spoolMultipartFile>) => {
      if (mocks.spoolMultipartFile.getMockImplementation()) {
        return mocks.spoolMultipartFile(...args);
      }
      const res = await actual.spoolMultipartFile(...args);
      mocks.spoolMultipartFile(...args);
      return res;
    },
    storeValidatedOcrPdf: mocks.storeValidatedOcrPdf,
  };
});

vi.mock("../../../apps/api/src/lib/file-validation.js", () => ({
  validateImageBuffer: mocks.validateImageBuffer,
}));

vi.mock("../../../apps/api/src/lib/auto-orient.js", () => ({
  autoOrient: mocks.autoOrient,
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  getFlowProducer: () => ({ add: mocks.flowAdd }),
  injectTraceContext: vi.fn(),
  waitForJob: mocks.waitForJob,
}));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", () => ({
  recordChildOutcome: mocks.recordChildOutcome,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  failBatchJob: mocks.failBatchJob,
  updateJobProgress: mocks.updateJobProgress,
}));

import { registerBatchRoutes } from "../../../apps/api/src/routes/batch.js";

// ── Batch size enforcement ─────────────────────────────────────────────

describe("batch size enforcement", () => {
  it("allows files within the limit", () => {
    const maxBatchSize = 10;
    const fileCount = 5;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });

  it("rejects files exceeding the limit", () => {
    const maxBatchSize = 10;
    const fileCount = 15;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(true);
  });

  it("allows any count when limit is 0 (unlimited)", () => {
    const maxBatchSize = 0;
    const fileCount = 999;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });

  it("rejects when count equals limit + 1", () => {
    const maxBatchSize = 10;
    const fileCount = 11;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(true);
  });

  it("allows when count equals limit exactly", () => {
    const maxBatchSize = 10;
    const fileCount = 10;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });
});

// ── Skip-preprocess logic ──────────────────────────────────────────────

describe("skip-preprocess logic for metadata tools", () => {
  it("skips preprocess for edit-metadata", () => {
    const toolId = "edit-metadata";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(true);
  });

  it("skips preprocess for strip-metadata", () => {
    const toolId = "strip-metadata";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(true);
  });

  it("does not skip preprocess for resize", () => {
    const toolId = "resize";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(false);
  });

  it("does not skip preprocess for compress", () => {
    const toolId = "compress";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(false);
  });
});

// ── Output filename suffix logic ───────────────────────────────────────

describe("batch output filename suffix", () => {
  function addToolSuffix(filename: string, processFilename: string, toolId: string): string {
    let outFilename = filename;
    if (outFilename === processFilename) {
      const dotIdx = processFilename.lastIndexOf(".");
      const ext = dotIdx > 0 ? processFilename.slice(dotIdx) : "";
      const base = ext ? processFilename.slice(0, -ext.length) : processFilename;
      outFilename = `${base}_${toolId}${ext}`;
    }
    return outFilename;
  }

  it("adds tool suffix when filename unchanged", () => {
    const result = addToolSuffix("photo.png", "photo.png", "resize");
    expect(result).toBe("photo_resize.png");
  });

  it("preserves filename when tool changed it", () => {
    const result = addToolSuffix("converted.jpg", "photo.png", "convert");
    expect(result).toBe("converted.jpg");
  });

  it("handles filenames without extension", () => {
    const result = addToolSuffix("README", "README", "compress");
    expect(result).toBe("README_compress");
  });

  it("handles filenames with multiple dots", () => {
    const result = addToolSuffix("my.photo.final.png", "my.photo.final.png", "sharpen");
    expect(result).toBe("my.photo.final_sharpen.png");
  });
});

// ── File results map construction ──────────────────────────────────────

describe("file results map (X-File-Results header)", () => {
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

  it("builds correct map for unique filenames", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      { buffer: Buffer.from("a"), filename: "a.png" },
      { buffer: Buffer.from("b"), filename: "b.png" },
      null,
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({
      "0": "a.png",
      "1": "b.png",
    });
  });

  it("deduplicates conflicting filenames", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      { buffer: Buffer.from("a"), filename: "photo.png" },
      { buffer: Buffer.from("b"), filename: "photo.png" },
      { buffer: Buffer.from("c"), filename: "photo.png" },
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({
      "0": "photo.png",
      "1": "photo_1.png",
      "2": "photo_2.png",
    });
  });

  it("skips null entries (failed files)", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      null,
      { buffer: Buffer.from("b"), filename: "ok.jpg" },
      null,
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({ "1": "ok.jpg" });
  });

  it("returns empty map when all files failed", () => {
    const results: null[] = [null, null, null];
    const _usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        fileResultsMap[String(i)] = "never";
      }
    }

    expect(fileResultsMap).toEqual({});
  });
});

// ── Progress state transitions ─────────────────────────────────────────

describe("batch progress status determination", () => {
  it("status is 'failed' when all files fail", () => {
    const totalFiles = 3;
    const failedFiles = 3;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("failed");
  });

  it("status is 'completed' when some files succeed", () => {
    const totalFiles = 3;
    const failedFiles = 1;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("completed");
  });

  it("status is 'completed' when no files fail", () => {
    const totalFiles = 5;
    const failedFiles = 0;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("completed");
  });
});

// ── Spooled batch ingress (#1239) ──────────────────────────────────────

describe("batch route spooled multipart ingress (#1239)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spoolMultipartFile.mockReset();
    mocks.readFile.mockReset();
    mocks.waitForJob.mockResolvedValue(null);
    mocks.validateImageBuffer.mockResolvedValue({ valid: true, format: "png" });
    mocks.autoOrient.mockImplementation(async (buf: Buffer) => buf);
    mocks.failBatchJob.mockResolvedValue(true);
  });

  async function invokeBatchRoute(opts: {
    section: string;
    toolId: string;
    log?: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
    parts: Array<
      | { type: "file"; filename: string; content: Buffer }
      | { type: "field"; fieldname: string; value: string }
    >;
  }) {
    let handler: ((req: unknown, rep: unknown) => Promise<unknown>) | undefined;
    await registerBatchRoutes({
      post: vi.fn((_url, _opts, fn) => {
        handler = fn;
      }),
    } as never);

    const request = {
      params: { section: opts.section, toolId: opts.toolId },
      headers: {},
      log: opts.log ?? { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { setTimeout: vi.fn() },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        for (const p of opts.parts) {
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

  it("spools non-OCR file parts to scratch and reads + removes each spooled file one at a time", async () => {
    const events: string[] = [];
    const uploadedPayloads: string[] = [];
    const spooledPaths: string[] = [];

    mocks.validateImageBuffer.mockImplementation(async (buf: Buffer, name: string) => {
      events.push(`validate:${name}:${buf.toString()}`);
      // By the time validation runs for file i, its spooled file has already been unlinked
      expect(existsSync(spooledPaths[spooledPaths.length - 1] ?? "")).toBe(false);
      return { valid: true, format: "png" };
    });
    mocks.putObject.mockImplementation(async (key: string, data: Buffer) => {
      events.push(`put:${key.split("/").pop()}`);
      uploadedPayloads.push(data.toString());
    });

    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "compress",
      parts: [
        { type: "file", filename: "first.png", content: Buffer.from("first-content") },
        { type: "file", filename: "second.png", content: Buffer.from("second-content") },
        { type: "field", fieldname: "settings", value: "{}" },
        { type: "field", fieldname: "clientJobId", value: "batch-spool-job" },
      ],
    });

    for (const call of mocks.readFile.mock.calls) {
      spooledPaths.push(String(call[0]));
    }

    expect(reply.statusCode).toBe(202);
    expect(mocks.spoolMultipartFile).toHaveBeenCalledTimes(2);
    expect(mocks.readFile).toHaveBeenCalledTimes(2);
    expect(uploadedPayloads).toEqual(["first-content", "second-content"]);
    expect(events).toEqual([
      "validate:first.png:first-content",
      "put:first.png",
      "validate:second.png:second-content",
      "put:second.png",
    ]);
    for (const p of spooledPaths) {
      expect(existsSync(p)).toBe(false);
    }
  });

  it("removes the spooled scratch file before validating or uploading the buffer", async () => {
    const events: string[] = [];
    mocks.spoolMultipartFile.mockImplementation(async (_part, scratchDir, index) => ({
      path: `${scratchDir}/${index}-scan.png`,
      filename: `scan-${index}.png`,
      size: 64,
    }));
    mocks.readFile.mockImplementation(async (path: unknown) => {
      events.push(`read:${String(path).split("/").pop()}`);
      return Buffer.from("fake-png-bytes");
    });
    mocks.rm.mockImplementation(async (path: unknown) => {
      const name = String(path).split("/").pop() ?? "";
      if (name.endsWith("-scan.png")) events.push(`rm:${name}`);
    });
    mocks.validateImageBuffer.mockImplementation(async () => {
      events.push("validate");
      return { valid: true, format: "png" };
    });

    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "compress",
      parts: [
        { type: "file", filename: "scan.png", content: Buffer.from("scan-content") },
        { type: "field", fieldname: "settings", value: "{}" },
      ],
    });

    expect(reply.statusCode).toBe(202);
    expect(events).toEqual(["read:0-scan.png", "rm:0-scan.png", "validate"]);
  });

  it("removes empty spooled files without calling readFile and preserves slot alignment", async () => {
    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "compress",
      parts: [
        { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
        { type: "file", filename: "real.png", content: Buffer.from("real-png") },
        { type: "field", fieldname: "settings", value: "{}" },
      ],
    });

    expect(reply.statusCode).toBe(202);
    expect(mocks.spoolMultipartFile).toHaveBeenCalledTimes(2);
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    expect(String(mocks.readFile.mock.calls[0]?.[0])).toMatch(/\/1-real\.png$/);
    expect(mocks.recordChildOutcome).toHaveBeenCalledWith(
      expect.any(String),
      2,
      "empty.png",
      "File is empty",
    );
  });

  it("keeps ocr-pdf batches on storeValidatedOcrPdf without reading the PDF into a Buffer", async () => {
    const reply = await invokeBatchRoute({
      section: "pdf",
      toolId: "ocr-pdf",
      parts: [
        { type: "file", filename: "scan.pdf", content: Buffer.from("%PDF-1.4 fake") },
        { type: "field", fieldname: "settings", value: '{"quality":"fast","pages":"1"}' },
        { type: "field", fieldname: "clientJobId", value: "ocr-pdf-batch-job" },
      ],
    });

    expect(reply.statusCode).toBe(202);
    expect(mocks.spoolMultipartFile).toHaveBeenCalledTimes(1);
    expect(mocks.storeValidatedOcrPdf).toHaveBeenCalledTimes(1);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("cleans up the spooled file, settles the staged batch, and deletes earlier uploads if readFile fails mid-batch", async () => {
    let callCount = 0;
    mocks.readFile.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return Buffer.from("first-ok");
      throw new Error("EIO: i/o error reading scratch file");
    });

    await expect(
      invokeBatchRoute({
        section: "image",
        toolId: "compress",
        parts: [
          { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
          { type: "file", filename: "second.png", content: Buffer.from("second-fail") },
          { type: "field", fieldname: "settings", value: "{}" },
          { type: "field", fieldname: "clientJobId", value: "mid-batch-read-fail" },
        ],
      }),
    ).rejects.toThrow("EIO: i/o error reading scratch file");

    expect(mocks.failBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "mid-batch-read-fail",
        totalFiles: 2,
        failedFiles: 2,
      }),
    );
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/mid-batch-read-fail-f0/first.png");
  });

  it("answers 413 with the OCR aggregate safety limit message when spooled OCR parts cross the aggregate cap", async () => {
    // Simulate a prior file having consumed all but 64 bytes of the 512 MB aggregate cap
    mocks.spoolMultipartFile
      .mockResolvedValueOnce({
        path: "/tmp/scratch/0-first.png",
        filename: "first.png",
        size: 512 * 1024 * 1024 - 64,
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

    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "ocr",
      parts: [
        { type: "file", filename: "first.png", content: Buffer.from("a") },
        { type: "file", filename: "second.png", content: Buffer.from("b") },
        { type: "field", fieldname: "settings", value: '{"quality":"fast"}' },
      ],
    });

    expect(reply.statusCode).toBe(413);
    expect(reply.payload).toEqual({
      error: "OCR batch input exceeds the 512 MB aggregate safety limit",
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("answers 413 with the per-file upload limit when a single OCR or non-OCR file exceeds fileMaxBytes", async () => {
    mocks.spoolMultipartFile.mockImplementation(async (_part, _scratchDir, _index, opts) => {
      throw Object.assign(
        new Error(`Object exceeds the maximum allowed size (${opts?.maxBytes} bytes)`),
        {
          statusCode: 413,
          limitBytes: opts?.maxBytes,
        },
      );
    });

    const ocrReply = await invokeBatchRoute({
      section: "image",
      toolId: "ocr",
      parts: [
        { type: "file", filename: "huge.png", content: Buffer.from("a") },
        { type: "field", fieldname: "settings", value: '{"quality":"fast"}' },
      ],
    });
    expect(ocrReply.statusCode).toBe(413);
    expect(ocrReply.payload).toEqual({
      error: "File exceeds the 100 MB upload limit",
    });

    const compressReply = await invokeBatchRoute({
      section: "image",
      toolId: "compress",
      parts: [
        { type: "file", filename: "huge.png", content: Buffer.from("a") },
        { type: "field", fieldname: "settings", value: "{}" },
      ],
    });
    expect(compressReply.statusCode).toBe(413);
    expect(compressReply.payload).toEqual({
      error: "File exceeds the 100 MB upload limit",
    });
  });

  it("logs a warning when failBatchJob matches no live row on all-prefail or mid-batch fault (#1555)", async () => {
    mocks.failBatchJob.mockResolvedValue(false);

    const allEmptyReply = await invokeBatchRoute({
      section: "image",
      toolId: "compress",
      parts: [
        { type: "file", filename: "empty.png", content: Buffer.alloc(0) },
        { type: "field", fieldname: "settings", value: "{}" },
        { type: "field", fieldname: "clientJobId", value: "batch-unapplied-prefail" },
      ],
    });
    expect(allEmptyReply.statusCode).toBe(422);
    expect(allEmptyReply.log.warn).toHaveBeenCalledWith(
      { jobId: "batch-unapplied-prefail" },
      expect.stringContaining("no terminal frame announced"),
    );

    let callCount = 0;
    mocks.readFile.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return Buffer.from("first-ok");
      throw new Error("EIO: i/o error reading scratch file");
    });

    const faultLog = { error: vi.fn(), warn: vi.fn() };
    await expect(
      invokeBatchRoute({
        section: "image",
        toolId: "compress",
        log: faultLog,
        parts: [
          { type: "file", filename: "first.png", content: Buffer.from("first-ok") },
          { type: "file", filename: "second.png", content: Buffer.from("second-fail") },
          { type: "field", fieldname: "settings", value: "{}" },
          { type: "field", fieldname: "clientJobId", value: "batch-unapplied-fault" },
        ],
      }),
    ).rejects.toThrow("EIO: i/o error reading scratch file");
    expect(faultLog.warn).toHaveBeenCalledWith(
      { jobId: "batch-unapplied-fault" },
      expect.stringContaining("no terminal frame announced"),
    );
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
    "rethrows a %s from spoolMultipartFile instead of answering locally (#1642)",
    async (_label, fault) => {
      mocks.spoolMultipartFile.mockRejectedValueOnce(fault);

      await expect(
        invokeBatchRoute({
          section: "image",
          toolId: "compress",
          parts: [{ type: "file", filename: "first.png", content: Buffer.from("a") }],
        }),
      ).rejects.toBe(fault);
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
    "strips internal paths from details on a 400 multipart parse failure (%s) (#1642)",
    async (_label, thrown) => {
      mocks.spoolMultipartFile.mockRejectedValueOnce(thrown);

      const reply = await invokeBatchRoute({
        section: "image",
        toolId: "compress",
        parts: [{ type: "file", filename: "first.png", content: Buffer.from("a") }],
      });

      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toEqual({
        error: "Failed to parse multipart request",
        details: "Unexpected end of form at [internal]",
      });
    },
  );

  it("decompresses .svgz, sanitizes SVG, and skips autoOrient on image batch uploads (#3083)", async () => {
    const uploadedPayloads: string[] = [];
    mocks.validateImageBuffer.mockResolvedValue({ valid: true, format: "svg" });
    mocks.putObject.mockImplementation(async (_key: string, data: Buffer) => {
      uploadedPayloads.push(data.toString("utf-8"));
    });

    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><rect width="100" height="100" fill="red"/></svg>',
      "utf-8",
    );
    const svgz = gzipSync(rawSvg);

    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "resize",
      parts: [
        { type: "file", filename: "dirty.svg", content: rawSvg },
        { type: "file", filename: "compressed.svgz", content: svgz },
        { type: "field", fieldname: "settings", value: "{}" },
      ],
    });

    expect(reply.statusCode).toBe(202);
    expect(uploadedPayloads).toHaveLength(2);
    for (const stored of uploadedPayloads) {
      expect(stored).toContain("<svg");
      expect(stored).not.toContain("<script");
      expect(stored).not.toContain("alert(1)");
    }
    expect(mocks.autoOrient).not.toHaveBeenCalled();

    uploadedPayloads.length = 0;
    const metaReply = await invokeBatchRoute({
      section: "image",
      toolId: "strip-metadata",
      parts: [
        { type: "file", filename: "meta.svgz", content: svgz },
        { type: "field", fieldname: "settings", value: "{}" },
      ],
    });
    expect(metaReply.statusCode).toBe(202);
    expect(uploadedPayloads).toHaveLength(1);
    expect(uploadedPayloads[0]).toContain("<svg");
    expect(uploadedPayloads[0]).not.toContain("<script");
    expect(mocks.autoOrient).not.toHaveBeenCalled();
  });

  it("records a preFailure and continues the batch when decompressSvgz or sanitizeSvg rejects (#3083)", async () => {
    const uploadedKeys: string[] = [];
    mocks.validateImageBuffer.mockImplementation(async (_buf: Buffer, name: string) => ({
      valid: true,
      format: name.endsWith(".png") ? "png" : "svg",
    }));
    mocks.putObject.mockImplementation(async (key: string) => {
      uploadedKeys.push(key);
    });

    const notSvgSvgz = gzipSync(Buffer.from("not an svg document", "utf-8"));
    const overElementSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
      "utf-8",
    );

    const reply = await invokeBatchRoute({
      section: "image",
      toolId: "resize",
      parts: [
        { type: "file", filename: "bad.svgz", content: notSvgSvgz },
        { type: "file", filename: "too-many.svg", content: overElementSvg },
        { type: "file", filename: "good.png", content: Buffer.from("good-png") },
        { type: "field", fieldname: "settings", value: "{}" },
        { type: "field", fieldname: "clientJobId", value: "batch-svg-prefail" },
      ],
    });

    expect(reply.statusCode).toBe(202);
    expect(uploadedKeys).toEqual(["uploads/batch-svg-prefail-f0/good.png"]);
    expect(mocks.recordChildOutcome).toHaveBeenCalledWith(
      "batch-svg-prefail",
      3,
      "bad.svgz",
      "SVGZ file does not contain valid SVG content after decompression",
    );
    expect(mocks.recordChildOutcome).toHaveBeenCalledWith(
      "batch-svg-prefail",
      3,
      "too-many.svg",
      "SVG exceeds maximum element count of 5000",
    );
    expect(mocks.autoOrient).toHaveBeenCalledTimes(1);
    expect(mocks.flowAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            flowChildCount: 1,
            fileIndexMap: [2],
          }),
        }),
      }),
    );
  });
});
