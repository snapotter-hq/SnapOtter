/**
 * #2119: the effects route reads the `_mask.png` and `_original.png` an earlier
 * remove-background run stored, and that read used to sit inside the catch-all
 * that answers 422. Storage clients throw raw errors with no statusCode, so a
 * missing object and a storage fault both read as "Effects processing failed",
 * with the absolute path in `details`. A missing object now answers 410 with a
 * code the client acts on (run the removal again); a storage fault reaches the
 * error handler and Sentry. Same split as passport-photo generate (#1674).
 */

import multipart from "@fastify/multipart";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
// Defaults to the local-backend rule; the integration suite exercises the
// real one. A test can answer for S3 instead.
const localMissing = (err: unknown) => (err as NodeJS.ErrnoException)?.code === "ENOENT";
const isMissingObjectError = vi.fn(localMissing);

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    isMissingObjectError: (err: unknown) => isMissingObjectError(err),
  };
});

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";

const EFFECTS_URL = "/api/v1/tools/image/remove-background/effects";

async function buildApp() {
  const app = Fastify();
  await app.register(multipart);
  registerErrorHandler(app);
  registerRemoveBackground(app);
  await app.ready();
  return app;
}

function effectsRequest(settings: Record<string, unknown>) {
  const boundary = "----unit";
  const payload = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n--${boundary}--\r\n`,
  );
  return {
    method: "POST" as const,
    url: EFFECTS_URL,
    payload,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const settings = { jobId: "job", filename: "cat.png" };

const enoent = (path: string) =>
  Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
    code: "ENOENT",
  });
const storageFault = () =>
  Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { name: "TimeoutError" });

const png = (channels: 3 | 4) =>
  sharp({ create: { width: 8, height: 8, channels, background: "#888" } })
    .png()
    .toBuffer();

describe("remove-background effects: reading the stored mask and original", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeEach(() => {
    putObject.mockReset();
    getObjectBuffer.mockReset();
    isMissingObjectError.mockReset();
    isMissingObjectError.mockImplementation(localMissing);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("answers 410 BACKGROUND_REMOVAL_EXPIRED when the stored mask is gone, without leaking the path", async () => {
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.endsWith("_mask.png")) throw enoent("/data/outputs/job/cat_mask.png");
      return png(4);
    });
    app = await buildApp();
    const res = await app.inject(effectsRequest(settings));
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("BACKGROUND_REMOVAL_EXPIRED");
    expect(res.body).not.toContain("/data/");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("answers 410 when only the stored original is gone", async () => {
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.endsWith("_original.png")) throw enoent("/data/outputs/job/cat_original.png");
      return png(4);
    });
    app = await buildApp();
    const res = await app.inject(effectsRequest(settings));
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("BACKGROUND_REMOVAL_EXPIRED");
  });

  it("lets a raw storage error on the mask read reach the error handler", async () => {
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.endsWith("_mask.png")) throw storageFault();
      return png(4);
    });
    app = await buildApp();
    const res = await app.inject(effectsRequest(settings));
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Internal server error");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("treats a missing mask beside a storage fault on the original as the fault, not an expiry", async () => {
    // Telling the client to run the removal again would not help when the
    // store itself is failing.
    getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.endsWith("_mask.png")) throw enoent("/data/outputs/job/cat_mask.png");
      throw storageFault();
    });
    app = await buildApp();
    const res = await app.inject(effectsRequest(settings));
    expect(res.statusCode).toBe(500);
  });

  it("asks the storage backend whether an object is missing", async () => {
    // S3 reports a missing key as NoSuchKey with no errno code, so the route
    // must defer to the backend's classifier rather than test for ENOENT.
    const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
      name: "NoSuchKey",
    });
    getObjectBuffer.mockImplementation(async () => {
      throw noSuchKey;
    });
    isMissingObjectError.mockImplementation((err) => err === noSuchKey);
    app = await buildApp();
    const res = await app.inject(effectsRequest(settings));
    expect(res.statusCode).toBe(410);
    expect(isMissingObjectError).toHaveBeenCalledWith(noSuchKey);
  });

  it("answers 400 for a jobId or filename the store would refuse, without reading", async () => {
    app = await buildApp();
    const res = await app.inject(effectsRequest({ jobId: "job", filename: "../../escape.png" }));
    expect(res.statusCode).toBe(400);
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });

  it("still composites and stores the result when both objects are there", async () => {
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png")
        ? sharp(await png(3))
            .greyscale()
            .png()
            .toBuffer()
        : png(3),
    );
    putObject.mockResolvedValue(undefined);
    app = await buildApp();
    const res = await app.inject(
      effectsRequest({ ...settings, backgroundType: "color", backgroundColor: "#ff0000" }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().downloadUrl).toContain("/api/v1/download/job/");
    expect(putObject).toHaveBeenCalledTimes(1);
  });
});
