/**
 * Unit tests for tool, batch, and pipeline audit logging across worker
 * completion handlers and inline custom HTTP routes (#3973).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auditEnabled: false,
  auditCalls: [] as Array<{
    event: string;
    details: Record<string, unknown>;
    ip: string | null;
    requestId: string | null;
  }>,
  userRows: [] as Array<{ username: string }>,
  selectThrows: false,
  auditThrows: false,
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: loggerMock,
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (state.selectThrows) return Promise.reject(new Error("users query failed"));
            return Promise.resolve(state.userRows);
          },
        }),
      }),
    }),
  },
  schema: {
    users: { id: "users.id", username: "users.username" },
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  isToolAuditEnabled: vi.fn(async () => state.auditEnabled),
  auditLog: vi.fn(
    async (
      _log: unknown,
      event: string,
      details: Record<string, unknown> = {},
      ip: string | null = null,
      requestId: string | null = null,
    ) => {
      if (state.auditThrows) throw new Error("audit write failed");
      state.auditCalls.push({ event, details, ip, requestId });
    },
  ),
  auditFromRequest: vi.fn(
    (req: { ip?: string; id?: string }) =>
      async (event: string, details: Record<string, unknown> = {}) => {
        if (state.auditThrows) throw new Error("audit write failed");
        state.auditCalls.push({
          event,
          details,
          ip: req.ip ?? null,
          requestId: req.id ?? null,
        });
      },
  ),
}));

import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import {
  bindJobAuditMetadata,
  emitInlineBatchAudit,
  emitInlineRequestAuditIfNeeded,
  emitWorkerBatchAudit,
  emitWorkerPipelineAudit,
  emitWorkerToolAudit,
  enterToolRequestAuditContext,
  markToolRequestEnqueued,
  resolveAuditUsername,
  subRouteFromRoute,
} from "../../../apps/api/src/lib/tool-audit.js";

describe("tool-audit helpers (#3973)", () => {
  beforeEach(() => {
    state.auditEnabled = false;
    state.auditCalls = [];
    state.userRows = [];
    state.selectThrows = false;
    state.auditThrows = false;
    loggerMock.warn.mockClear();
  });

  describe("subRouteFromRoute", () => {
    it("returns null for primary per-tool routes including /api/v1/tools/image/info", () => {
      expect(subRouteFromRoute("/api/v1/tools/image/resize")).toBeNull();
      expect(subRouteFromRoute("/api/v1/tools/image/info")).toBeNull();
      expect(subRouteFromRoute("/api/v1/tools/image/qr-generate")).toBeNull();
    });

    it("returns the third path segment for sub-routes", () => {
      expect(subRouteFromRoute("/api/v1/tools/:section/:toolId/batch")).toBe("batch");
      expect(subRouteFromRoute("/api/v1/tools/pdf/pdf-to-image/batch")).toBe("batch");
      expect(subRouteFromRoute("/api/v1/tools/pdf/pdf-to-image/info")).toBe("info");
      expect(subRouteFromRoute("/api/v1/tools/pdf/pdf-to-image/preview")).toBe("preview");
      expect(subRouteFromRoute("/api/v1/tools/image/edit-metadata/inspect")).toBe("inspect");
      expect(subRouteFromRoute("/api/v1/tools/image/passport-photo/analyze")).toBe("analyze");
      expect(subRouteFromRoute("/api/v1/tools/image/passport-photo/generate")).toBe("generate");
      expect(subRouteFromRoute("/api/v1/tools/image/remove-background/effects")).toBe("effects");
    });

    it("returns null for non-tool routes", () => {
      expect(subRouteFromRoute(undefined)).toBeNull();
      expect(subRouteFromRoute("/api/v1/pipeline/execute")).toBeNull();
    });
  });

  describe("resolveAuditUsername", () => {
    it("prefers explicit username without querying the database", async () => {
      await expect(resolveAuditUsername("u-1", "alice")).resolves.toBe("alice");
    });

    it("looks up username from users table when only userId is present", async () => {
      state.userRows = [{ username: "bob" }];
      await expect(resolveAuditUsername("u-2", undefined)).resolves.toBe("bob");
    });

    it("logs a warning and falls back to system when userId is null or lookup fails", async () => {
      await expect(resolveAuditUsername(null, undefined)).resolves.toBe("system");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      state.selectThrows = true;
      await expect(resolveAuditUsername("u-3", undefined)).resolves.toBe("system");
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u-3", err: expect.any(Error) }),
        "Failed to resolve username for tool audit log",
      );
    });
  });

  describe("worker audit emitters", () => {
    const baseJobData: ToolJobData = {
      jobId: "job-1",
      toolId: "compress-video",
      userId: "user-1",
      username: "admin",
      requestIp: "10.0.0.1",
      requestId: "req-1",
      pool: "media",
      inputRefs: ["uploads/job-1/clip.mp4"],
      filename: "clip.mp4",
      settings: { format: "mp4" },
      kind: "tool",
    };

    it("stays silent when tool audit is disabled", async () => {
      state.auditEnabled = false;
      await expect(
        emitWorkerToolAudit({
          data: baseJobData,
          inputFileCount: 1,
          totalInputSize: 1024,
          outputFormat: "mp4",
          durationMs: 250,
        }),
      ).resolves.toBe(true);
      await emitWorkerPipelineAudit({
        data: { ...baseJobData, kind: "pipeline-finalize", toolId: "pipeline" },
        totalSteps: 2,
        steps: ["resize", "compress"],
        totalInputSize: 1024,
        processedSize: 512,
        durationMs: 300,
      });
      await emitWorkerBatchAudit({
        data: { ...baseJobData, kind: "batch-finalize", toolId: "compress" },
        totalFiles: 3,
        completedFiles: 3,
        failedFiles: 0,
        processedSize: 2048,
        durationMs: 400,
      });
      expect(state.auditCalls).toHaveLength(0);
    });

    it("emits TOOL_EXECUTED, PIPELINE_EXECUTED, and BATCH_EXECUTED when enabled", async () => {
      state.auditEnabled = true;

      await expect(
        emitWorkerToolAudit({
          data: baseJobData,
          inputFileCount: 1,
          totalInputSize: 1024,
          outputFormat: "mp4",
          durationMs: 250,
        }),
      ).resolves.toBe(true);
      await emitWorkerPipelineAudit({
        data: { ...baseJobData, kind: "pipeline-finalize", toolId: "pipeline" },
        totalSteps: 2,
        steps: ["resize", "compress"],
        totalInputSize: 1024,
        processedSize: 512,
        durationMs: 300,
      });
      await emitWorkerBatchAudit({
        data: { ...baseJobData, kind: "batch-finalize", toolId: "compress" },
        totalFiles: 3,
        completedFiles: 2,
        failedFiles: 1,
        processedSize: 2048,
        durationMs: 400,
      });

      expect(state.auditCalls).toEqual([
        {
          event: "TOOL_EXECUTED",
          details: {
            userId: "user-1",
            username: "admin",
            toolId: "compress-video",
            inputFileCount: 1,
            totalInputSize: 1024,
            outputFormat: "mp4",
            status: "success",
            durationMs: 250,
          },
          ip: "10.0.0.1",
          requestId: "req-1",
        },
        {
          event: "PIPELINE_EXECUTED",
          details: {
            userId: "user-1",
            username: "admin",
            toolId: "pipeline",
            stepCount: 2,
            steps: ["resize", "compress"],
            inputFileCount: 1,
            totalInputSize: 1024,
            processedSize: 512,
            status: "success",
            durationMs: 300,
          },
          ip: "10.0.0.1",
          requestId: "req-1",
        },
        {
          event: "BATCH_EXECUTED",
          details: {
            userId: "user-1",
            username: "admin",
            toolId: "compress",
            inputFileCount: 3,
            totalFiles: 3,
            completedFiles: 2,
            failedFiles: 1,
            processedSize: 2048,
            status: "success",
            durationMs: 400,
          },
          ip: "10.0.0.1",
          requestId: "req-1",
        },
      ]);
    });

    it("logs a warning and returns false without throwing when auditLog rejects", async () => {
      state.auditEnabled = true;
      state.auditThrows = true;

      await expect(
        emitWorkerToolAudit({
          data: baseJobData,
          inputFileCount: 1,
          totalInputSize: 1024,
          outputFormat: "mp4",
          durationMs: 250,
        }),
      ).resolves.toBe(false);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ toolId: "compress-video", jobId: "job-1" }),
        "Failed to emit TOOL_EXECUTED audit log",
      );
    });
  });

  describe("inline request audit context and emitters", () => {
    function makeRequest() {
      return {
        ip: "192.0.2.10",
        id: "req-inline-1",
        log: loggerMock,
      };
    }

    it("emits TOOL_EXECUTED on 200 for inline custom tool routes and preserves context across async preHandler awaits", async () => {
      state.auditEnabled = true;
      const req = makeRequest();
      enterToolRequestAuditContext(req as never, {
        userId: "user-1",
        username: "admin",
        ip: req.ip,
        requestId: req.id,
        toolId: "qr-generate",
        subRoute: null,
        startTime: Date.now() - 15,
      });

      await emitInlineRequestAuditIfNeeded(
        req as never,
        200,
        JSON.stringify({ jobId: "j1", originalSize: 0, processedSize: 120 }),
      );
      // Second call on same request is a no-op
      await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");

      expect(state.auditCalls).toHaveLength(1);
      expect(state.auditCalls[0]).toMatchObject({
        event: "TOOL_EXECUTED",
        details: {
          userId: "user-1",
          username: "admin",
          toolId: "qr-generate",
          inputFileCount: 1,
          totalInputSize: 0,
          outputFormat: null,
          status: "success",
        },
        ip: "192.0.2.10",
        requestId: "req-inline-1",
      });

      // Simulate Fastify's async preHandler hook runner (chaining the route
      // handler onto the outer Promise returned by preHandler) and verify
      // bindJobAuditMetadata keeps the AsyncLocalStorage store after an await.
      state.auditCalls = [];
      const enqueuedReq = makeRequest();
      const preHandler = async () => {
        const ctx = enterToolRequestAuditContext(enqueuedReq as never, {
          userId: null,
          username: "system",
          ip: enqueuedReq.ip,
          requestId: enqueuedReq.id,
          toolId: "upscale",
          subRoute: null,
          startTime: Date.now(),
          authorized: false,
        });
        await new Promise((r) => setTimeout(r, 1));
        ctx.userId = "user-1";
        ctx.username = "admin";
        ctx.authorized = true;
      };

      const jobData: ToolJobData = {
        jobId: "j-ai",
        toolId: "upscale",
        userId: "user-1",
        pool: "ai",
        inputRefs: ["uploads/j-ai/in.png"],
        filename: "in.png",
        settings: {},
        kind: "ai-tool",
      };

      await preHandler().then(async () => {
        bindJobAuditMetadata(jobData);
        await emitInlineRequestAuditIfNeeded(enqueuedReq as never, 200, "{}");
      });

      expect(jobData.username).toBe("admin");
      expect(jobData.requestIp).toBe("192.0.2.10");
      expect(jobData.requestId).toBe("req-inline-1");
      expect(state.auditCalls).toHaveLength(0);
    });

    it("skips non-200 responses, unauthorized contexts, markToolRequestEnqueued, and non-inline sub-routes", async () => {
      state.auditEnabled = true;

      for (const subRoute of ["inspect", "info", "preview", "analyze", "effects", "batch"]) {
        const req = makeRequest();
        enterToolRequestAuditContext(req as never, {
          userId: "user-1",
          username: "admin",
          ip: req.ip,
          requestId: req.id,
          toolId: "pdf-to-image",
          subRoute,
          startTime: Date.now(),
        });
        await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");
      }

      const unauthReq = makeRequest();
      enterToolRequestAuditContext(unauthReq as never, {
        userId: null,
        username: "system",
        ip: unauthReq.ip,
        requestId: unauthReq.id,
        toolId: "qr-generate",
        subRoute: null,
        startTime: Date.now(),
        authorized: false,
      });
      await emitInlineRequestAuditIfNeeded(unauthReq as never, 200, "{}");

      const markedReq = makeRequest();
      enterToolRequestAuditContext(markedReq as never, {
        userId: "user-1",
        username: "admin",
        ip: markedReq.ip,
        requestId: markedReq.id,
        toolId: "resize",
        subRoute: null,
        startTime: Date.now(),
      });
      markToolRequestEnqueued(markedReq as never);
      await emitInlineRequestAuditIfNeeded(markedReq as never, 200, "{}");

      const errReq = makeRequest();
      enterToolRequestAuditContext(errReq as never, {
        userId: "user-1",
        username: "admin",
        ip: errReq.ip,
        requestId: errReq.id,
        toolId: "qr-generate",
        subRoute: null,
        startTime: Date.now(),
      });
      await emitInlineRequestAuditIfNeeded(errReq as never, 400, '{"error":"bad"}');

      expect(state.auditCalls).toHaveLength(0);
    });

    it("extracts inputFileCount from multi-file inline payloads and emits BATCH_EXECUTED for inline custom batch routes", async () => {
      state.auditEnabled = true;

      const renameReq = makeRequest();
      enterToolRequestAuditContext(renameReq as never, {
        userId: "user-1",
        username: "admin",
        ip: renameReq.ip,
        requestId: renameReq.id,
        toolId: "bulk-rename",
        subRoute: null,
        startTime: Date.now() - 10,
      });
      await emitInlineRequestAuditIfNeeded(
        renameReq as never,
        200,
        JSON.stringify({ inputFileCount: 3, originalSize: 450 }),
      );
      expect(state.auditCalls[0]?.details).toMatchObject({
        toolId: "bulk-rename",
        inputFileCount: 3,
        totalInputSize: 450,
      });

      state.auditCalls = [];
      const req = makeRequest();
      enterToolRequestAuditContext(req as never, {
        userId: "user-1",
        username: "admin",
        ip: req.ip,
        requestId: req.id,
        toolId: "svg-to-raster",
        subRoute: "batch",
        startTime: Date.now() - 20,
      });

      await emitInlineBatchAudit(req as never, {
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
      });

      expect(state.auditCalls).toHaveLength(1);
      expect(state.auditCalls[0]).toMatchObject({
        event: "BATCH_EXECUTED",
        details: {
          userId: "user-1",
          username: "admin",
          toolId: "svg-to-raster",
          inputFileCount: 2,
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          status: "success",
        },
        ip: "192.0.2.10",
        requestId: "req-inline-1",
      });
    });
  });
});
