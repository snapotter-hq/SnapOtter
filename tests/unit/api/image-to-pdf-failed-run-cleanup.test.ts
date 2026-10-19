/**
 * #2785: registerImageToPdfRoute in apps/api/src/routes/tools/image-to-pdf.ts
 * had two gaps ahead of its outer catch block:
 *
 * 1. The inner catches around decodeHeic and decodeToSharpCompat only rethrew
 *    isDecoderUnavailable(err) (and DecoderOutOfMemoryError) and answered 422
 *    for everything else, turning ENOSPC / EACCES / EROFS / EDQUOT / EPERM from
 *    writing the decoder temp file into a 422 blaming the uploaded image.
 * 2. When collate=false wrote per-image PDFs to outputs/<jobId>/ and a later
 *    image write, readOwnOutput, or the final ZIP write failed, the outer
 *    catch never called deletePrefix(`outputs/${jobId}`), stranding partial
 *    outputs with no jobs row for retention or GDPR deletion to find.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath, SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const deletePrefix = vi.fn();
const decodeHeic = vi.fn();
const decodeToSharpCompat = vi.fn();

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: (...args: unknown[]) => decodeHeic(...args),
  };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: (...args: unknown[]) => decodeToSharpCompat(...args),
  };
});

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerImageToPdf } from "../../../apps/api/src/routes/tools/image-to-pdf.js";

const PNG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.png"));
const JPG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-100x100.jpg"));
const HEIC = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.heic"));
const PSD = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.psd"));
const DNG = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));

const logLines: string[] = [];

async function buildApp() {
  logLines.length = 0;
  const app = Fastify({
    logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  registerErrorHandler(app);
  registerImageToPdf(app);
  await app.ready();
  return app;
}

function multipartBody(
  files: Array<{ filename: string; contentType: string; content: Buffer }>,
  settings?: Record<string, unknown>,
) {
  const boundary = "----unit";
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    );
  }
  if (settings !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** The `outputs/<jobId>` prefix of every key the route wrote. */
function writtenPrefixes(): string[] {
  const prefixes = putObject.mock.calls.map(([key]) => String(key).replace(/\/[^/]+$/, ""));
  return [...new Set(prefixes)];
}

const workspaceFull = () =>
  new SafeError("Workspace is full.", { statusCode: 503, code: "workspace-cap" });

function errnoError(code: string, syscall = "open"): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: temp write failed, ${syscall} '/tmp/in-${code}'`), {
    code,
    syscall,
  });
}

describe("image-to-pdf inner CLI decode catches surface operational write errors (#2785)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4"));
    deletePrefix.mockReset().mockResolvedValue(undefined);
    decodeHeic.mockReset().mockResolvedValue(PNG);
    decodeToSharpCompat.mockReset().mockResolvedValue(PNG);
  });

  it.each([
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ])("answers 503 %s (%s) when decodeHeic fails writing to tmpdir", async (errno, expectedCode) => {
    decodeHeic.mockRejectedValue(errnoError(errno));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.heic", contentType: "image/heic", content: HEIC }]),
    });

    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({ code: expectedCode });
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ])(
    "answers 503 %s (%s) when decodeToSharpCompat fails writing to tmpdir",
    async (errno, expectedCode) => {
      decodeToSharpCompat.mockRejectedValue(errnoError(errno));
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("image-to-pdf"),
        ...multipartBody([
          { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
        ]),
      });

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({ code: expectedCode });
      expect(deletePrefix).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it("answers 503 storage-full when decodeToSharpCompat hits ENOSPC even on a DNG that Sharp can read", async () => {
    decodeToSharpCompat.mockRejectedValue(errnoError("ENOSPC"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }]),
    });

    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({ code: "storage-full" });
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("still lets Sharp's native decode succeed when decodeToSharpCompat throws DecoderUnavailableError on a DNG", async () => {
    decodeToSharpCompat.mockRejectedValue(new DecoderUnavailableError("No dcraw_emu found."));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }]),
    });

    expect(res.statusCode, res.body).toBe(200);
    await app.close();
  });

  it("answers 503 ENGINE_UNAVAILABLE when decodeToSharpCompat throws DecoderOutOfMemoryError on a DNG", async () => {
    decodeToSharpCompat.mockRejectedValue(
      new DecoderOutOfMemoryError("The image decoder ran out of memory decoding this image."),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }]),
    });

    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("answers 503 ENGINE_UNAVAILABLE when decodeToSharpCompat throws DecoderUnavailableError on a PSD", async () => {
    decodeToSharpCompat.mockRejectedValue(new DecoderUnavailableError("No ImageMagick found."));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([
        { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
      ]),
    });

    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("still answers 422 for an ordinary HEIC or PSD decode failure", async () => {
    decodeHeic.mockRejectedValue(new Error("Corrupt HEIC bitstream"));
    decodeToSharpCompat.mockRejectedValue(new Error("Corrupt PSD header"));
    const app = await buildApp();

    const heicRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.heic", contentType: "image/heic", content: HEIC }]),
    });
    expect(heicRes.statusCode).toBe(422);
    expect(heicRes.json().error).toContain("Failed to decode HEIC");

    const psdRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([
        { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
      ]),
    });
    expect(psdRes.statusCode).toBe(422);
    expect(psdRes.json().error).toContain("Failed to decode PSD");

    await app.close();
  });
});

describe("image-to-pdf collate=false clears what a failed run wrote (#2785)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4"));
    deletePrefix.mockReset().mockResolvedValue(undefined);
  });

  const twoImagesUncollated = () =>
    multipartBody(
      [
        { filename: "a.png", contentType: "image/png", content: PNG },
        { filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      ],
      { collate: false },
    );

  it("clears the job's PDFs when the final ZIP write fails with a 5xx", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.endsWith("images.zip")) throw workspaceFull();
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...twoImagesUncollated(),
    });

    expect(res.statusCode).toBe(503);
    expect(writtenPrefixes()).toHaveLength(1);
    expect(deletePrefix).toHaveBeenCalledTimes(1);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("clears the job's PDFs when they cannot be read back for the ZIP", async () => {
    getObjectBuffer.mockRejectedValue(new Error("read failed"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...twoImagesUncollated(),
    });

    expect(res.statusCode).toBe(500);
    expect(writtenPrefixes()).toHaveLength(1);
    expect(deletePrefix).toHaveBeenCalledTimes(1);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("clears the PDFs written before a later image's PDF write failed, on the 422 path too", async () => {
    let writes = 0;
    putObject.mockImplementation(async () => {
      if (++writes === 2) throw new Error("unexpected write error");
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...twoImagesUncollated(),
    });

    expect(res.statusCode).toBe(422);
    expect(writtenPrefixes()).toHaveLength(1);
    expect(deletePrefix).toHaveBeenCalledTimes(1);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("answers the original failure when the cleanup fails too, and logs a warning", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.endsWith("images.zip")) throw workspaceFull();
    });
    deletePrefix.mockRejectedValue(new Error("rm failed"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...twoImagesUncollated(),
    });

    expect(res.statusCode).toBe(503);
    expect(logLines.some((line) => line.includes("cleanup of a failed PDF creation failed"))).toBe(
      true,
    );
    await app.close();
  });

  it("leaves a successful run alone", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...twoImagesUncollated(),
    });

    expect(res.statusCode).toBe(200);
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not call deletePrefix when a failure happens before any output is written", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([
        { filename: "bad.png", contentType: "image/png", content: Buffer.from("not an image") },
      ]),
    });

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not call deletePrefix when a processing failure enters the outer catch before any output is written", async () => {
    decodeHeic.mockResolvedValueOnce(Buffer.from("corrupt decoded buffer"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ filename: "photo.heic", contentType: "image/heic", content: HEIC }]),
    });

    expect(res.statusCode).toBe(422);
    expect(putObject).not.toHaveBeenCalled();
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });
});
