/**
 * #2158: the single-file pdf-to-image route writes each rendered page to
 * `outputs/<jobId>/` as it goes, then builds a ZIP. When a later step failed,
 * the route answered the error and left every page it had written on the
 * volume: no response ever linked to them, no jobs row exists for retention or
 * GDPR deletion to find them, and on a full workspace they hold the space the
 * next request needs. The batch path already clears its prefixes; this one
 * has to as well.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath, SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const deletePrefix = vi.fn();

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

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => true };
});

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerPdfToImage } from "../../../apps/api/src/routes/tools/pdf-to-image.js";

const PDF = readFileSync(join(__dirname, "../../fixtures/document/valid/test-3page.pdf"));
const ENCRYPTED = readFileSync(join(__dirname, "../../fixtures/document/valid/encrypted.pdf"));

const logLines: string[] = [];

async function buildApp() {
  logLines.length = 0;
  const app = Fastify({
    logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
  });
  await app.register(multipart);
  registerErrorHandler(app);
  registerPdfToImage(app);
  await app.ready();
  return app;
}

function multipartBody(pdf: Buffer) {
  const boundary = "----unit";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    pdf,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify({ dpi: 36 })}\r\n--${boundary}--\r\n`,
    ),
  ]);
  return {
    payload: body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function convert(app: Awaited<ReturnType<typeof buildApp>>, pdf: Buffer = PDF) {
  return app.inject({ method: "POST", url: apiToolPath("pdf-to-image"), ...multipartBody(pdf) });
}

/** The `outputs/<jobId>` prefix of every key the route wrote. */
function writtenPrefixes(): string[] {
  const prefixes = putObject.mock.calls.map(([key]) => String(key).replace(/\/[^/]+$/, ""));
  return [...new Set(prefixes)];
}

const workspaceFull = () =>
  new SafeError("Workspace is full.", { statusCode: 503, code: "workspace-cap" });

describe("pdf-to-image single file clears what a failed run wrote (#2158)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("page"));
    deletePrefix.mockReset().mockResolvedValue(undefined);
  });

  it("clears the job's pages when the ZIP write fails with a 5xx", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.endsWith("pdf-pages.zip")) throw workspaceFull();
    });
    const app = await buildApp();
    const res = await convert(app);

    expect(res.statusCode).toBe(503);
    expect(writtenPrefixes()).toHaveLength(1);
    expect(deletePrefix).toHaveBeenCalledTimes(1);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("clears the job's pages when they cannot be read back for the ZIP", async () => {
    getObjectBuffer.mockRejectedValue(new Error("read failed"));
    const app = await buildApp();
    const res = await convert(app);

    expect(res.statusCode).toBe(500);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("clears the pages written before a later page failed, on the 422 path too", async () => {
    let writes = 0;
    putObject.mockImplementation(async () => {
      if (++writes === 2) throw new Error("disk hiccup");
    });
    const app = await buildApp();
    const res = await convert(app);

    expect(res.statusCode).toBe(422);
    expect(deletePrefix).toHaveBeenCalledWith(writtenPrefixes()[0]);
    await app.close();
  });

  it("answers the original failure when the cleanup fails too, and says so", async () => {
    putObject.mockImplementation(async (key: string) => {
      if (key.endsWith("pdf-pages.zip")) throw workspaceFull();
    });
    deletePrefix.mockRejectedValue(new Error("rm failed"));
    const app = await buildApp();
    const res = await convert(app);

    expect(res.statusCode).toBe(503);
    expect(logLines.some((line) => line.includes("cleanup of a failed PDF conversion"))).toBe(true);
    await app.close();
  });

  it("leaves a successful run alone", async () => {
    const app = await buildApp();
    const res = await convert(app);

    expect(res.statusCode).toBe(200);
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not touch storage for a PDF it refuses before writing anything", async () => {
    const app = await buildApp();
    const res = await convert(app, ENCRYPTED);

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
    expect(deletePrefix).not.toHaveBeenCalled();
    await app.close();
  });
});
