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

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
  };
});

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => true };
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
    getObjectBuffer.mockReset();
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

    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it("keeps the status of a read-back that already carries one", async () => {
    getObjectBuffer.mockRejectedValue(workspaceCap());
    const app = await buildApp(registerPdfToImage);

    expect((await send(app)).statusCode).toBe(503);
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

    expect(res.statusCode).toBe(500);
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
});
