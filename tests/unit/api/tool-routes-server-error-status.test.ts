/**
 * #1640: the hand-written tool routes store their result inside a catch-all
 * that answers 422, so a full workspace (507/503) or a failed write read as
 * a bad file. An error carrying a 5xx statusCode must reach the error handler
 * and be answered with that status; any other failure stays a 422.
 */

import multipart from "@fastify/multipart";
import { apiToolPath, hasServerErrorStatus, SafeError } from "@snapotter/shared";
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
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    isMissingObjectError: (err: unknown) => isMissingObjectError(err),
    isValidObjectKey: actual.isValidObjectKey,
  };
});

vi.mock("../../../apps/api/src/lib/browser-service.js", () => ({
  isBrowserAvailable: () => true,
  captureHtml: async () => Buffer.from("png"),
  capturePage: async () => Buffer.from("png"),
}));

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerCompare } from "../../../apps/api/src/routes/tools/compare.js";
import { registerHtmlToImage } from "../../../apps/api/src/routes/tools/html-to-image.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerQrGenerate } from "../../../apps/api/src/routes/tools/qr-generate.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
);

async function buildApp(register: (app: ReturnType<typeof Fastify>) => void) {
  const app = Fastify();
  await app.register(multipart);
  registerErrorHandler(app);
  register(app);
  await app.ready();
  return app;
}

function multipartBody(files: { name: string; type: string; data: Buffer }[]) {
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
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const storageFull = () =>
  new SafeError("Workspace is full.", { statusCode: 507, code: "WORKSPACE_FULL" });
const storageDown = () =>
  new SafeError("Storage unavailable.", { statusCode: 503, code: "STORAGE_UNAVAILABLE" });

describe("hasServerErrorStatus", () => {
  it("accepts 5xx statusCode errors only", () => {
    expect(hasServerErrorStatus(storageFull())).toBe(true);
    expect(hasServerErrorStatus(Object.assign(new Error("x"), { statusCode: 503 }))).toBe(true);
    expect(hasServerErrorStatus(Object.assign(new Error("x"), { statusCode: 400 }))).toBe(false);
    expect(hasServerErrorStatus(new Error("x"))).toBe(false);
    expect(hasServerErrorStatus(null)).toBe(false);
    expect(hasServerErrorStatus({ statusCode: 503 })).toBe(false);
  });
});

describe("svg-to-raster", () => {
  beforeEach(() => {
    putObject.mockReset();
  });

  const send = async (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.inject({
      method: "POST",
      url: apiToolPath("svg-to-raster"),
      ...multipartBody([{ name: "a.svg", type: "image/svg+xml", data: SVG }]),
    });

  it("surfaces a 507 from the storage write instead of answering 422", async () => {
    putObject.mockImplementation(async () => {
      throw storageFull();
    });
    const app = await buildApp(registerSvgToRaster);
    const res = await send(app);
    expect(res.statusCode).toBe(507);
    await app.close();
  });

  it("surfaces a 503 from the storage write instead of answering 422", async () => {
    putObject.mockImplementation(async () => {
      throw storageDown();
    });
    const app = await buildApp(registerSvgToRaster);
    expect((await send(app)).statusCode).toBe(503);
    await app.close();
  });

  it("still answers 422 for an ordinary failure", async () => {
    putObject.mockImplementation(async () => {
      throw new Error("bad input");
    });
    const app = await buildApp(registerSvgToRaster);
    const res = await send(app);

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("SVG conversion failed");
    await app.close();
  });
});

describe("compare", () => {
  beforeEach(() => {
    putObject.mockReset();
  });

  const send = async (app: Awaited<ReturnType<typeof buildApp>>) => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    return app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      ...multipartBody([
        { name: "a.png", type: "image/png", data: png },
        { name: "b.png", type: "image/png", data: png },
      ]),
    });
  };

  it("surfaces a 507 from the storage write instead of answering 422", async () => {
    putObject.mockImplementation(async () => {
      throw storageFull();
    });
    const app = await buildApp(registerCompare);
    expect((await send(app)).statusCode).toBe(507);
    await app.close();
  });

  it("still answers 422 for an ordinary failure", async () => {
    putObject.mockImplementation(async () => {
      throw new Error("bad input");
    });
    const app = await buildApp(registerCompare);
    const res = await send(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Comparison failed");
    await app.close();
  });
});

// #1671: routes #1667 didn't reach. Each one stores its result inside the
// same kind of catch-all.
describe("json-bodied routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeEach(() => {
    putObject.mockReset();
    getObjectBuffer.mockReset();
    isMissingObjectError.mockClear();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // A plausible face on a 200x200 background-removed image, so generate gets
  // through the crop maths and reaches the putObject call.
  const passportBody = {
    jobId: "job",
    filename: "face.png",
    countryCode: "US",
    landmarks: {
      leftEye: { x: 0.42, y: 0.45 },
      rightEye: { x: 0.58, y: 0.45 },
      eyeCenter: { x: 0.5, y: 0.45 },
      chin: { x: 0.5, y: 0.7 },
      forehead: { x: 0.5, y: 0.32 },
      crown: { x: 0.5, y: 0.25 },
      nose: { x: 0.5, y: 0.55 },
      faceCenterX: 0.5,
    },
    imageWidth: 200,
    imageHeight: 200,
  };
  const bgRemoved = () =>
    sharp({ create: { width: 200, height: 200, channels: 4, background: "#fff" } })
      .png()
      .toBuffer();

  const cases = [
    {
      name: "qr-generate",
      register: registerQrGenerate,
      url: "/api/v1/tools/image/qr-generate",
      payload: { text: "hello" },
      fail: putObject,
      error: "QR code generation failed",
    },
    {
      name: "html-to-image",
      register: registerHtmlToImage,
      url: "/api/v1/tools/image/html-to-image",
      payload: { html: "<p>hi</p>" },
      fail: putObject,
      error: "Screenshot capture failed",
    },
    {
      name: "passport-photo generate",
      register: registerPassportPhoto,
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
      setup: () => getObjectBuffer.mockImplementation(bgRemoved),
      fail: putObject,
      error: "Passport photo generation failed",
    },
  ];

  for (const c of cases) {
    it(`${c.name} surfaces a storage 503 with its code instead of answering 422`, async () => {
      c.setup?.();
      c.fail.mockImplementation(async () => {
        throw storageDown();
      });
      app = await buildApp(c.register);
      const res = await app.inject({ method: "POST", url: c.url, payload: c.payload });
      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("STORAGE_UNAVAILABLE");
      expect(c.fail).toHaveBeenCalled();
    });

    it(`${c.name} still answers 422 for an ordinary failure`, async () => {
      c.setup?.();
      c.fail.mockImplementation(async () => {
        throw new Error("bad input");
      });
      app = await buildApp(c.register);
      const res = await app.inject({ method: "POST", url: c.url, payload: c.payload });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe(c.error);
      expect(c.fail).toHaveBeenCalled();
    });
  }

  // #1674: the read of analyze's stored output used to sit in the same 422
  // catch-all, and storage clients throw raw errors with no statusCode.
  it("passport-photo generate lets a raw storage error on its read reach the error handler", async () => {
    getObjectBuffer.mockImplementation(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
        name: "TimeoutError",
      });
    });
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Internal server error");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("passport-photo generate answers 410 ANALYSIS_EXPIRED when the stored output is missing", async () => {
    getObjectBuffer.mockImplementation(async () => {
      throw Object.assign(new Error("ENOENT: no such file or directory, open '/data/x'"), {
        code: "ENOENT",
      });
    });
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("ANALYSIS_EXPIRED");
    expect(res.body).not.toContain("/data/x");
  });

  it("passport-photo generate asks the storage backend whether an object is missing", async () => {
    // S3 reports a missing key as NoSuchKey with no errno code, so the route
    // must defer to the backend's classifier rather than test for ENOENT.
    const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
      name: "NoSuchKey",
    });
    getObjectBuffer.mockImplementation(async () => {
      throw noSuchKey;
    });
    isMissingObjectError.mockImplementationOnce((err) => err === noSuchKey);
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(410);
    expect(isMissingObjectError).toHaveBeenCalledWith(noSuchKey);
  });

  it("passport-photo generate answers 400 for a jobId or filename the store would refuse", async () => {
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: { ...passportBody, filename: "../../escape.png" },
    });
    expect(res.statusCode).toBe(400);
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });

  it("html-to-image answers a storage fault that mentions a timeout as storage, not a slow page", async () => {
    putObject.mockImplementation(async () => {
      throw new SafeError("Storage write timeout.", {
        statusCode: 503,
        code: "STORAGE_UNAVAILABLE",
      });
    });
    app = await buildApp(registerHtmlToImage);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/html-to-image",
      payload: { html: "<p>hi</p>" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("STORAGE_UNAVAILABLE");
  });
});
