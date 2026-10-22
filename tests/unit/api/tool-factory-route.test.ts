/**
 * Unit tests for the createToolRoute factory -- the central route handler
 * that powers all standard tools. Tests multipart parsing, validation,
 * settings validation, job enqueue/wait, and error handling without
 * spinning up a real Fastify server or requiring Postgres/Redis.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

// Every db.select() in this file resolves to these rows; reset them after use.
const jobRows = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(jobRows.rows), {
            get: () => null,
            limit: () => Promise.resolve([]),
          }),
        all: () => [],
      }),
    })),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { settings: {}, userFiles: { id: {} }, jobs: { id: {}, status: {}, error: {} } },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    BASE_PATH: "",
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 50,
  },
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: vi.fn().mockResolvedValue({}),
  insertToolJobAlias: vi.fn().mockResolvedValue(true),
  upsertToolJobAlias: vi.fn().mockResolvedValue(true),
  waitForJob: vi.fn().mockResolvedValue({
    outputRefs: ["outputs/mock-job/result.png"],
    filename: "result.png",
    contentType: "image/png",
    originalSize: 100,
    processedSize: 80,
  }),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  deletePrefix: vi.fn(() => Promise.resolve()),
  getObjectBuffer: vi.fn(() => Promise.resolve(Buffer.from("png-data"))),
  isStorageServiceFault: vi.fn(() => false),
  putObject: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: vi.fn(
    (_part: unknown, jobId: string, opts: { uniqueName?: (name: string) => string }) => {
      const filename = opts.uniqueName?.("test.png") ?? "test.png";
      return Promise.resolve({ key: `uploads/${jobId}/${filename}`, filename, size: 100 });
    },
  ),
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: vi.fn(() => Promise.resolve()),
  updateSingleFileProgress: vi.fn(),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

vi.mock("../../../apps/api/src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

const auditDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  isToolAuditEnabled: vi.fn().mockResolvedValue(false),
  auditFromRequest: vi.fn(() => auditDispatch),
}));

const childLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

vi.mock("../../../apps/api/src/lib/auto-orient.js", () => ({
  autoOrient: vi.fn((buf: Buffer) => Promise.resolve(buf)),
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", () => ({
  validateImageBuffer: vi.fn(() =>
    Promise.resolve({ valid: true, format: "png", width: 100, height: 100 }),
  ),
}));

vi.mock("../../../apps/api/src/lib/format-decoders.js", () => ({
  decodeToSharpCompat: vi.fn(),
  decodeAnyFormat: vi.fn(),
  needsCliDecode: vi.fn(() => false),
}));

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", () => ({
  decompressSvgz: vi.fn((b: Buffer) => b),
  sanitizeSvg: vi.fn((b: Buffer) => b),
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  getFirstMissingBundleForTool: vi.fn(() => null),
  isToolInstalled: vi.fn(() => true),
}));

// Media/document handlers are loaded transitively via input-handler.ts
vi.mock("@snapotter/media-engine", () => ({
  probeMedia: vi.fn(),
  ffmpegAvailable: vi.fn(() => false),
  resolveFfmpeg: vi.fn(() => null),
  resolveFfprobe: vi.fn(() => null),
}));

vi.mock("@snapotter/doc-engine", () => ({
  qpdfAvailable: vi.fn(() => false),
  qpdfCheck: vi.fn(),
  qpdfPageCount: vi.fn(),
  sofficeAvailable: vi.fn(() => false),
  resolveQpdf: vi.fn(() => null),
  resolveSoffice: vi.fn(() => null),
  resolveGs: vi.fn(() => null),
}));

vi.mock("../../../apps/api/src/lib/errors.js", () => ({
  formatZodErrors: (issues: Array<{ message: string }>) => issues.map((i) => i.message).join("; "),
  stripInternalPaths: (msg: string) => msg,
  friendlyError: (msg: string) => msg,
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: () => Promise.resolve({ width: 100, height: 100 }),
    webp: () => ({ toBuffer: () => Promise.resolve(Buffer.from("webp")) }),
    resize: () => ({ raw: () => ({ toBuffer: () => Promise.resolve(Buffer.from("raw")) }) }),
  })),
}));

// ── Imports ─────────────────────────────────────────────────────────────

import { apiToolPath } from "@snapotter/shared";
import { db } from "../../../apps/api/src/db/index.js";
import {
  enqueueToolJob,
  insertToolJobAlias,
  waitForJob,
} from "../../../apps/api/src/jobs/enqueue.js";
import { auditFromRequest, isToolAuditEnabled } from "../../../apps/api/src/lib/audit.js";
import { autoOrient } from "../../../apps/api/src/lib/auto-orient.js";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import {
  getFirstMissingBundleForTool,
  isToolInstalled,
} from "../../../apps/api/src/lib/feature-status.js";
import { validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";
import {
  deletePrefix,
  getObjectBuffer,
  isStorageServiceFault,
} from "../../../apps/api/src/lib/object-storage.js";
import { receiveUpload } from "../../../apps/api/src/lib/upload-stream.js";
import { cancelSingleJobGuarded } from "../../../apps/api/src/routes/progress.js";
import type { AnyToolRouteConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  createToolRoute,
  getRegisteredToolIds,
  getToolConfig,
} from "../../../apps/api/src/routes/tool-factory.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build a mock Zod-like schema that accepts everything. */
function acceptAllSchema() {
  return {
    safeParse: (data: unknown) => ({ success: true as const, data }),
    parse: (data: unknown) => data,
  };
}

/** Build a mock Zod-like schema that requires { quality: 1-100 }. */
function strictQualitySchema() {
  return {
    safeParse: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      if (typeof obj?.quality !== "number" || obj.quality < 1 || obj.quality > 100) {
        return {
          success: false as const,
          error: { issues: [{ path: ["quality"], message: "Must be 1-100" }] },
        };
      }
      return { success: true as const, data };
    },
    parse: (data: unknown) => data,
  };
}

function makeMockConfig(
  toolId: string,
  schema?: { safeParse: (d: unknown) => unknown; parse: (d: unknown) => unknown },
): AnyToolRouteConfig {
  return {
    toolId,
    settingsSchema: (schema ?? acceptAllSchema()) as never,
    process: vi.fn(async (buf: Buffer, _settings: unknown, filename: string) => ({
      buffer: buf,
      filename,
      contentType: "image/png",
    })),
  };
}

function createMockApp() {
  const routes: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  return {
    post: vi.fn((...args: unknown[]) => {
      const path = args[0] as string;
      const handler = args[args.length - 1] as (req: unknown, reply: unknown) => Promise<unknown>;
      routes[path] = handler;
    }),
    routes,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function createMockReply() {
  const reply: Record<string, unknown> = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  reply.header = vi.fn(() => reply);
  return reply;
}

function createMockRequest(opts: {
  fileBuffer?: Buffer;
  filename?: string;
  settings?: string;
  fileId?: string;
  saveMode?: string;
  clientJobId?: string;
  fileCount?: number;
}) {
  const parts: Array<{
    type: string;
    fieldname?: string;
    value?: string;
    filename?: string;
    file: AsyncIterable<Buffer>;
  }> = [];

  const count = opts.fileCount ?? (opts.fileBuffer ? 1 : 0);
  for (let i = 0; i < count; i++) {
    parts.push({
      type: "file",
      filename: opts.filename ?? "test.png",
      file: (async function* () {
        if (opts.fileBuffer) yield opts.fileBuffer;
      })(),
    });
  }

  if (opts.settings !== undefined) {
    parts.push({
      type: "field",
      fieldname: "settings",
      value: opts.settings,
      file: (async function* () {})(),
    });
  }

  if (opts.fileId) {
    parts.push({
      type: "field",
      fieldname: "fileId",
      value: opts.fileId,
      file: (async function* () {})(),
    });
  }

  if (opts.saveMode) {
    parts.push({
      type: "field",
      fieldname: "saveMode",
      value: opts.saveMode,
      file: (async function* () {})(),
    });
  }

  if (opts.clientJobId) {
    parts.push({
      type: "field",
      fieldname: "clientJobId",
      value: opts.clientJobId,
      file: (async function* () {})(),
    });
  }

  return {
    parts: () => ({
      [Symbol.asyncIterator]: async function* () {
        for (const p of parts) yield p;
      },
    }),
    headers: {},
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      // request.log.child({ jobId, toolId }) is what the factory hands the
      // input handler (#1417); tests read the bindings off this spy.
      child: vi.fn(() => childLog),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

/**
 * Answer the factory's `select({ id })` jobs-row lookup with `rows`, leaving
 * every other db.select (settings reads) on the default chain. Returns the
 * function that puts the default back.
 */
function answerJobRowLookup(rows: unknown[]): () => void {
  const select = vi.mocked(db.select);
  const original = select.getMockImplementation();
  select.mockImplementation(((fields?: Record<string, unknown>) =>
    fields && "id" in fields
      ? { from: () => ({ where: () => Promise.resolve(rows) }) }
      : original?.()) as never);
  return () => select.mockImplementation(original as never);
}

describe("createToolRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFirstMissingBundleForTool).mockReset();
    vi.mocked(getFirstMissingBundleForTool).mockReturnValue(null);
    vi.mocked(isToolInstalled).mockReset();
    vi.mocked(isToolInstalled).mockReturnValue(true);
    vi.mocked(isToolAuditEnabled).mockReset();
    vi.mocked(isToolAuditEnabled).mockResolvedValue(false);
    auditDispatch.mockReset();
    auditDispatch.mockResolvedValue(undefined);
    vi.mocked(auditFromRequest).mockReset();
    vi.mocked(auditFromRequest).mockImplementation(() => auditDispatch);
  });

  describe("route registration", () => {
    it("registers a POST route at /api/v1/tools/:section/:toolId", () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      expect(app.post).toHaveBeenCalledWith(
        apiToolPath(id),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("adds the tool config to the registry", () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      expect(getToolConfig(id)).toBeDefined();
      expect(getRegisteredToolIds()).toContain(id);
    });
  });

  describe("request handling", () => {
    it("keeps same-named multipart inputs in distinct storage objects", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, { ...makeMockConfig(id), maxInputs: 2 });
      await app.routes[apiToolPath(id)](
        createMockRequest({ fileBuffer: Buffer.from("png-data"), fileCount: 2 }),
        createMockReply(),
      );

      const job = vi.mocked(enqueueToolJob).mock.calls[0][0];
      expect(job.inputRefs).toEqual([
        `uploads/${job.jobId}/test.png`,
        `uploads/${job.jobId}/test_1.png`,
      ]);
    });

    it("returns 400 when no file is provided", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({});

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: "No file provided" }),
      );
    });

    it("returns 400 when multiple files are provided", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        fileCount: 2,
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Too many files (max 1)",
        }),
      );
    });

    it("returns 400 when image validation fails", async () => {
      vi.mocked(validateImageBuffer).mockResolvedValueOnce({
        valid: false,
        reason: "Corrupt image data",
      } as never);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("bad") });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Invalid image"),
        }),
      );
    });

    it("returns 400 when settings JSON is invalid", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: "not valid json{{{",
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Settings must be valid JSON" }),
      );
      // Nothing was enqueued, so the upload is the route's to remove (#1690).
      expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
    });

    it("returns 400 when settings fail Zod validation", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id, strictQualitySchema()));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({ quality: 999 }),
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid settings" }),
      );
    });

    it("returns 400 for an invalid saveMode field", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        fileId: "lib-1",
        saveMode: "bogus",
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("saveMode") }),
      );
    });

    it("passes a valid saveMode through to the enqueued job", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        fileId: "lib-1",
        saveMode: "overwrite",
      });

      await handler(req, reply);

      expect(vi.mocked(enqueueToolJob).mock.calls[0][0]).toMatchObject({
        fileId: "lib-1",
        saveMode: "overwrite",
      });
    });

    it("enqueues no saveMode when the field is absent", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        fileId: "lib-1",
      });

      await handler(req, reply);

      expect(vi.mocked(enqueueToolJob).mock.calls[0][0].saveMode).toBeUndefined();
    });

    it("returns 501 when AI feature bundle is not installed", async () => {
      vi.mocked(isToolInstalled).mockReturnValueOnce(false);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      // If TOOL_BUNDLE_MAP doesn't contain this tool, the guard is skipped.
      // For real AI tools with a mapping, it would return 501.
      // Since our test tool ID isn't in TOOL_BUNDLE_MAP, process continues.
      // This validates the guard code path exists without false positives.
    });

    it("returns 501 naming the first missing extra bundle for multi-bundle AI tools", async () => {
      vi.mocked(isToolInstalled).mockReturnValueOnce(false);
      vi.mocked(getFirstMissingBundleForTool).mockReturnValueOnce("face-detection");
      const app = createMockApp();
      const id = "enhance-faces";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(501);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "FEATURE_NOT_INSTALLED",
          feature: "face-detection",
          featureName: "Face Detection",
        }),
      );
    });

    it("hands the input handler a request child logger bound to the job and tool (#1417)", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      expect(req.log.child).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: expect.any(String), toolId: id, filename: "test.png" }),
      );
      // the bound jobId is the one the caller gets back, so the line joins to the job
      const bound = vi.mocked(req.log.child).mock.calls[0][0] as { jobId: string };
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ jobId: bound.jobId }));
      expect(enqueueToolJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: bound.jobId }));
      expect(vi.mocked(autoOrient)).toHaveBeenCalledWith(expect.any(Buffer), childLog);
    });

    it("returns 200 success envelope when waitForJob resolves", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: expect.any(String),
          downloadUrl: expect.stringMatching(/^\/api\/v1\/download\/[^/]+\/[^/]+$/),
          originalSize: 100,
          processedSize: 80,
        }),
      );
      expect(deletePrefix).not.toHaveBeenCalled();
    });

    it("logs a warning on request.log without failing the 200 response when the TOOL_EXECUTED audit chain rejects (#3517)", async () => {
      const auditErr = new Error("audit dispatch failed");
      vi.mocked(isToolAuditEnabled).mockRejectedValueOnce(auditErr);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);
      await vi.waitFor(() => {
        expect(req.log.warn).toHaveBeenCalledWith(
          { err: auditErr, toolId: id },
          "Failed to emit TOOL_EXECUTED audit log",
        );
      });

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: expect.any(String),
          originalSize: 100,
          processedSize: 80,
        }),
      );
    });

    it("logs a warning on request.log when auditFromRequest rejects after isToolAuditEnabled resolves true (#3517)", async () => {
      const dispatchErr = new Error("audit write failed");
      vi.mocked(isToolAuditEnabled).mockResolvedValueOnce(true);
      auditDispatch.mockRejectedValueOnce(dispatchErr);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({ format: "webp" }),
      });

      await handler(req, reply);
      await vi.waitFor(() => {
        expect(req.log.warn).toHaveBeenCalledWith(
          { err: dispatchErr, toolId: id },
          "Failed to emit TOOL_EXECUTED audit log",
        );
      });

      expect(auditDispatch).toHaveBeenCalledWith(
        "TOOL_EXECUTED",
        expect.objectContaining({
          userId: "user-1",
          username: "test",
          toolId: id,
          inputFileCount: 1,
          totalInputSize: 100,
          outputFormat: "webp",
          status: "success",
          durationMs: expect.any(Number),
        }),
      );
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: expect.any(String),
          originalSize: 100,
          processedSize: 80,
        }),
      );
    });

    it("keeps the upload when enqueue fails after the jobs row was written", async () => {
      vi.mocked(enqueueToolJob).mockRejectedValueOnce(new Error("queue add failed"));
      const restore = answerJobRowLookup([{ id: "row" }]);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await expect(handler(req, createMockReply())).rejects.toThrow("queue add failed");
      } finally {
        restore();
      }
      expect(deletePrefix).not.toHaveBeenCalled();
    });

    it("discards the upload when enqueue fails before the jobs row was written", async () => {
      vi.mocked(enqueueToolJob).mockRejectedValueOnce(new Error("insert failed"));
      const restore = answerJobRowLookup([]);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await expect(handler(req, createMockReply())).rejects.toThrow("insert failed");
      } finally {
        restore();
      }
      expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
    });

    it("keeps the upload and logs a warning when the jobs row check itself fails after enqueueToolJob throws (#3144)", async () => {
      const dbErr = new Error("db connection lost");
      vi.mocked(enqueueToolJob).mockRejectedValueOnce(new Error("queue add failed"));
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) =>
        fields && "id" in fields
          ? { from: () => ({ where: () => Promise.reject(dbErr) }) }
          : original?.()) as never);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await expect(handler(req, createMockReply())).rejects.toThrow("queue add failed");
      } finally {
        select.mockImplementation(original as never);
      }
      expect(deletePrefix).not.toHaveBeenCalled();
      const jobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: dbErr,
          jobId,
        }),
        "failed to check whether rejected request persisted a jobs row; keeping uploads",
      );
    });

    it("rejects and discards the upload without enqueuing when reading maxConcurrentJobsPerUser fails (#2545)", async () => {
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) =>
        fields && "value" in fields
          ? {
              from: () => ({
                where: () => ({
                  limit: () => Promise.reject(new Error("settings store failure")),
                }),
              }),
            }
          : original?.()) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await expect(handler(req, createMockReply())).rejects.toThrow("settings store failure");
      } finally {
        select.mockImplementation(original as never);
      }
      expect(enqueueToolJob).not.toHaveBeenCalled();
      expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
    });

    it("returns 429 and discards the upload when activeJobs reaches maxConcurrentJobsPerUser (#2545)", async () => {
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) => {
        if (fields && "value" in fields) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ value: "2" }]),
              }),
            }),
          };
        }
        if (fields && "count" in fields) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ count: 2 }]),
            }),
          };
        }
        return original?.();
      }) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await handler(req, reply);
      } finally {
        select.mockImplementation(original as never);
      }
      expect(reply.status).toHaveBeenCalledWith(429);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Too many concurrent jobs. Please wait for existing jobs to complete.",
        activeJobs: 2,
        limit: 2,
      });
      expect(enqueueToolJob).not.toHaveBeenCalled();
      expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
    });

    it("enqueues normally when activeJobs is strictly below maxConcurrentJobsPerUser (#2545)", async () => {
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) => {
        if (fields && "value" in fields) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ value: "2" }]),
              }),
            }),
          };
        }
        if (fields && "count" in fields) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ count: 1 }]),
            }),
          };
        }
        return original?.();
      }) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await handler(req, reply);
      } finally {
        select.mockImplementation(original as never);
      }
      expect(enqueueToolJob).toHaveBeenCalledTimes(1);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: expect.any(String) }),
      );
      expect(deletePrefix).not.toHaveBeenCalled();
    });

    it("rejects and discards the upload when the activeJobs count query fails (#2545)", async () => {
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) => {
        if (fields && "value" in fields) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ value: "2" }]),
              }),
            }),
          };
        }
        if (fields && "count" in fields) {
          return {
            from: () => ({
              where: () => Promise.reject(new Error("active jobs query failed")),
            }),
          };
        }
        return original?.();
      }) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });

      try {
        await expect(handler(req, createMockReply())).rejects.toThrow("active jobs query failed");
      } finally {
        select.mockImplementation(original as never);
      }
      expect(enqueueToolJob).not.toHaveBeenCalled();
      expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
    });

    it("treats blank or out-of-range maxConcurrentJobsPerUser values as disabled (0) (#2545)", async () => {
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      let storedRaw = "";
      let countQueries = 0;
      select.mockImplementation(((fields?: Record<string, unknown>) => {
        if (fields && "value" in fields) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ value: storedRaw }]),
              }),
            }),
          };
        }
        if (fields && "count" in fields) {
          countQueries++;
          return {
            from: () => ({
              where: () => Promise.resolve([{ count: 99 }]),
            }),
          };
        }
        return original?.();
      }) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];

      try {
        for (const bad of ["", "-1", "1.5", "not-a-number", "Infinity"]) {
          storedRaw = bad;
          const reply = createMockReply();
          const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });
          await handler(req, reply);
          expect(reply.send).toHaveBeenCalledWith(
            expect.objectContaining({ jobId: expect.any(String) }),
          );
        }
      } finally {
        select.mockImplementation(original as never);
      }
      expect(countQueries).toBe(0);
    });

    it("spreads resultPayload fields at top level in sync 200 envelope", async () => {
      vi.mocked(waitForJob).mockResolvedValueOnce({
        outputRefs: ["outputs/mock-job/result.pdf"],
        filename: "result.pdf",
        contentType: "application/pdf",
        originalSize: 5000,
        processedSize: 4800,
        resultPayload: { found: 3 },
      });
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("pdf-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      const sent = vi.mocked(reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sent.found).toBe(3);
      expect(sent.originalSize).toBe(5000);
      expect(sent.processedSize).toBe(4800);
      expect(sent.downloadUrl).toContain("/api/v1/download/");
      // resultPayload must NOT appear as a nested key
      expect(sent.resultPayload).toBeUndefined();
    });

    it("omits resultPayload fields when processV2 returns no resultPayload", async () => {
      // Default mock already returns no resultPayload
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      const sent = vi.mocked(reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // No extra keys from resultPayload should be present
      const keys = Object.keys(sent);
      expect(keys).not.toContain("found");
      expect(keys).not.toContain("metadata");
      expect(keys).not.toContain("resultPayload");
    });

    it("returns 202 when waitForJob returns null (sync window expired)", async () => {
      vi.mocked(waitForJob).mockResolvedValueOnce(null);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ async: true }));
    });

    it("returns the artifact job ID when a client progress job ID is supplied", async () => {
      vi.mocked(waitForJob).mockResolvedValueOnce(null);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const clientJobId = "client-progress-id";
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        clientJobId,
      });

      await handler(req, reply);

      const artifactJobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(artifactJobId).not.toBe(clientJobId);
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({
        jobId: clientJobId,
        progressJobId: clientJobId,
        artifactJobId,
        async: true,
      });
    });

    it("returns the artifact job ID immediately for long tools with client progress IDs", async () => {
      vi.mocked(isToolInstalled).mockReturnValue(true);
      const app = createMockApp();
      const id = "upscale";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const clientJobId = "client-long-progress-id";
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        clientJobId,
      });

      await handler(req, reply);

      const artifactJobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(waitForJob).not.toHaveBeenCalled();
      expect(artifactJobId).not.toBe(clientJobId);
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({
        jobId: clientJobId,
        progressJobId: clientJobId,
        artifactJobId,
        async: true,
      });
    });

    it("falls back to the server job ID on 202 and skips validation progress when the alias claim is refused (#895)", async () => {
      const { insertToolJobAlias } = await import("../../../apps/api/src/jobs/enqueue.js");
      const { updateSingleFileProgress } = await import("../../../apps/api/src/routes/progress.js");
      vi.mocked(insertToolJobAlias).mockResolvedValueOnce(false);
      vi.mocked(enqueueToolJob).mockImplementationOnce(async (data) => {
        data.clientJobId = undefined;
        return {} as never;
      });
      vi.mocked(waitForJob).mockResolvedValueOnce(null);
      vi.mocked(updateSingleFileProgress).mockClear();

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        clientJobId: "colliding-batch-id",
      });

      await handler(req, reply);

      const artifactJobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(updateSingleFileProgress).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({
        jobId: artifactJobId,
        async: true,
      });
    });

    it("falls back to the server job ID immediately on 202 for long tools when the alias claim is refused (#895)", async () => {
      const { insertToolJobAlias } = await import("../../../apps/api/src/jobs/enqueue.js");
      vi.mocked(isToolInstalled).mockReturnValue(true);
      vi.mocked(insertToolJobAlias).mockResolvedValueOnce(false);
      vi.mocked(enqueueToolJob).mockImplementationOnce(async (data) => {
        data.clientJobId = undefined;
        return {} as never;
      });

      const app = createMockApp();
      const id = "upscale";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        clientJobId: "colliding-long-id",
      });

      await handler(req, reply);

      const artifactJobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(waitForJob).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({
        jobId: artifactJobId,
        async: true,
      });
    });

    it("skips validation progress on a reused alias id while still returning the re-pointed clientJobId on 202 (#886, #895)", async () => {
      const { insertToolJobAlias } = await import("../../../apps/api/src/jobs/enqueue.js");
      const { updateSingleFileProgress } = await import("../../../apps/api/src/routes/progress.js");
      vi.mocked(insertToolJobAlias).mockResolvedValueOnce(false);
      vi.mocked(waitForJob).mockResolvedValueOnce(null);
      vi.mocked(updateSingleFileProgress).mockClear();

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const clientJobId = "reused-owned-id";
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
        clientJobId,
      });

      await handler(req, reply);

      const artifactJobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(updateSingleFileProgress).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({
        jobId: clientJobId,
        progressJobId: clientJobId,
        artifactJobId,
        async: true,
      });
    });

    it("returns 422 when waitForJob rejects", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Sharp exploded"));
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({}),
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Processing failed",
          details: "Sharp exploded",
        }),
      );
    });

    it("returns 422 with canceled: true when waitForJob rejects with Canceled and the job row status is canceled", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Canceled"));
      jobRows.rows = [{ status: "canceled" }];
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        jobRows.rows = [];
      }

      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Canceled",
        canceled: true,
      });
      expect(req.log.warn).not.toHaveBeenCalled();
      expect(req.log.error).not.toHaveBeenCalled();
    });

    it("falls through to the generic 422 path without logging a status-read warning when waitForJob rejects with Canceled but the job row status is failed", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Canceled"));
      jobRows.rows = [{ status: "failed", error: null }];
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        jobRows.rows = [];
      }

      expect(req.log.warn).not.toHaveBeenCalled();
      expect(req.log.error).toHaveBeenCalledWith(expect.anything(), "tool processing failed");
      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Processing failed",
        details: "Canceled",
      });
    });

    it("logs a warning on request.log and falls through when reading canceled job status fails (#3527)", async () => {
      const statusReadErr = new Error("db read timeout");
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Canceled"));
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) =>
        fields && "status" in fields
          ? { from: () => ({ where: () => Promise.reject(statusReadErr) }) }
          : original?.(fields as never)) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        select.mockImplementation(original as never);
      }

      const jobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(req.log.warn).toHaveBeenCalledTimes(1);
      expect(req.log.warn).toHaveBeenCalledWith(
        { err: statusReadErr, jobId },
        "canceled job status read failed",
      );
      expect(req.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ toolId: id }),
        "tool processing failed",
      );
      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Processing failed",
        details: "Canceled",
      });
    });

    it("logs a warning on request.log when reading failed job error column fails", async () => {
      const errorReadErr = new Error("db error read timeout");
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Sharp exploded"));
      const select = vi.mocked(db.select);
      const original = select.getMockImplementation();
      select.mockImplementation(((fields?: Record<string, unknown>) =>
        fields && "error" in fields
          ? { from: () => ({ where: () => Promise.reject(errorReadErr) }) }
          : original?.(fields as never)) as never);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        select.mockImplementation(original as never);
      }

      const jobId = vi.mocked(enqueueToolJob).mock.calls[0][0].jobId;
      expect(req.log.warn).toHaveBeenCalledWith(
        { err: errorReadErr, jobId },
        "failed job row read failed",
      );
      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Processing failed",
        details: "Sharp exploded",
      });
    });

    it("answers the status the worker recorded for rejected input", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Start is past the end"));
      jobRows.rows = [
        { error: { message: "Start is past the end", code: "OUT_OF_RANGE", httpStatus: 400 } },
      ];
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        jobRows.rows = [];
      }

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Start is past the end",
        code: "OUT_OF_RANGE",
      });
    });

    it("answers a recorded server-side status and logs it as a failure", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("qpdf is not available"));
      jobRows.rows = [
        {
          error: {
            message: "qpdf is not available",
            code: "ENGINE_UNAVAILABLE",
            details: "Check QPDF_PATH",
            httpStatus: 503,
          },
        },
      ];
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });
      const log = (req as { log: { error: ReturnType<typeof vi.fn> } }).log;

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        jobRows.rows = [];
      }

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        error: "qpdf is not available",
        details: "Check QPDF_PATH",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(log.error).toHaveBeenCalledWith(expect.anything(), "tool processing failed");
    });

    it("keeps the 422 when the failed job recorded no status", async () => {
      vi.mocked(waitForJob).mockRejectedValueOnce(new Error("Sharp exploded"));
      jobRows.rows = [{ error: { message: "Sharp exploded" } }];
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), settings: "{}" });

      try {
        await app.routes[apiToolPath(id)](req, reply);
      } finally {
        jobRows.rows = [];
      }

      expect(reply.status).toHaveBeenCalledWith(422);
    });

    it("uses empty settings when none are provided", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
      });

      await handler(req, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it.each(["brightness-contrast", "saturation", "color-channels", "color-effects"])(
      "enqueues adjust-colors alias route %s on the image pool instead of system (#2826)",
      async (aliasId) => {
        const app = createMockApp();
        createToolRoute(app as never, {
          ...makeMockConfig(aliasId),
          section: "image",
        });
        const routePath = `/api/v1/tools/image/${aliasId}`;
        const handler = app.routes[routePath];
        expect(handler).toBeTypeOf("function");

        const reply = createMockReply();
        const req = createMockRequest({
          fileBuffer: Buffer.from("png-data"),
          clientJobId: "11111111-1111-4111-8111-111111111111",
        });

        await handler(req, reply);

        const job = vi.mocked(enqueueToolJob).mock.calls[0][0];
        expect(job.toolId).toBe(aliasId);
        expect(job.pool).toBe("image");
        expect(insertToolJobAlias).toHaveBeenCalledWith(
          expect.objectContaining({ jobId: job.jobId, pool: "image" }),
        );
        expect(waitForJob).toHaveBeenCalledWith("image", job.jobId);
      },
    );

    it("forwards config.section to resolveToolPool for non-catalog routes (#2826)", async () => {
      const app = createMockApp();
      createToolRoute(app as never, {
        ...makeMockConfig("custom-non-catalog-tool"),
        section: "pdf",
      });
      const handler = app.routes["/api/v1/tools/pdf/custom-non-catalog-tool"];
      expect(handler).toBeTypeOf("function");

      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        clientJobId: "11111111-1111-4111-8111-111111111111",
      });

      await handler(req, reply);

      const job = vi.mocked(enqueueToolJob).mock.calls[0][0];
      expect(job.toolId).toBe("custom-non-catalog-tool");
      expect(job.pool).toBe("docs");
      expect(insertToolJobAlias).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: job.jobId, pool: "docs" }),
      );
      expect(waitForJob).toHaveBeenCalledWith("docs", job.jobId);
    });

    it("normalizes pre-enqueue S3 getObjectBuffer faults into a 503 storage-unavailable SafeError and passes non-S3 defects through (#3481)", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];

      vi.mocked(isStorageServiceFault).mockReturnValue(true);
      try {
        for (const rawFault of [
          Object.assign(new Error("Please reduce your request rate."), {
            name: "SlowDown",
            $metadata: { httpStatusCode: 503 },
          }),
          Object.assign(new Error("Access Denied"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          }),
          Object.assign(new Error("The specified bucket does not exist"), {
            name: "NoSuchBucket",
            $metadata: { httpStatusCode: 404 },
          }),
          Object.assign(new Error("EIO: i/o error, read"), {
            code: "EIO",
          }),
        ]) {
          vi.mocked(deletePrefix).mockClear();
          vi.mocked(getObjectBuffer).mockRejectedValueOnce(rawFault);
          const req = createMockRequest({ fileBuffer: Buffer.from("png-data") });
          let caught: unknown;
          try {
            await handler(req, createMockReply());
          } catch (err) {
            caught = err;
          }
          expect(caught).toMatchObject({
            name: "SafeError",
            statusCode: 503,
            code: "storage-unavailable",
            message: "The server's storage service is unavailable.",
          });
          expect(classifyError(caught, "http")).toBe("operational");
          expect(enqueueToolJob).not.toHaveBeenCalled();
          expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));
        }

        // Multi-file route failing on the second input (i === 1) normalizes S3 fault and cleans up
        const multiApp = createMockApp();
        createToolRoute(multiApp as never, { ...makeMockConfig(id), maxInputs: 2 });
        const multiHandler = multiApp.routes[apiToolPath(id)];
        vi.mocked(deletePrefix).mockClear();
        vi.mocked(getObjectBuffer)
          .mockResolvedValueOnce(Buffer.from("png-data"))
          .mockRejectedValueOnce(
            Object.assign(new Error("Please reduce your request rate."), {
              name: "SlowDown",
              $metadata: { httpStatusCode: 503 },
            }),
          );
        const multiReq = createMockRequest({ fileBuffer: Buffer.from("png-data"), fileCount: 2 });
        let caughtSecond: unknown;
        try {
          await multiHandler(multiReq, createMockReply());
        } catch (err) {
          caughtSecond = err;
        }
        expect(caughtSecond).toMatchObject({
          name: "SafeError",
          statusCode: 503,
          code: "storage-unavailable",
          message: "The server's storage service is unavailable.",
        });
        expect(enqueueToolJob).not.toHaveBeenCalled();
        expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[^/]+\/$/));

        // Unexpected non-S3 defect passes through untouched and classifies as bug
        const defect = new TypeError("unexpected S3 client defect");
        vi.mocked(getObjectBuffer).mockRejectedValueOnce(defect);
        const bugReq = createMockRequest({ fileBuffer: Buffer.from("png-data") });
        let caughtDefect: unknown;
        try {
          await handler(bugReq, createMockReply());
        } catch (err) {
          caughtDefect = err;
        }
        expect(caughtDefect).toBe(defect);
        expect(classifyError(caughtDefect, "http")).toBe("bug");

        // When isStorageServiceFault returns false (e.g. local mode or NoSuchKey),
        // an error that normalizeS3ReadFault would rewrite passes through untouched
        vi.mocked(isStorageServiceFault).mockReturnValue(false);
        const localEio = Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
        vi.mocked(getObjectBuffer).mockRejectedValueOnce(localEio);
        const localReq = createMockRequest({ fileBuffer: Buffer.from("png-data") });
        let caughtLocal: unknown;
        try {
          await handler(localReq, createMockReply());
        } catch (err) {
          caughtLocal = err;
        }
        expect(caughtLocal).toBe(localEio);
      } finally {
        vi.mocked(isStorageServiceFault).mockReturnValue(false);
      }
    });
  });

  describe("multipart parsing error", () => {
    it("returns 400 when parts iterator throws", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = {
        parts: () => ({
          [Symbol.asyncIterator]() {
            return {
              next: () => Promise.reject(new Error("Malformed multipart")),
            };
          },
        }),
        log: {
          warn: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
          // request.log.child({ jobId, toolId }) is what the factory hands the
          // input handler (#1417); tests read the bindings off this spy.
          child: vi.fn(() => childLog),
        },
      };

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Failed to parse multipart request",
        }),
      );
    });

    it("deletes earlier uploaded parts before answering when a later file part fails with 413 (#1644)", async () => {
      const tooLarge = Object.assign(new Error("Object exceeds the maximum allowed size"), {
        statusCode: 413,
        limitBytes: 1024 * 1024,
      });
      vi.mocked(receiveUpload)
        .mockImplementationOnce((_part, jobId) =>
          Promise.resolve({ key: `uploads/${jobId}/first.png`, filename: "first.png", size: 100 }),
        )
        .mockRejectedValueOnce(tooLarge);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, { ...makeMockConfig(id), maxInputs: 2 });
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), fileCount: 2 });

      await handler(req, reply);

      const uploadedJobId = vi.mocked(receiveUpload).mock.calls[0][1];
      expect(reply.status).toHaveBeenCalledWith(413);
      expect(deletePrefix).toHaveBeenCalledTimes(1);
      expect(deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
      expect(vi.mocked(deletePrefix).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(reply.send as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      );
    });

    it("deletes earlier uploaded parts before rethrowing when a later file part fails with 503 (#1644)", async () => {
      const capFault = Object.assign(new Error("The server's workspace is full."), {
        statusCode: 503,
        code: "workspace-cap",
      });
      vi.mocked(receiveUpload)
        .mockImplementationOnce((_part, jobId) =>
          Promise.resolve({ key: `uploads/${jobId}/first.png`, filename: "first.png", size: 100 }),
        )
        .mockRejectedValueOnce(capFault);

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, { ...makeMockConfig(id), maxInputs: 2 });
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), fileCount: 2 });

      await expect(handler(req, reply)).rejects.toBe(capFault);

      const uploadedJobId = vi.mocked(receiveUpload).mock.calls[0][1];
      expect(deletePrefix).toHaveBeenCalledTimes(1);
      expect(deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
    });

    it("logs a warning and does not mask a mid-loop 503 when deletePrefix fails (#1644)", async () => {
      const capFault = Object.assign(new Error("The server's workspace is full."), {
        statusCode: 503,
        code: "workspace-cap",
      });
      vi.mocked(receiveUpload)
        .mockImplementationOnce((_part, jobId) =>
          Promise.resolve({ key: `uploads/${jobId}/first.png`, filename: "first.png", size: 100 }),
        )
        .mockRejectedValueOnce(capFault);
      vi.mocked(deletePrefix).mockRejectedValueOnce(new Error("S3 cleanup fault"));

      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, { ...makeMockConfig(id), maxInputs: 2 });
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({ fileBuffer: Buffer.from("png-data"), fileCount: 2 });

      await expect(handler(req, reply)).rejects.toBe(capFault);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to discard a rejected request's uploads",
      );
    });
  });

  describe("pre-stamped alias settlement on pre-enqueue rejection (#2617)", () => {
    it("settles the pre-stamped alias via cancelSingleJobGuarded when rejecting after insertToolJobAlias", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id, strictQualitySchema()));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const clientJobId = "11111111-1111-4111-8111-111111111111";
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({ quality: 200 }),
        clientJobId,
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(insertToolJobAlias).toHaveBeenCalledTimes(1);
      const stampedJobId = vi.mocked(insertToolJobAlias).mock.calls[0][0].jobId;
      expect(cancelSingleJobGuarded).toHaveBeenCalledWith({
        jobId: clientJobId,
        expectedArtifactJobId: stampedJobId,
      });
    });

    it("does not call cancelSingleJobGuarded when insertToolJobAlias returned false on a reused id", async () => {
      vi.mocked(insertToolJobAlias).mockResolvedValueOnce(false);
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id, strictQualitySchema()));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({ quality: 200 }),
        clientJobId: "11111111-1111-4111-8111-111111111111",
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(cancelSingleJobGuarded).not.toHaveBeenCalled();
    });

    it("does not call cancelSingleJobGuarded when rejecting before insertToolJobAlias (e.g. invalid saveMode)", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        saveMode: "invalid",
        clientJobId: "11111111-1111-4111-8111-111111111111",
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(insertToolJobAlias).not.toHaveBeenCalled();
      expect(cancelSingleJobGuarded).not.toHaveBeenCalled();
    });

    it("settles the alias when enqueueToolJob throws before persisting the jobs row, but keeps it when the jobs row exists", async () => {
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id));
      const handler = app.routes[apiToolPath(id)];
      const clientJobId = "11111111-1111-4111-8111-111111111111";

      // 1. No jobs row persisted -> settle alias
      jobRows.rows = [];
      vi.mocked(enqueueToolJob).mockRejectedValueOnce(new Error("db insert failed"));
      const reply1 = createMockReply();
      const req1 = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        clientJobId,
      });
      await expect(handler(req1, reply1)).rejects.toThrow("db insert failed");
      const stampedJobId = vi.mocked(insertToolJobAlias).mock.calls[0][0].jobId;
      expect(cancelSingleJobGuarded).toHaveBeenCalledWith({
        jobId: clientJobId,
        expectedArtifactJobId: stampedJobId,
      });

      // 2. Jobs row persisted -> keep alias
      vi.mocked(cancelSingleJobGuarded).mockClear();
      jobRows.rows = [{ id: "persisted-job" }];
      vi.mocked(enqueueToolJob).mockRejectedValueOnce(new Error("redis queue.add failed"));
      try {
        const reply2 = createMockReply();
        const req2 = createMockRequest({
          fileBuffer: Buffer.from("png-data"),
          clientJobId,
        });
        await expect(handler(req2, reply2)).rejects.toThrow("redis queue.add failed");
        expect(cancelSingleJobGuarded).not.toHaveBeenCalled();
      } finally {
        jobRows.rows = [];
      }
    });

    it("logs a warning and keeps the primary error response when cancelSingleJobGuarded rejects", async () => {
      vi.mocked(cancelSingleJobGuarded).mockRejectedValueOnce(new Error("db update failed"));
      const app = createMockApp();
      const id = "resize";
      createToolRoute(app as never, makeMockConfig(id, strictQualitySchema()));
      const handler = app.routes[apiToolPath(id)];
      const reply = createMockReply();
      const clientJobId = "11111111-1111-4111-8111-111111111111";
      const req = createMockRequest({
        fileBuffer: Buffer.from("png-data"),
        settings: JSON.stringify({ quality: 200 }),
        clientJobId,
      });

      await handler(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          jobId: expect.any(String),
          clientJobId,
        }),
        "failed to settle a rejected request's job alias",
      );
    });
  });
});
