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

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerImageToPdf } from "../../../apps/api/src/routes/tools/image-to-pdf.js";
import { registerPdfToImage } from "../../../apps/api/src/routes/tools/pdf-to-image.js";

const PDF = readFileSync(join(__dirname, "../../fixtures/document/valid/test-3page.pdf"));

const logLines: string[] = [];

async function buildApp(register: (app: ReturnType<typeof Fastify>) => void) {
  logLines.length = 0;
  const app = Fastify({
    logger: { level: "error", stream: { write: (line: string) => void logLines.push(line) } },
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
});
