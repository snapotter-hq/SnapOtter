/**
 * #4337: html-to-image used to capture inside the HTTP request, so a slow page
 * held the request open with no job row, progress, or cancel. It now queues a
 * BullMQ job like the factory tools: 200 with the result inside the sync
 * window, 202 with the job id after it, and the HTML travels as the job's
 * input object instead of its settings.
 */
import { SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jobRows = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve(jobRows.rows),
      }),
    })),
  },
  schema: { settings: {}, jobs: { id: {}, status: {}, error: {}, userId: {}, type: {} } },
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>()),
  getSettingStrict: vi.fn(async () => "0"),
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: vi.fn(async () => ({})),
  insertToolJobAlias: vi.fn(async () => true),
  waitForJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  putObject: vi.fn(async () => {}),
  deletePrefix: vi.fn(async () => {}),
}));

vi.mock("../../../apps/api/src/lib/upload-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/upload-cleanup.js")>()),
  settleUnenqueuedAlias: vi.fn(async () => {}),
}));

vi.mock("../../../apps/api/src/lib/browser-service.js", () => ({
  isBrowserAvailable: vi.fn(() => true),
  captureHtml: vi.fn(async () => Buffer.from("html-png")),
  capturePage: vi.fn(async () => Buffer.from("url-png")),
}));

vi.mock("../../../apps/api/src/lib/ssrf.js", () => ({
  validateFetchUrl: vi.fn(async () => ({ resolvedIp: "93.184.216.34" })),
}));

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/permissions.js")>()),
  requireToolAccess: vi.fn(async () => ({ id: "user-1", username: "admin", role: "admin" })),
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  isToolAuditEnabled: vi.fn(async () => false),
  auditFromRequest: vi.fn(() => vi.fn()),
}));

import {
  enqueueToolJob,
  insertToolJobAlias,
  waitForJob,
} from "../../../apps/api/src/jobs/enqueue.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { selectJobDispatch } from "../../../apps/api/src/jobs/worker.js";
import {
  captureHtml,
  capturePage,
  isBrowserAvailable,
} from "../../../apps/api/src/lib/browser-service.js";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { validateFetchUrl } from "../../../apps/api/src/lib/ssrf.js";
import { settleUnenqueuedAlias } from "../../../apps/api/src/lib/upload-cleanup.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import {
  getDirectJobProcessFn,
  getRegisteredToolIds,
  getToolConfig,
} from "../../../apps/api/src/routes/tool-factory.js";
import {
  processHtmlToImage,
  registerHtmlToImage,
} from "../../../apps/api/src/routes/tools/html-to-image.js";

const URL_PATH = "/api/v1/tools/image/html-to-image";

async function buildApp() {
  const app = Fastify();
  registerErrorHandler(app);
  registerHtmlToImage(app);
  await app.ready();
  return app;
}

function enqueued(): ToolJobData {
  const calls = vi.mocked(enqueueToolJob).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][0] as ToolJobData;
}

function finishedJob(filename: string) {
  return {
    outputRefs: [`outputs/job/${filename}`],
    filename,
    contentType: "image/png",
    originalSize: 9,
    processedSize: 8,
    resultPayload: { originalSize: 0 },
  };
}

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(() => {
  vi.clearAllMocks();
  jobRows.rows = [];
  vi.mocked(isBrowserAvailable).mockReturnValue(true);
});

afterEach(async () => {
  await app?.close();
});

describe("html-to-image route queues a job (#4337)", () => {
  it("enqueues HTML as the job's input object, keeping it out of the settings", async () => {
    vi.mocked(waitForJob).mockResolvedValue(finishedJob("screenshot.png") as never);
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { html: "<h1>hi</h1>", format: "png" },
    });

    expect(res.statusCode, res.body).toBe(200);
    const job = enqueued();
    expect(job).toMatchObject({
      toolId: "html-to-image",
      kind: "tool",
      pool: "image",
      userId: "user-1",
      filename: "page.html",
      inputRefs: [`uploads/${job.jobId}/page.html`],
    });
    expect(job.settings).not.toHaveProperty("html");
    expect(job.settings).toMatchObject({ format: "png", devicePreset: "desktop" });
    expect(putObject).toHaveBeenCalledWith(
      `uploads/${job.jobId}/page.html`,
      Buffer.from("<h1>hi</h1>", "utf8"),
    );
    expect(captureHtml).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      jobId: job.jobId,
      downloadUrl: `/api/v1/download/${job.jobId}/screenshot.png`,
      originalSize: 0,
      processedSize: 8,
    });
  });

  it("enqueues a URL capture with the URL in its settings and as its input", async () => {
    vi.mocked(waitForJob).mockResolvedValue(finishedJob("screenshot.jpg") as never);
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { url: "https://example.com/", format: "jpg" },
    });

    expect(res.statusCode, res.body).toBe(200);
    const job = enqueued();
    expect(job.settings).toMatchObject({ url: "https://example.com/", format: "jpg" });
    expect(job.inputRefs).toEqual([`uploads/${job.jobId}/page.url`]);
    expect(validateFetchUrl).toHaveBeenCalledWith("https://example.com/");
    expect(capturePage).not.toHaveBeenCalled();
  });

  it("answers 202 with the job id when the sync window runs out", async () => {
    vi.mocked(waitForJob).mockResolvedValue(null as never);
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { html: "<p>slow</p>", clientJobId: "client-run-1" },
    });

    expect(res.statusCode, res.body).toBe(202);
    const job = enqueued();
    expect(job.clientJobId).toBe("client-run-1");
    expect(insertToolJobAlias).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.jobId, clientJobId: "client-run-1", pool: "image" }),
    );
    expect(res.json()).toEqual({
      jobId: "client-run-1",
      progressJobId: "client-run-1",
      artifactJobId: job.jobId,
      async: true,
      statusUrl: "/api/v1/jobs/client-run-1",
      progressUrl: "/api/v1/jobs/client-run-1/progress",
    });
  });

  it("answers the status and code the failed job's row carries", async () => {
    vi.mocked(waitForJob).mockRejectedValue(new Error("Page took too long to load"));
    jobRows.rows = [
      {
        status: "failed",
        error: {
          message: "Page took too long to load",
          httpStatus: 504,
          details: "Timeout 30000ms",
        },
      },
    ];
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: { html: "<p>x</p>" } });

    expect(res.statusCode).toBe(504);
    expect(res.json()).toMatchObject({
      error: "Page took too long to load",
      details: "Timeout 30000ms",
    });
  });

  it("answers the canceled shape when the job was canceled in the sync window", async () => {
    vi.mocked(waitForJob).mockRejectedValue(new Error("Canceled"));
    jobRows.rows = [{ status: "canceled", error: null }];
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: { html: "<p>x</p>" } });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "Canceled", canceled: true });
  });

  it("rejects bad settings, a bad clientJobId, a missing browser, and a blocked URL before queueing", async () => {
    app = await buildApp();
    const bad = await app.inject({ method: "POST", url: URL_PATH, payload: { format: "png" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("Invalid settings");

    const both = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { url: "https://example.com", html: "<p>x</p>" },
    });
    expect(both.statusCode).toBe(400);

    const badId = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { html: "<p>x</p>", clientJobId: "../escape" },
    });
    expect(badId.statusCode).toBe(400);

    vi.mocked(isBrowserAvailable).mockReturnValueOnce(false);
    const noBrowser = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { html: "<p>x</p>" },
    });
    expect(noBrowser.statusCode).toBe(503);
    expect(noBrowser.json().code).toBe("BROWSER_NOT_AVAILABLE");

    vi.mocked(validateFetchUrl).mockRejectedValueOnce(new Error("private address"));
    const blocked = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { url: "http://10.0.0.1/" },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error).toBe("URL is not allowed");

    expect(enqueueToolJob).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("discards the queued input and settles the alias when the input write fails", async () => {
    vi.mocked(putObject).mockRejectedValueOnce(
      new SafeError("Storage unavailable.", { statusCode: 503, code: "STORAGE_UNAVAILABLE" }),
    );
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { html: "<p>x</p>", clientJobId: "client-run-2" },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("STORAGE_UNAVAILABLE");
    expect(enqueueToolJob).not.toHaveBeenCalled();
    expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[0-9a-f-]+\/$/));
    expect(settleUnenqueuedAlias).toHaveBeenCalledWith(
      expect.any(String),
      "client-run-2",
      expect.anything(),
    );
  });
});

describe("html-to-image job process fn", () => {
  const ctx = (settings: Record<string, unknown>, source = "<p>queued</p>") => ({
    inputs: [
      { buffer: Buffer.from(source, "utf8"), filename: "page.html", ref: "uploads/j/page.html" },
    ],
    settings,
    scratchDir: "/tmp/unused",
    signal: new AbortController().signal,
    report: vi.fn(),
  });

  it("renders the queued HTML with the preset's viewport", async () => {
    const result = await processHtmlToImage(ctx({ format: "webp", devicePreset: "mobile" }));
    expect(captureHtml).toHaveBeenCalledWith("<p>queued</p>", {
      format: "webp",
      quality: 90,
      fullPage: false,
      viewportWidth: 375,
      viewportHeight: 812,
      isMobile: true,
    });
    expect(result).toEqual({
      buffer: Buffer.from("html-png"),
      filename: "screenshot.webp",
      contentType: "image/webp",
      resultPayload: { originalSize: 0 },
    });
  });

  it("captures the settings URL with a custom viewport", async () => {
    const result = await processHtmlToImage(
      ctx(
        {
          url: "https://example.com/",
          format: "jpg",
          quality: 40,
          fullPage: true,
          devicePreset: "custom",
          viewportWidth: 1920,
          viewportHeight: 1080,
        },
        "https://example.com/",
      ),
    );
    expect(capturePage).toHaveBeenCalledWith("https://example.com/", {
      format: "jpg",
      quality: 40,
      fullPage: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
      isMobile: false,
    });
    expect(captureHtml).not.toHaveBeenCalled();
    expect(result.filename).toBe("screenshot.jpg");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("keeps the inline route's statuses: 504 slow page, 503 browser down, 422 otherwise", async () => {
    vi.mocked(captureHtml).mockRejectedValueOnce(new Error("page.setContent: Timeout 30000ms"));
    await expect(processHtmlToImage(ctx({}))).rejects.toMatchObject({
      name: "InputValidationError",
      message: "Page took too long to load",
      statusCode: 504,
      details: "page.setContent: Timeout 30000ms",
    });

    vi.mocked(captureHtml).mockRejectedValueOnce(new Error("Browser is temporarily unavailable"));
    await expect(processHtmlToImage(ctx({}))).rejects.toMatchObject({
      message: "Screenshot service is temporarily unavailable",
      statusCode: 503,
      code: "BROWSER_CRASHED",
    });

    vi.mocked(captureHtml).mockRejectedValueOnce(
      new Error("net::ERR_ABORTED at /tmp/snapotter-scratch/page-1.html"),
    );
    await expect(processHtmlToImage(ctx({}))).rejects.toMatchObject({
      message: "Screenshot capture failed",
      statusCode: 422,
      details: expect.not.stringContaining("/tmp/snapotter-scratch"),
    });
  });

  it("lets a server fault that mentions a timeout through as itself, not a slow page", async () => {
    const storage = new SafeError("Storage write timeout.", {
      statusCode: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    vi.mocked(captureHtml).mockRejectedValueOnce(storage);
    await expect(processHtmlToImage(ctx({}))).rejects.toBe(storage);
  });
});

describe("html-to-image job dispatch", () => {
  it("runs from the direct-only registry, never the pipeline/batch one", async () => {
    app = await buildApp();
    expect(getDirectJobProcessFn("html-to-image")).toBe(processHtmlToImage);
    expect(getToolConfig("html-to-image")).toBeUndefined();
    expect(getRegisteredToolIds()).not.toContain("html-to-image");
    expect(selectJobDispatch("html-to-image", "tool")).toBe("registry");
  });
});
