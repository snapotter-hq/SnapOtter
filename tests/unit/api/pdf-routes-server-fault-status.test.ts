/**
 * #2120: pdf-to-image (single file) and image-to-pdf (one PDF per image, as a
 * ZIP) answered 422 for storage faults and logged nothing. A 5xx from a
 * storage write has to reach the error handler, and so does a failed read of
 * an output the route wrote a moment ago: that one is never the user's fault.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath, SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const getObjectStream = vi.fn();
const deletePrefix = vi.fn();
const dbInsertValues = vi.fn();
const failBatchJob = vi.fn();
const updateJobProgress = vi.fn();

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    getObjectStream: (...args: unknown[]) => getObjectStream(...args),
    deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => dbInsertValues(...args),
    }),
  },
  schema: { jobs: {} },
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  failBatchJob: (...args: unknown[]) => failBatchJob(...args),
  updateJobProgress: (...args: unknown[]) => updateJobProgress(...args),
}));

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => ({ id: "user-1" }) };
});

import { Readable } from "node:stream";
import { env } from "../../../apps/api/src/config.js";
import * as engineUnavailableMod from "../../../apps/api/src/lib/engine-unavailable.js";
import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerImageToPdf } from "../../../apps/api/src/routes/tools/image-to-pdf.js";
import { registerPdfToImage } from "../../../apps/api/src/routes/tools/pdf-to-image.js";
import { registerSvgToRasterRoute } from "../../../apps/api/src/routes/tools/svg-to-raster.js";

const PDF = readFileSync(join(__dirname, "../../fixtures/document/valid/test-3page.pdf"));

const logLines: string[] = [];

async function buildApp(register: (app: ReturnType<typeof Fastify>) => void) {
  logLines.length = 0;
  const app = Fastify({
    logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
  });
  await app.register(multipart);
  registerErrorHandler(app);
  register(app);
  await app.ready();
  return app;
}

function multipartBody(files: { name: string; type: string; data: Buffer }[], settings?: object) {
  const boundary = "----unit";
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.data,
      Buffer.from("\r\n"),
    );
  }
  if (settings) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const workspaceCap = () =>
  new SafeError("Workspace is full.", { statusCode: 503, code: "workspace-cap" });

describe("pdf-to-image single-file route", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("page"));
    deletePrefix.mockReset().mockResolvedValue(undefined);
  });

  const send = async (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.inject({
      method: "POST",
      url: apiToolPath("pdf-to-image"),
      ...multipartBody([{ name: "a.pdf", type: "application/pdf", data: PDF }], { dpi: 36 }),
    });

  it("answers the 503 a storage write carries instead of 422", async () => {
    putObject.mockRejectedValue(workspaceCap());
    const app = await buildApp(registerPdfToImage);
    const res = await send(app);

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("Workspace is full.");
    await app.close();
  });

  it("answers 500 when the pages it just wrote cannot be read back", async () => {
    getObjectBuffer.mockRejectedValue(new Error("read failed"));
    const app = await buildApp(registerPdfToImage);
    const res = await send(app);

    expect(getObjectBuffer).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("read failed");
    await app.close();
  });

  it("keeps the status of a read-back that already carries one", async () => {
    getObjectBuffer.mockRejectedValue(workspaceCap());
    const app = await buildApp(registerPdfToImage);

    expect((await send(app)).statusCode).toBe(503);
    await app.close();
  });

  it("answers 503 storage-unavailable when read-back fails with an S3 service fault", async () => {
    getObjectBuffer.mockRejectedValue({
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503 },
    });
    const app = await buildApp(registerPdfToImage);
    const res = await send(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    await app.close();
  });

  it("answers 500 when read-back reports the intermediate page missing (NoSuchKey)", async () => {
    getObjectBuffer.mockRejectedValue({
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    const app = await buildApp(registerPdfToImage);
    const res = await send(app);

    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it("still answers 422 and logs it when the render itself fails", async () => {
    const app = await buildApp(registerPdfToImage);
    // Valid header, nothing mupdf can open.
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("pdf-to-image"),
      ...multipartBody([
        {
          name: "bad.pdf",
          type: "application/pdf",
          data: Buffer.from("%PDF-1.4\nnot really a document"),
        },
      ]),
    });

    expect(res.statusCode).toBe(422);
    expect(logLines.some((line) => line.includes("PDF conversion failed"))).toBe(true);
    await app.close();
  });
});

describe("image-to-pdf ZIP of per-image PDFs", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset();
    deletePrefix.mockReset().mockResolvedValue(undefined);
  });

  const send = async (app: Awaited<ReturnType<typeof buildApp>>) => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    return app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(
        [
          { name: "a.png", type: "image/png", data: png },
          { name: "b.png", type: "image/png", data: png },
        ],
        { collate: false },
      ),
    });
  };

  it("answers 500 when an output it just wrote cannot be read back", async () => {
    getObjectBuffer.mockRejectedValue(new Error("read failed"));
    const app = await buildApp(registerImageToPdf);
    const res = await send(app);

    expect(getObjectBuffer).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("read failed");
    await app.close();
  });

  it("keeps the status of a read-back that already carries one", async () => {
    getObjectBuffer.mockRejectedValue(workspaceCap());
    const app = await buildApp(registerImageToPdf);

    expect((await send(app)).statusCode).toBe(503);
    await app.close();
  });

  it("answers the 503 a storage write carries instead of 422", async () => {
    putObject.mockRejectedValue(workspaceCap());
    const app = await buildApp(registerImageToPdf);

    expect((await send(app)).statusCode).toBe(503);
    await app.close();
  });

  it("answers 503 storage-unavailable when read-back fails with an S3 service fault", async () => {
    getObjectBuffer.mockRejectedValue({
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503 },
    });
    const app = await buildApp(registerImageToPdf);
    const res = await send(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    await app.close();
  });

  it("answers 503 storage-full when a bare ENOSPC hits putObject", async () => {
    putObject.mockRejectedValue(
      Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }),
    );
    const app = await buildApp(registerImageToPdf);
    const res = await send(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage is full.",
      code: "storage-full",
    });
    await app.close();
  });
});

describe("pdf-to-image batch route (#1552)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("page"));
    getObjectStream
      .mockReset()
      .mockImplementation(() =>
        import("node:stream").then((m) => m.Readable.from([Buffer.from("page")])),
      );
    deletePrefix.mockReset().mockResolvedValue(undefined);
    dbInsertValues.mockReset().mockResolvedValue(undefined);
    failBatchJob.mockReset().mockResolvedValue(true);
    updateJobProgress.mockReset().mockResolvedValue(undefined);
  });

  const sendBatch = async (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...multipartBody(
        [
          { name: "a.pdf", type: "application/pdf", data: PDF },
          { name: "b.pdf", type: "application/pdf", data: PDF },
        ],
        { dpi: 36 },
      ),
    });

  it("settles the batch and answers 503 storage-unavailable when an S3 outage hits mid-batch", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } };
      }
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    expect(failBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
      }),
    );
    expect(logLines.some((line) => line.includes("PDF batch file conversion failed"))).toBe(false);
    await app.close();
  });

  it("settles the batch and answers 503 storage-full when a bare ENOSPC hits mid-batch", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
          code: "ENOSPC",
        });
      }
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage is full.",
      code: "storage-full",
    });
    expect(failBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        message: "The server's storage is full.",
        code: "storage-full",
      }),
    );
    expect(logLines.some((line) => line.includes("PDF batch file conversion failed"))).toBe(false);
    await app.close();
  });

  it("answers 503 instead of 422 'All files failed processing' when every file hits a storage fault", async () => {
    putObject.mockRejectedValue(
      Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }),
    );
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage is full.",
      code: "storage-full",
    });
    expect(putObject).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("settles the batch and answers 503 storage-unavailable when readOwnOutput hits an S3 fault mid-batch", async () => {
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } };
      }
      return Buffer.from("page");
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    expect(failBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
      }),
    );
    await app.close();
  });

  it("settles the batch with storage-unavailable when getObjectStream hits an S3 fault during final ZIP streaming", async () => {
    getObjectStream.mockRejectedValueOnce({
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503 },
    });
    const app = await buildApp(registerPdfToImage);
    await sendBatch(app).then(
      (res: unknown) => res,
      () => null,
    );

    expect(failBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
      }),
    );
    await app.close();
  });

  it("normalizes S3 mid-stream read faults and open-time stream faults during final ZIP streaming (#3651)", async () => {
    const originalMode = env.STORAGE_MODE;
    (env as { STORAGE_MODE: string }).STORAGE_MODE = "s3";
    const app = await buildApp(registerPdfToImage);
    try {
      const midStreamFaults = [
        Object.assign(new Error("Premature close"), {
          code: "ERR_STREAM_PREMATURE_CLOSE",
        }),
        Object.assign(new Error("S3 stream reset"), {
          code: "EIO",
          syscall: "read",
        }),
      ];
      for (const fault of midStreamFaults) {
        failBatchJob.mockClear();
        getObjectStream.mockResolvedValueOnce(
          Readable.from(
            (async function* () {
              yield Buffer.from("partial-zip-bytes");
              throw fault;
            })(),
          ),
        );
        await sendBatch(app).then(
          (res: unknown) => res,
          () => null,
        );
        expect(failBatchJob).toHaveBeenCalledWith({
          jobId: expect.any(String),
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [{ filename: "", error: "The server's storage service is unavailable." }],
          message: "The server's storage service is unavailable.",
          code: "storage-unavailable",
        });
      }

      const openFaults = [
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
        Object.assign(new Error("S3 stream reset"), { code: "EIO", syscall: "read" }),
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
      ];
      for (const fault of openFaults) {
        failBatchJob.mockClear();
        getObjectStream.mockRejectedValueOnce(fault);
        await sendBatch(app).then(
          (res: unknown) => res,
          () => null,
        );
        expect(failBatchJob).toHaveBeenCalledWith({
          jobId: expect.any(String),
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [{ filename: "", error: "The server's storage service is unavailable." }],
          message: "The server's storage service is unavailable.",
          code: "storage-unavailable",
        });
      }

      // Missing object (NoSuchKey) and unexpected non-S3 defects still settle as generic packaging failure
      const nonServiceFaults = [
        Object.assign(new Error("The specified key does not exist."), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        }),
        new TypeError("unexpected stream defect"),
      ];
      for (const defect of nonServiceFaults) {
        failBatchJob.mockClear();
        getObjectStream.mockRejectedValueOnce(defect);
        await sendBatch(app).then(
          (res: unknown) => res,
          () => null,
        );
        expect(failBatchJob).toHaveBeenCalledWith({
          jobId: expect.any(String),
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [{ filename: "", error: "Failed to package batch results" }],
          message: "Failed to package batch results",
        });

        failBatchJob.mockClear();
        getObjectStream.mockResolvedValueOnce(
          Readable.from(
            (async function* () {
              yield Buffer.from("partial-zip-bytes");
              throw defect;
            })(),
          ),
        );
        await sendBatch(app).then(
          (res: unknown) => res,
          () => null,
        );
        expect(failBatchJob).toHaveBeenCalledWith({
          jobId: expect.any(String),
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [{ filename: "", error: "Failed to package batch results" }],
          message: "Failed to package batch results",
        });
      }
    } finally {
      (env as { STORAGE_MODE: string }).STORAGE_MODE = originalMode;
      await app.close();
    }
  });

  it("masks non-SafeError 500 messages as 'Internal server error' when readOwnOutput fails mid-batch (#2786)", async () => {
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw new Error("read failed");
      }
      return Buffer.from("page");
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal server error" });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [{ filename: "", error: "Internal server error" }],
      message: "Internal server error",
    });
    await app.close();
  });

  it("masks non-SafeError 500 messages from putObject when settling the batch (#2786)", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw Object.assign(
          new TypeError("Cannot read properties of undefined (reading 'byteLength')"),
          {
            statusCode: 500,
          },
        );
      }
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal server error" });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [{ filename: "", error: "Internal server error" }],
      message: "Internal server error",
    });
    await app.close();
  });

  it("masks non-SafeError 5xx messages above 500 (such as 502) when settling the batch (#2786)", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw Object.assign(new Error("upstream gateway failure details"), {
          statusCode: 502,
        });
      }
    });
    const app = await buildApp(registerPdfToImage);
    const res = await sendBatch(app);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "Internal server error" });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [{ filename: "", error: "Internal server error" }],
      message: "Internal server error",
    });
    await app.close();
  });

  it("preserves earlier per-file errors in failBatchJob when a mid-batch storage fault hits (#2815)", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.includes("-f1/")) {
        throw workspaceCap();
      }
    });
    const app = await buildApp(registerPdfToImage);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...multipartBody(
        [
          { name: "bad.pdf", type: "application/pdf", data: Buffer.from("not a pdf") },
          { name: "b.pdf", type: "application/pdf", data: PDF },
        ],
        { dpi: 36 },
      ),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: "Workspace is full.",
      code: "workspace-cap",
    });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "bad.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "", error: "Workspace is full." },
      ],
      message: "Workspace is full.",
      code: "workspace-cap",
    });
    await app.close();
  });

  it("settles an all-failed PDF batch via failBatchJob instead of updateJobProgress (#2765)", async () => {
    const app = await buildApp(registerPdfToImage);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...multipartBody(
        [
          { name: "bad1.pdf", type: "application/pdf", data: Buffer.from("not a pdf") },
          { name: "bad2.pdf", type: "application/pdf", data: Buffer.from("still not a pdf") },
        ],
        { dpi: 36 },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "All files failed processing",
      errors: [
        { filename: "bad1.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "bad2.pdf", error: "Invalid or corrupt PDF file" },
      ],
    });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "bad1.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "bad2.pdf", error: "Invalid or corrupt PDF file" },
      ],
      message: "All files failed processing",
    });
    expect(updateJobProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    await app.close();
  });

  it("logs a warning when failBatchJob returns false on an all-failed PDF batch (#2765)", async () => {
    failBatchJob.mockResolvedValueOnce(false);
    const app = await buildApp(registerPdfToImage);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...multipartBody(
        [{ name: "bad.pdf", type: "application/pdf", data: Buffer.from("not a pdf") }],
        { dpi: 36 },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(logLines.some((line) => line.includes("no terminal frame announced"))).toBe(true);
    await app.close();
  });

  it("logs an error and still answers 422 when failBatchJob rejects on an all-failed PDF batch (#2765)", async () => {
    failBatchJob.mockRejectedValueOnce(new Error("db down"));
    const app = await buildApp(registerPdfToImage);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...multipartBody(
        [{ name: "bad.pdf", type: "application/pdf", data: Buffer.from("not a pdf") }],
        { dpi: 36 },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(logLines.some((line) => line.includes("failed to settle a faulted PDF batch"))).toBe(
      true,
    );
    expect(logLines.some((line) => line.includes("no terminal frame announced"))).toBe(false);
    await app.close();
  });
});

describe("svg-to-raster batch route all-failed settlement (#2765)", () => {
  beforeEach(() => {
    dbInsertValues.mockReset().mockResolvedValue(undefined);
    failBatchJob.mockReset().mockResolvedValue(true);
    updateJobProgress.mockReset().mockResolvedValue(undefined);
  });

  const registerSvg = (app: ReturnType<typeof Fastify>) =>
    registerSvgToRasterRoute(app, { toolId: "svg-to-raster" });

  it("settles an all-failed SVG batch via failBatchJob instead of updateJobProgress (#2765)", async () => {
    const app = await buildApp(registerSvg);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("svg-to-raster")}/batch`,
      ...multipartBody(
        [
          { name: "bad1.svg", type: "image/svg+xml", data: Buffer.from("not an svg") },
          { name: "bad2.svg", type: "image/svg+xml", data: Buffer.from("still not an svg") },
        ],
        { outputFormat: "png" },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "All files failed processing",
      errors: [
        { filename: "bad1.svg", error: "Not a valid SVG file" },
        { filename: "bad2.svg", error: "Not a valid SVG file" },
      ],
    });
    expect(failBatchJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "bad1.svg", error: "Not a valid SVG file" },
        { filename: "bad2.svg", error: "Not a valid SVG file" },
      ],
      message: "All files failed processing",
    });
    expect(updateJobProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    await app.close();
  });

  it("logs a warning when failBatchJob returns false on an all-failed SVG batch (#2765)", async () => {
    failBatchJob.mockResolvedValueOnce(false);
    const app = await buildApp(registerSvg);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("svg-to-raster")}/batch`,
      ...multipartBody(
        [{ name: "bad.svg", type: "image/svg+xml", data: Buffer.from("not an svg") }],
        { outputFormat: "png" },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(logLines.some((line) => line.includes("no terminal frame announced"))).toBe(true);
    await app.close();
  });

  it("logs an error and still answers 422 when failBatchJob rejects on an all-failed SVG batch (#2765)", async () => {
    failBatchJob.mockRejectedValueOnce(new Error("db down"));
    const app = await buildApp(registerSvg);
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("svg-to-raster")}/batch`,
      ...multipartBody(
        [{ name: "bad.svg", type: "image/svg+xml", data: Buffer.from("not an svg") }],
        { outputFormat: "png" },
      ),
    });

    expect(res.statusCode).toBe(422);
    expect(logLines.some((line) => line.includes("failed to settle a faulted SVG batch"))).toBe(
      true,
    );
    expect(logLines.some((line) => line.includes("no terminal frame announced"))).toBe(false);
    await app.close();
  });

  it("reports ENGINE_UNAVAILABLE once and answers 503 when every file in an SVG batch hits the same encoder or OOM fault (#3620)", async () => {
    const validSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2266aa"/></svg>',
    );
    const reportSpy = vi.spyOn(engineUnavailableMod, "reportEngineUnavailable");
    const jxlSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockRejectedValue(new DecoderUnavailableError("No cjxl found."));
    const app = await buildApp(registerSvg);
    try {
      const res = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "a.svg", type: "image/svg+xml", data: validSvg },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "jxl" },
        ),
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({
        error: "No cjxl found.",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(res.json().errors).toHaveLength(2);
      expect(res.json().errors).toEqual(
        expect.arrayContaining([
          { filename: "a.svg", error: "No cjxl found.", code: "ENGINE_UNAVAILABLE" },
          { filename: "b.svg", error: "No cjxl found.", code: "ENGINE_UNAVAILABLE" },
        ]),
      );
      expect(reportSpy).toHaveBeenCalledTimes(2);
      expect(
        logLines.filter((line) =>
          line.includes("Tool engine unavailable during input preparation"),
        ),
      ).toHaveLength(1);
      expect(failBatchJob).toHaveBeenCalledWith({
        jobId: expect.any(String),
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: expect.arrayContaining([
          { filename: "a.svg", error: "No cjxl found.", code: "ENGINE_UNAVAILABLE" },
          { filename: "b.svg", error: "No cjxl found.", code: "ENGINE_UNAVAILABLE" },
          { filename: "", error: "No cjxl found." },
        ]),
        message: "No cjxl found.",
        code: "ENGINE_UNAVAILABLE",
      });
      const settledErrors = failBatchJob.mock.calls[0]?.[0]?.errors as Array<{
        filename: string;
        error: string;
      }>;
      expect(settledErrors).toHaveLength(3);
      expect(settledErrors.at(-1)).toEqual({ filename: "", error: "No cjxl found." });
    } finally {
      jxlSpy.mockRestore();
      reportSpy.mockRestore();
      await app.close();
    }
  });

  it("answers 503 on V8 buffer allocation OOM and raw filesystem write faults across an SVG batch, and keeps 422 on mixed failures (#3620)", async () => {
    const validSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2266aa"/></svg>',
    );
    const app = await buildApp(registerSvg);
    const pngSpy = vi
      .spyOn(sharp.prototype, "png")
      .mockImplementationOnce(function (this: sharp.Sharp) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      })
      .mockImplementationOnce(function (this: sharp.Sharp) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      });
    const enospc = () =>
      Object.assign(new Error("ENOSPC: no space left on device"), {
        code: "ENOSPC",
        syscall: "open",
      });
    const heicSpy = vi
      .spyOn(heicConverter, "encodeHeic")
      .mockRejectedValueOnce(enospc())
      .mockRejectedValueOnce(enospc())
      .mockRejectedValueOnce(enospc())
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("heif-enc killed"))
      .mockRejectedValueOnce(new Error("corrupt SVG"))
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("heif-enc killed"))
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("heif-enc killed"));
    try {
      const oomRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "a.svg", type: "image/svg+xml", data: validSvg },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "png" },
        ),
      });
      expect(oomRes.statusCode).toBe(503);
      expect(oomRes.json()).toMatchObject({
        code: "ENGINE_UNAVAILABLE",
      });
      expect(oomRes.json().errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ filename: "a.svg", code: "ENGINE_UNAVAILABLE" }),
          expect.objectContaining({ filename: "b.svg", code: "ENGINE_UNAVAILABLE" }),
        ]),
      );

      failBatchJob.mockClear();
      const enospcRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "a.svg", type: "image/svg+xml", data: validSvg },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "heif" },
        ),
      });
      expect(enospcRes.statusCode).toBe(503);
      expect(enospcRes.json()).toMatchObject({
        code: "storage-full",
      });
      expect(enospcRes.json().errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ filename: "a.svg", code: "storage-full" }),
          expect.objectContaining({ filename: "b.svg", code: "storage-full" }),
        ]),
      );
      expect(failBatchJob).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "storage-full",
        }),
      );

      const mixedRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "a.svg", type: "image/svg+xml", data: validSvg },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "heif" },
        ),
      });
      expect(mixedRes.statusCode).toBe(422);
      expect(mixedRes.json()).toMatchObject({
        error: "All files failed processing",
      });
      expect(mixedRes.json().errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "storage-full" }),
          expect.objectContaining({ code: "ENGINE_UNAVAILABLE" }),
        ]),
      );

      const mixedNon5xxRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "a.svg", type: "image/svg+xml", data: validSvg },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "heif" },
        ),
      });
      expect(mixedNon5xxRes.statusCode).toBe(422);
      expect(mixedNon5xxRes.json()).toMatchObject({
        error: "All files failed processing",
      });
      expect(mixedNon5xxRes.json().errors).toEqual(
        expect.arrayContaining([
          { filename: expect.any(String), error: "corrupt SVG" },
          expect.objectContaining({ error: "heif-enc killed", code: "ENGINE_UNAVAILABLE" }),
        ]),
      );

      const mixedPreFailRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody(
          [
            { name: "bad.svg", type: "image/svg+xml", data: Buffer.from("not an svg") },
            { name: "b.svg", type: "image/svg+xml", data: validSvg },
          ],
          { outputFormat: "heif" },
        ),
      });
      expect(mixedPreFailRes.statusCode).toBe(422);
      expect(mixedPreFailRes.json()).toMatchObject({
        error: "All files failed processing",
      });
      expect(mixedPreFailRes.json().errors).toEqual(
        expect.arrayContaining([
          { filename: "bad.svg", error: "Not a valid SVG file" },
          { filename: "b.svg", error: "heif-enc killed", code: "ENGINE_UNAVAILABLE" },
        ]),
      );
    } finally {
      pngSpy.mockRestore();
      heicSpy.mockRestore();
      await app.close();
    }
  });
});
