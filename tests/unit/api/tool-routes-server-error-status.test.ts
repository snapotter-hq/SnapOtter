/**
 * #1640: the hand-written tool routes store their result inside a catch-all
 * that answers 422, so a full workspace (507/503) or a failed write read as
 * a bad file. An error carrying a 5xx statusCode must reach the error handler
 * and be answered with that status; any other failure stays a 422.
 */

import multipart from "@fastify/multipart";
import { apiToolPath, hasServerErrorStatus, SafeError } from "@snapotter/shared";
import Fastify, { type FastifyRequest } from "fastify";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
// Defaults to the local-backend rule; the integration suite exercises the
// real one. A test can answer for S3 instead.
const localMissing = (err: unknown) => (err as NodeJS.ErrnoException)?.code === "ENOENT";
const isMissingObjectError = vi.fn(localMissing);
const isStorageServiceFault = vi.fn<(_err: unknown) => boolean>(() => false);

const dbInsertValues = vi.fn();

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => dbInsertValues(...args),
    }),
  },
  schema: {
    jobs: {},
  },
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    isMissingObjectError: (err: unknown) => isMissingObjectError(err),
    isStorageServiceFault: (err: unknown) => isStorageServiceFault(err),
    normalizeS3ReadFault: actual.normalizeS3ReadFault,
    isValidObjectKey: actual.isValidObjectKey,
  };
});

vi.mock("../../../apps/api/src/lib/browser-service.js", () => ({
  isBrowserAvailable: () => true,
  captureHtml: async () => Buffer.from("png"),
  capturePage: async () => Buffer.from("png"),
}));

import * as aiMod from "@snapotter/ai";
import * as engineUnavailableMod from "../../../apps/api/src/lib/engine-unavailable.js";
import * as exiftoolMod from "../../../apps/api/src/lib/exiftool.js";
import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import {
  engineUnavailable,
  ImageInputHandler,
} from "../../../apps/api/src/modality/image-input.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerBeautify } from "../../../apps/api/src/routes/tools/beautify.js";
import { registerColorPalette } from "../../../apps/api/src/routes/tools/color-palette.js";
import { registerCompare } from "../../../apps/api/src/routes/tools/compare.js";
import { registerCompose } from "../../../apps/api/src/routes/tools/compose.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerFindDuplicates } from "../../../apps/api/src/routes/tools/find-duplicates.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerHtmlToImage } from "../../../apps/api/src/routes/tools/html-to-image.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerQrGenerate } from "../../../apps/api/src/routes/tools/qr-generate.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerStitch } from "../../../apps/api/src/routes/tools/stitch.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";
import { registerVectorize } from "../../../apps/api/src/routes/tools/vectorize.js";
import { registerWatermarkImage } from "../../../apps/api/src/routes/tools/watermark-image.js";

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

function multipartBody(
  files: { field?: string; name: string; type: string; data: Buffer }[],
  settings?: Record<string, unknown>,
) {
  const boundary = "----unit";
  const chunks: Buffer[] = [];
  for (const f of files) {
    const fieldName = f.field ?? "file";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
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

  it("surfaces a 503 ENGINE_UNAVAILABLE when Sharp conversion hits a V8 buffer allocation RangeError (#3620)", async () => {
    const pngSpy = vi.spyOn(sharp.prototype, "png").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw new RangeError("Array buffer allocation failed");
        },
      } as unknown as sharp.Sharp;
    });
    const app = await buildApp(registerSvgToRaster);
    try {
      const res = await send(app);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({
        code: "ENGINE_UNAVAILABLE",
      });
    } finally {
      pngSpy.mockRestore();
      await app.close();
    }
  });

  it.each([
    ["ENOSPC", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ] as const)(
    "normalizes a raw %s write fault from putObject to 503 %s (#3620)",
    async (errno, expectedCode) => {
      putObject.mockRejectedValueOnce(
        Object.assign(new Error(`${errno}: write failed`), { code: errno, syscall: "open" }),
      );
      const app = await buildApp(registerSvgToRaster);
      try {
        const res = await send(app);
        expect(res.statusCode).toBe(503);
        expect(res.json()).toMatchObject({ code: expectedCode });
      } finally {
        await app.close();
      }
    },
  );

  it("surfaces 503 ENGINE_UNAVAILABLE when encodeJxl or encodeHeic rejects with a raw SIGKILL or decoder fault (#3620)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const app = await buildApp(registerSvgToRaster);
    const jxlSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockRejectedValueOnce(Object.assign(new Error("cjxl exited SIGKILL"), { signal: "SIGKILL" }))
      .mockRejectedValueOnce(new DecoderUnavailableError("No cjxl found."));
    const heicSpy = vi
      .spyOn(heicConverter, "encodeHeic")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("heif-enc killed"));
    try {
      for (const expectedError of [oomMessage, "No cjxl found."]) {
        const jxlRes = await app.inject({
          method: "POST",
          url: apiToolPath("svg-to-raster"),
          ...multipartBody([{ name: "a.svg", type: "image/svg+xml", data: SVG }], {
            outputFormat: "jxl",
          }),
        });
        expect(jxlRes.statusCode).toBe(503);
        expect(jxlRes.json()).toMatchObject({
          error: expectedError,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      for (const expectedError of [oomMessage, "heif-enc killed"]) {
        const heifRes = await app.inject({
          method: "POST",
          url: apiToolPath("svg-to-raster"),
          ...multipartBody([{ name: "a.svg", type: "image/svg+xml", data: SVG }], {
            outputFormat: "heif",
          }),
        });
        expect(heifRes.statusCode).toBe(503);
        expect(heifRes.json()).toMatchObject({
          error: expectedError,
          code: "ENGINE_UNAVAILABLE",
        });
      }
    } finally {
      jxlSpy.mockRestore();
      heicSpy.mockRestore();
      await app.close();
    }
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

  it("preserves InputValidationError cause and avoids upload attribution on 503 engineUnavailable errors while attributing 4xx/422 errors in compare and watermark-image (#3818)", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();

    const logLines: string[] = [];
    const app = Fastify({
      logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
    });
    await app.register(multipart);
    registerErrorHandler(app);
    registerCompare(app);
    registerWatermarkImage(app);
    await app.ready();

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 240 * 60_000);
    const sendSpy = vi.spyOn(engineUnavailableMod, "sendInputValidationError");
    const oomCause = new DecoderOutOfMemoryError("The image decoder ran out of memory.");
    const unavailableCause = new DecoderUnavailableError("No HEIF decoder found.");
    const clientCauseA = new Error("corrupt header a");
    const clientCauseB = new Error("corrupt avif b");
    const clientCauseWm = new Error("corrupt watermark");
    const clientCauseWm422 = new Error("corrupt avif watermark");

    const clientErrA = new InputValidationError("Invalid image: corrupt header");
    clientErrA.cause = clientCauseA;
    const clientErrB = new InputValidationError("Failed to decode AVIF file", 422, "bad bitstream");
    clientErrB.cause = clientCauseB;
    const clientErrWm = new InputValidationError("Invalid image: corrupt watermark");
    clientErrWm.cause = clientCauseWm;
    const clientErrWm422 = new InputValidationError(
      "Failed to decode AVIF file",
      422,
      "bad watermark bitstream",
    );
    clientErrWm422.cause = clientCauseWm422;

    const origPrepare = ImageInputHandler.prototype.prepare;
    const prepareSpy = vi
      .spyOn(ImageInputHandler.prototype, "prepare")
      // 1. compare first image 503 DecoderOutOfMemoryError
      .mockRejectedValueOnce(engineUnavailable(oomCause))
      // 2. compare second image 503 DecoderUnavailableError
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(engineUnavailable(unavailableCause))
      // 3. watermark-image watermark 503 DecoderOutOfMemoryError
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(engineUnavailable(oomCause))
      // 4. watermark-image watermark 503 DecoderUnavailableError
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(engineUnavailable(unavailableCause))
      // 5. compare first image 400 with cause
      .mockRejectedValueOnce(clientErrA)
      // 6. compare second image 422 with cause
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(clientErrB)
      // 7. watermark-image watermark 400 with cause
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(clientErrWm)
      // 8. watermark-image watermark 422 with cause
      .mockImplementationOnce(origPrepare)
      .mockRejectedValueOnce(clientErrWm422);

    try {
      const sendCompare = () =>
        app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compare",
          ...multipartBody([
            { name: "a.png", type: "image/png", data: png },
            { name: "b.png", type: "image/png", data: png },
          ]),
        });
      const sendWatermark = () =>
        app.inject({
          method: "POST",
          url: "/api/v1/tools/image/watermark-image",
          ...multipartBody([
            { field: "file", name: "main.png", type: "image/png", data: png },
            { field: "watermark", name: "wm.png", type: "image/png", data: png },
          ]),
        });

      const compareOomRes = await sendCompare();
      expect(compareOomRes.statusCode).toBe(503);
      expect(compareOomRes.json()).toEqual({
        error: "The image decoder ran out of memory.",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: oomCause,
      });

      const compareUnavailRes = await sendCompare();
      expect(compareUnavailRes.statusCode).toBe(503);
      expect(compareUnavailRes.json()).toEqual({
        error: "No HEIF decoder found.",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(sendSpy.mock.calls[1]?.[1]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: unavailableCause,
      });

      const wmOomRes = await sendWatermark();
      expect(wmOomRes.statusCode).toBe(503);
      expect(wmOomRes.json()).toEqual({
        error: "The image decoder ran out of memory.",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(sendSpy.mock.calls[2]?.[1]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: oomCause,
      });

      const wmUnavailRes = await sendWatermark();
      expect(wmUnavailRes.statusCode).toBe(503);
      expect(wmUnavailRes.json()).toEqual({
        error: "No HEIF decoder found.",
        code: "ENGINE_UNAVAILABLE",
      });
      expect(sendSpy.mock.calls[3]?.[1]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: unavailableCause,
      });

      // Because cause was preserved, all 4 distinct (toolId, cause.name) pairs logged a warn line
      const engineWarnLines = logLines
        .filter((line) => line.includes("Tool engine unavailable during input preparation"))
        .map((line) => JSON.parse(line) as { toolId?: string; cause?: string });
      expect(engineWarnLines).toEqual([
        expect.objectContaining({ toolId: "compare", cause: "DecoderOutOfMemoryError" }),
        expect.objectContaining({ toolId: "compare", cause: "DecoderUnavailableError" }),
        expect.objectContaining({ toolId: "watermark-image", cause: "DecoderOutOfMemoryError" }),
        expect.objectContaining({ toolId: "watermark-image", cause: "DecoderUnavailableError" }),
      ]);

      const compare400Res = await sendCompare();
      expect(compare400Res.statusCode).toBe(400);
      expect(compare400Res.json()).toEqual({
        error: "Invalid first image: corrupt header",
      });
      expect(sendSpy.mock.calls[4]?.[1]).toMatchObject({
        statusCode: 400,
        message: "Invalid first image: corrupt header",
        cause: clientCauseA,
      });

      const compare422Res = await sendCompare();
      expect(compare422Res.statusCode).toBe(422);
      expect(compare422Res.json()).toEqual({
        error: "Failed to decode AVIF file (second image)",
        details: "bad bitstream",
      });
      expect(sendSpy.mock.calls[5]?.[1]).toMatchObject({
        statusCode: 422,
        message: "Failed to decode AVIF file (second image)",
        details: "bad bitstream",
        cause: clientCauseB,
      });

      const wm400Res = await sendWatermark();
      expect(wm400Res.statusCode).toBe(400);
      expect(wm400Res.json()).toEqual({
        error: "Invalid watermark image: corrupt watermark",
      });
      expect(sendSpy.mock.calls[6]?.[1]).toMatchObject({
        statusCode: 400,
        message: "Invalid watermark image: corrupt watermark",
        cause: clientCauseWm,
      });

      const wm422Res = await sendWatermark();
      expect(wm422Res.statusCode).toBe(422);
      expect(wm422Res.json()).toEqual({
        error: "Failed to decode AVIF file (watermark)",
        details: "bad watermark bitstream",
      });
      expect(sendSpy.mock.calls[7]?.[1]).toMatchObject({
        statusCode: 422,
        message: "Failed to decode AVIF file (watermark)",
        details: "bad watermark bitstream",
        cause: clientCauseWm422,
      });
    } finally {
      prepareSpy.mockRestore();
      sendSpy.mockRestore();
      nowSpy.mockRestore();
      await app.close();
    }
  });
});

describe("edit-metadata (#3646)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
  });

  it("surfaces 503 ENGINE_UNAVAILABLE when writeMetadata or inspectMetadata rejects with a V8 buffer allocation RangeError or SIGKILL, and keeps 422 on ordinary errors (#3646)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const writeSpy = vi
      .spyOn(exiftoolMod, "writeMetadata")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(
        Object.assign(new Error("exiftool exited SIGKILL"), { signal: "SIGKILL" }),
      )
      .mockRejectedValueOnce(new Error("exiftool rejected tag"));
    const inspectSpy = vi
      .spyOn(exiftoolMod, "inspectMetadata")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"));
    const app = await buildApp(registerEditMetadata);
    try {
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("edit-metadata"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }], {
            artist: "Test",
          }),
        });
        expect(res.statusCode).toBe(503);
        expect(res.json()).toMatchObject({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      const inspectRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("edit-metadata")}/inspect`,
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });
      expect(inspectRes.statusCode).toBe(503);
      expect(inspectRes.json()).toMatchObject({
        error: oomMessage,
        code: "ENGINE_UNAVAILABLE",
      });

      const badRes = await app.inject({
        method: "POST",
        url: apiToolPath("edit-metadata"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }], {
          artist: "Test",
        }),
      });
      expect(badRes.statusCode).toBe(422);
      expect(badRes.json()).toEqual({
        error: "Metadata edit failed",
        details: "exiftool rejected tag",
      });
    } finally {
      inspectSpy.mockRestore();
      writeSpy.mockRestore();
      await app.close();
    }
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
    isStorageServiceFault.mockReset();
    isStorageServiceFault.mockReturnValue(false);
    dbInsertValues.mockReset().mockResolvedValue(undefined);
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

  it("passport-photo generate normalizes S3 GetObject faults on the stored cutout into a 503 storage-unavailable SafeError (#2953)", async () => {
    const slowDown = Object.assign(new Error("Please reduce your request rate."), {
      name: "SlowDown",
      $metadata: { httpStatusCode: 503 },
    });
    isStorageServiceFault.mockReturnValue(true);
    getObjectBuffer.mockImplementation(async () => {
      throw slowDown;
    });
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    expect(putObject).not.toHaveBeenCalled();

    // Unexpected non-S3 defect in S3 mode still passes through normalizeS3ReadFault as a 500 bug
    getObjectBuffer.mockImplementation(async () => {
      throw new TypeError("unexpected S3 client defect");
    });
    const bugRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(bugRes.statusCode).toBe(500);
    expect(bugRes.json()).toEqual({ error: "Internal server error" });
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

  it("passport-photo generate writes output under a fresh jobId rather than the client-supplied jobId", async () => {
    getObjectBuffer.mockImplementation(bgRemoved);
    putObject.mockResolvedValue(undefined);
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.jobId).toBeTruthy();
    expect(body.jobId).not.toBe(passportBody.jobId);
    expect(body.downloadUrl).toBe(`/api/v1/download/${body.jobId}/face_passport.jpg`);
    expect(putObject).toHaveBeenCalledWith(
      `outputs/${body.jobId}/face_passport.jpg`,
      expect.any(Buffer),
    );
    // The fresh prefix gets its own row so the S3 TTL sweep can expire it.
    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: body.jobId,
        toolId: "passport-photo",
        status: "completed",
        outputRefs: [`outputs/${body.jobId}/face_passport.jpg`],
      }),
    );
  });

  it("passport-photo generate keeps the print sheet under the fresh jobId and its row", async () => {
    getObjectBuffer.mockImplementation(bgRemoved);
    putObject.mockResolvedValue(undefined);
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: { ...passportBody, printLayout: "4x6" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const printKey = `outputs/${body.jobId}/face_passport_print_4x6.jpg`;
    expect(body.printDownloadUrl).toBe(
      `/api/v1/download/${body.jobId}/face_passport_print_4x6.jpg`,
    );
    expect(putObject).toHaveBeenCalledWith(printKey, expect.any(Buffer));
    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: body.jobId,
        outputRefs: [`outputs/${body.jobId}/face_passport.jpg`, printKey],
      }),
    );
  });

  it("passport-photo generate answers 500 and writes nothing when the job row can't be recorded", async () => {
    getObjectBuffer.mockImplementation(bgRemoved);
    dbInsertValues.mockRejectedValue(new Error('Failed query: insert into "jobs" params: secret'));
    app = await buildApp(registerPassportPhoto);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      payload: passportBody,
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/insert into|secret/);
    expect(putObject).not.toHaveBeenCalled();
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

describe("gif-tools /info and preValidate (#3772, #3859)", () => {
  it("surfaces 503 ENGINE_UNAVAILABLE and reports once per window when sharp.metadata() hits V8 buffer allocation OOM or a 5xx fault, and keeps 422 on ordinary errors (#3772)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .gif()
      .toBuffer();
    const logLines: string[] = [];
    const app = Fastify({
      logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
    });
    await app.register(multipart);
    registerErrorHandler(app);
    registerGifTools(app);
    await app.ready();

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 95 * 60_000);
    const sendSpy = vi.spyOn(engineUnavailableMod, "sendInputValidationError");
    const metaSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }),
      )
      .mockRejectedValueOnce(new RangeError("Invalid parameter"))
      .mockRejectedValueOnce(new Error("Input buffer contains unsupported image format"));

    try {
      const sendInfo = () =>
        app.inject({
          method: "POST",
          url: "/api/v1/tools/image/gif-tools/info",
          ...multipartBody([{ name: "test.gif", type: "image/gif", data: gif }]),
        });

      const firstOom = await sendInfo();
      expect(firstOom.statusCode).toBe(503);
      expect(firstOom.json()).toEqual({
        error: oomMessage,
        code: "ENGINE_UNAVAILABLE",
      });

      const secondOom = await sendInfo();
      expect(secondOom.statusCode).toBe(503);
      expect(secondOom.json()).toEqual({
        error: oomMessage,
        code: "ENGINE_UNAVAILABLE",
      });

      const enospcRes = await sendInfo();
      expect(enospcRes.statusCode).toBe(503);
      expect(enospcRes.json()).toEqual({
        error: "The server's storage is full.",
        code: "storage-full",
      });

      for (let i = 0; i < 2; i++) {
        const badRes = await sendInfo();
        expect(badRes.statusCode).toBe(422);
        expect(badRes.json()).toEqual({
          error: "Could not read image metadata",
        });
      }

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ statusCode: 503, code: "ENGINE_UNAVAILABLE" }),
        "gif-tools",
        expect.anything(),
      );
      expect(sendSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ statusCode: 503, code: "storage-full" }),
        "gif-tools",
        expect.anything(),
      );
      expect(
        logLines.filter((line) =>
          line.includes("Tool engine unavailable during input preparation"),
        ),
      ).toHaveLength(2);
      expect(logLines.some((line) => line.includes("Unhandled request error"))).toBe(false);
    } finally {
      metaSpy.mockRestore();
      sendSpy.mockRestore();
      nowSpy.mockRestore();
      await app.close();
    }
  });

  it("surfaces 503 ENGINE_UNAVAILABLE on V8 OOM or storage faults and 400 ToolInputError on undecodable GIF headers in gif-tools preValidate (#3859)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .gif()
      .toBuffer();
    putObject.mockResolvedValue(undefined);
    getObjectBuffer.mockResolvedValue(gif);

    const logLines: string[] = [];
    const app = Fastify({
      logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
    });
    app.addHook("onRequest", async (req: FastifyRequest) => {
      (req as FastifyRequest & { user?: unknown }).user = { id: "u1", role: "admin" };
    });
    await app.register(multipart);
    registerErrorHandler(app);
    registerGifTools(app);
    await app.ready();

    const origMeta = sharp.prototype.metadata;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 125 * 60_000);
    const reportSpy = vi.spyOn(engineUnavailableMod, "reportEngineUnavailable");
    let animatedFault: Error | null = null;
    const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(function (
      this: sharp.Sharp,
    ) {
      const pages = (this as unknown as { options?: { input?: { pages?: number } } }).options?.input
        ?.pages;
      if (pages === -1 && animatedFault) {
        return Promise.reject(animatedFault);
      }
      return origMeta.call(this);
    });

    try {
      const sendTool = () =>
        app.inject({
          method: "POST",
          url: "/api/v1/tools/image/gif-tools",
          ...multipartBody([{ name: "test.gif", type: "image/gif", data: gif }], {
            mode: "resize",
            width: 16,
          }),
        });

      animatedFault = new RangeError("Array buffer allocation failed");
      const firstOom = await sendTool();
      expect(firstOom.statusCode).toBe(503);
      expect(firstOom.json()).toEqual({
        error: oomMessage,
        code: "ENGINE_UNAVAILABLE",
      });

      const secondOom = await sendTool();
      expect(secondOom.statusCode).toBe(503);
      expect(secondOom.json()).toEqual({
        error: oomMessage,
        code: "ENGINE_UNAVAILABLE",
      });

      animatedFault = Object.assign(new Error("ENOSPC: no space left on device, write"), {
        code: "ENOSPC",
      });
      const enospcRes = await sendTool();
      expect(enospcRes.statusCode).toBe(503);
      expect(enospcRes.json()).toEqual({
        error: "The server's storage is full.",
        code: "storage-full",
      });

      animatedFault = Object.assign(new Error("EPERM: operation not permitted, write"), {
        code: "EPERM",
      });
      const epermRes = await sendTool();
      expect(epermRes.statusCode).toBe(503);
      expect(epermRes.json()).toEqual({
        error:
          "The server can't write to its storage: it's read-only or not allowed to write there.",
        code: "storage-not-writable",
      });

      animatedFault = Object.assign(new Error("EMFILE: too many open files"), {
        code: "EMFILE",
      });
      const emfileRes = await sendTool();
      expect(emfileRes.statusCode).toBe(503);
      expect(emfileRes.json()).toEqual({
        error:
          "The server has too many files open to process this image right now. Try again shortly.",
        code: "EMFILE",
      });

      animatedFault = new Error(
        "Input buffer has corrupt header: gifload_buffer: Unexpected end of GIF source data",
      );
      const corruptHeaderRes = await sendTool();
      expect(corruptHeaderRes.statusCode).toBe(400);
      expect(corruptHeaderRes.json()).toEqual({
        error:
          "This image can't be decoded. The file may be corrupt or use an unsupported encoding.",
      });

      animatedFault = new Error("Input image exceeds pixel limit");
      const pixelLimitRes = await sendTool();
      expect(pixelLimitRes.statusCode).toBe(400);
      expect(pixelLimitRes.json()).toEqual({
        error: "This image is too large to process. Reduce its dimensions and try again.",
      });

      expect(reportSpy).toHaveBeenCalledTimes(5);
      expect(
        logLines.filter((line) =>
          line.includes("Tool engine unavailable during input preparation"),
        ),
      ).toHaveLength(4);
      expect(logLines.some((line) => line.includes("Unhandled request error"))).toBe(false);
    } finally {
      metaSpy.mockRestore();
      reportSpy.mockRestore();
      nowSpy.mockRestore();
      await app.close();
    }
  });
});

describe("find-duplicates post-intake OOM handling (#3790)", () => {
  it("surfaces 503 ENGINE_UNAVAILABLE when thumbnail generation, per-file hashing, or the outer catch hits a V8 buffer allocation RangeError, and keeps non-OOM thumbnail/hash fallbacks (#3790)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .png()
      .toBuffer();
    const app = await buildApp(registerFindDuplicates);
    try {
      const sendPair = () =>
        app.inject({
          method: "POST",
          url: "/api/v1/tools/image/find-duplicates",
          ...multipartBody([
            { name: "a.png", type: "image/png", data: png },
            { name: "b.png", type: "image/png", data: png },
          ]),
        });

      // 1. Thumbnail generation (sharp.prototype.jpeg) hits V8 buffer allocation RangeError or ENOSPC -> 503
      const jpegOomSpy = vi
        .spyOn(sharp.prototype, "jpeg")
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
              throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
                code: "ENOSPC",
              });
            },
          } as unknown as sharp.Sharp;
        });
      try {
        const thumbOomRes = await sendPair();
        expect(thumbOomRes.statusCode).toBe(503);
        expect(thumbOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const thumbEnospcRes = await sendPair();
        expect(thumbEnospcRes.statusCode).toBe(503);
        expect(thumbEnospcRes.json()).toEqual({
          error: "The server's storage is full.",
          code: "storage-full",
        });
      } finally {
        jpegOomSpy.mockRestore();
      }

      // Non-OOM RangeError in thumbnail generation still degrades to thumbnail: null (200)
      const jpegNonOomSpy = vi.spyOn(sharp.prototype, "jpeg").mockImplementationOnce(function (
        this: sharp.Sharp,
      ) {
        return {
          toBuffer: async () => {
            throw new RangeError("Invalid quality");
          },
        } as unknown as sharp.Sharp;
      });
      try {
        const thumbFallbackRes = await sendPair();
        expect(thumbFallbackRes.statusCode).toBe(200);
        expect(thumbFallbackRes.json().duplicateGroups[0].files[0].thumbnail).toBeNull();
      } finally {
        jpegNonOomSpy.mockRestore();
      }

      // 2. Per-file dHash (sharp.prototype.raw) hits V8 buffer allocation RangeError or ENOSPC -> 503
      const rawOomSpy = vi
        .spyOn(sharp.prototype, "raw")
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
              throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
                code: "ENOSPC",
              });
            },
          } as unknown as sharp.Sharp;
        });
      try {
        const hashOomRes = await sendPair();
        expect(hashOomRes.statusCode).toBe(503);
        expect(hashOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const hashEnospcRes = await sendPair();
        expect(hashEnospcRes.statusCode).toBe(503);
        expect(hashEnospcRes.json()).toEqual({
          error: "The server's storage is full.",
          code: "storage-full",
        });
      } finally {
        rawOomSpy.mockRestore();
      }

      // 3. Outer catch: a raw V8 buffer allocation RangeError escaping the hash error classifier -> 503 ENGINE_UNAVAILABLE
      const imageErrorMod = await import("../../../apps/api/src/lib/image-error.js");
      const classifySpy = vi
        .spyOn(imageErrorMod, "asInputErrorIfUndecodable")
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(new RangeError("Invalid count"));
      const rawThrowSpy = vi
        .spyOn(sharp.prototype, "raw")
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            toBuffer: async () => {
              throw new Error("hash step failed");
            },
          } as unknown as sharp.Sharp;
        })
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            toBuffer: async () => {
              throw new Error("hash step failed");
            },
          } as unknown as sharp.Sharp;
        });
      try {
        const outerOomRes = await sendPair();
        expect(outerOomRes.statusCode).toBe(503);
        expect(outerOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const outer422Res = await sendPair();
        expect(outer422Res.statusCode).toBe(422);
        expect(outer422Res.json()).toEqual({
          error: "Duplicate detection failed",
          details: "Invalid count",
        });
      } finally {
        rawThrowSpy.mockRestore();
        classifySpy.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
});

describe("outer processing catches in color-palette, split, stitch, beautify, and meme-generator (#3789)", () => {
  const oomMessage =
    "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";

  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
  });

  it("color-palette surfaces 503 ENGINE_UNAVAILABLE on V8 buffer allocation RangeError or SIGKILL in Sharp raw decode, and keeps 422 on non-OOM errors (#3789)", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const rawSpy = vi
      .spyOn(sharp.prototype, "raw")
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
            throw Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" });
          },
        } as unknown as sharp.Sharp;
      })
      .mockImplementationOnce(function (this: sharp.Sharp) {
        return {
          toBuffer: async () => {
            throw new RangeError("Invalid raw parameter");
          },
        } as unknown as sharp.Sharp;
      });
    const app = await buildApp(registerColorPalette);
    try {
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("color-palette"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      const badRes = await app.inject({
        method: "POST",
        url: apiToolPath("color-palette"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });
      expect(badRes.statusCode, badRes.body).toBe(422);
      expect(badRes.json()).toEqual({
        error: "Color extraction failed",
        details: "Invalid raw parameter",
      });
    } finally {
      rawSpy.mockRestore();
      await app.close();
    }
  });

  it("split surfaces 503 ENGINE_UNAVAILABLE before streaming when metadata() rejects with V8 RangeError or SIGKILL, and in its registered process function when encodeJxl rejects with OOM (#3789)", async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const origMetadata = sharp.prototype.metadata;
    let callCount = 0;
    let thirdCallError: Error = new RangeError("Array buffer allocation failed");
    const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(function (
      this: sharp.Sharp,
    ) {
      callCount += 1;
      // Call 1: validateImageBuffer, Call 2: autoOrient, Call 3: outer try block in split.ts
      if (callCount === 3) {
        return Promise.reject(thirdCallError);
      }
      return origMetadata.call(this);
    });
    const app = await buildApp(registerSplit);
    try {
      for (const err of [
        new RangeError("Array buffer allocation failed"),
        Object.assign(new Error("vips exited SIGKILL"), { signal: "SIGKILL" }),
      ]) {
        callCount = 0;
        thirdCallError = err;
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("split"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      callCount = 0;
      thirdCallError = new RangeError("Invalid metadata parameter");
      const badRes = await app.inject({
        method: "POST",
        url: apiToolPath("split"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });
      expect(badRes.statusCode, badRes.body).toBe(422);
      expect(badRes.json()).toEqual({
        error: "Split failed",
        details: "Invalid metadata parameter",
      });
    } finally {
      metaSpy.mockRestore();
      await app.close();
    }

    const splitConfig = getToolConfig("split");
    if (!splitConfig) throw new Error("split missing from toolRegistry");
    const jxlSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(
        Object.assign(new Error("cjxl exited SIGKILL"), { signal: "SIGKILL" }),
      );
    try {
      for (let i = 0; i < 2; i++) {
        await expect(
          splitConfig.process(
            png,
            splitConfig.settingsSchema.parse({ columns: 2, rows: 2, outputFormat: "jxl" }),
            "a.png",
          ),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          message: oomMessage,
        });
      }
    } finally {
      jxlSpy.mockRestore();
    }
  });

  it("stitch surfaces 503 ENGINE_UNAVAILABLE on V8 RangeError or SIGKILL and 503 storage-full/storage-not-writable on operational write errnos in its outer catch (#3789)", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const jxlSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockRejectedValueOnce(Object.assign(new Error("cjxl exited SIGKILL"), { signal: "SIGKILL" }))
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device, open '/tmp/jxl'"), {
          code: "ENOSPC",
          syscall: "open",
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("EACCES: permission denied, open '/tmp/jxl'"), {
          code: "EACCES",
          syscall: "open",
        }),
      )
      .mockRejectedValueOnce(new RangeError("Invalid cjxl parameter"));
    const app = await buildApp(registerStitch);
    try {
      const files = [
        { name: "a.png", type: "image/png", data: png },
        { name: "b.png", type: "image/png", data: png },
      ];
      for (let i = 0; i < 2; i++) {
        const oomRes = await app.inject({
          method: "POST",
          url: apiToolPath("stitch"),
          ...multipartBody(files, { format: "jxl" }),
        });
        expect(oomRes.statusCode, oomRes.body).toBe(503);
        expect(oomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      const enospcRes = await app.inject({
        method: "POST",
        url: apiToolPath("stitch"),
        ...multipartBody(files, { format: "jxl" }),
      });
      expect(enospcRes.statusCode, enospcRes.body).toBe(503);
      expect(enospcRes.json()).toMatchObject({ code: "storage-full" });

      const eaccesRes = await app.inject({
        method: "POST",
        url: apiToolPath("stitch"),
        ...multipartBody(files, { format: "jxl" }),
      });
      expect(eaccesRes.statusCode, eaccesRes.body).toBe(503);
      expect(eaccesRes.json()).toMatchObject({ code: "storage-not-writable" });

      const badRes = await app.inject({
        method: "POST",
        url: apiToolPath("stitch"),
        ...multipartBody(files, { format: "jxl" }),
      });
      expect(badRes.statusCode, badRes.body).toBe(422);
      expect(badRes.json()).toEqual({
        error: "Stitch creation failed",
        details: "Invalid cjxl parameter",
      });
    } finally {
      jxlSpy.mockRestore();
      await app.close();
    }
  });

  it("beautify and meme-generator surface 503 ENGINE_UNAVAILABLE on V8 RangeError or SIGKILL and 503 storage-full/storage-not-writable on operational write errnos in their outer catches (#3789)", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();

    const app = Fastify();
    await app.register(multipart);
    registerErrorHandler(app);
    registerBeautify(app);
    registerMemeGenerator(app);
    await app.ready();

    try {
      for (const toolId of ["beautify", "meme-generator"] as const) {
        putObject
          .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
          .mockRejectedValueOnce(
            Object.assign(new Error("worker exited SIGKILL"), { signal: "SIGKILL" }),
          )
          .mockRejectedValueOnce(
            Object.assign(new Error("ENOSPC: no space left on device, open '/tmp/out'"), {
              code: "ENOSPC",
              syscall: "open",
            }),
          )
          .mockRejectedValueOnce(
            Object.assign(new Error("EROFS: read-only file system, open '/tmp/out'"), {
              code: "EROFS",
              syscall: "open",
            }),
          )
          .mockRejectedValueOnce(new RangeError("Invalid output parameter"));

        for (let i = 0; i < 2; i++) {
          const oomRes = await app.inject({
            method: "POST",
            url: apiToolPath(toolId),
            ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
          });
          expect(oomRes.statusCode, `${toolId} OOM #${i}: ${oomRes.body}`).toBe(503);
          expect(oomRes.json()).toEqual({
            error: oomMessage,
            code: "ENGINE_UNAVAILABLE",
          });
        }

        const enospcRes = await app.inject({
          method: "POST",
          url: apiToolPath(toolId),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(enospcRes.statusCode, `${toolId} ENOSPC: ${enospcRes.body}`).toBe(503);
        expect(enospcRes.json()).toMatchObject({ code: "storage-full" });

        const erofsRes = await app.inject({
          method: "POST",
          url: apiToolPath(toolId),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(erofsRes.statusCode, `${toolId} EROFS: ${erofsRes.body}`).toBe(503);
        expect(erofsRes.json()).toMatchObject({ code: "storage-not-writable" });

        const badRes = await app.inject({
          method: "POST",
          url: apiToolPath(toolId),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(badRes.statusCode, `${toolId} non-OOM: ${badRes.body}`).toBe(422);
        expect(badRes.json()).toEqual({
          error: "Processing failed",
          details: "Invalid output parameter",
        });
      }

      // Direct Sharp pipeline step OOM in renderBeautify (webp output encode) and
      // processMeme (final output metadata read), on both HTTP routes and registered process fns
      const webpSpy = vi
        .spyOn(sharp.prototype, "webp")
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
      try {
        const beautifyHttpOom = await app.inject({
          method: "POST",
          url: apiToolPath("beautify"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }], {
            outputFormat: "webp",
            shadowPreset: "none",
          }),
        });
        expect(beautifyHttpOom.statusCode, beautifyHttpOom.body).toBe(503);
        expect(beautifyHttpOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const beautifyCfg = getToolConfig("beautify");
        if (!beautifyCfg) throw new Error("beautify missing from toolRegistry");
        await expect(
          beautifyCfg.process(
            png,
            beautifyCfg.settingsSchema.parse({ outputFormat: "webp", shadowPreset: "none" }),
            "a.png",
          ),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          message: oomMessage,
        });
      } finally {
        webpSpy.mockRestore();
      }

      const origMeta = sharp.prototype.metadata;
      let memeMetaCall = 0;
      const memeMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(function (
        this: sharp.Sharp,
      ) {
        memeMetaCall += 1;
        // Call 1: validateImageBuffer, Call 2: autoOrient, Call 3: processMeme input metadata, Call 4: processMeme output metadata
        if (memeMetaCall === 4) {
          return Promise.reject(new RangeError("Array buffer allocation failed"));
        }
        return origMeta.call(this);
      });
      try {
        memeMetaCall = 0;
        const memeHttpOom = await app.inject({
          method: "POST",
          url: apiToolPath("meme-generator"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(memeHttpOom.statusCode, memeHttpOom.body).toBe(503);
        expect(memeHttpOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        memeMetaCall = 0;
        const memeCfg = getToolConfig("meme-generator");
        if (!memeCfg) throw new Error("meme-generator missing from toolRegistry");
        await expect(
          memeCfg.process(png, memeCfg.settingsSchema.parse({}), "a.png"),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          message: oomMessage,
        });
      } finally {
        memeMetaSpy.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
});

describe("outer processing catches in compare, watermark-image, compose, vectorize, and content-aware-resize (#3905)", () => {
  const oomMessage =
    "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";

  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
  });

  it("compare, watermark-image, compose, vectorize, and content-aware-resize surface 503 ENGINE_UNAVAILABLE on V8 buffer allocation RangeError, SIGKILL, or libheif allocation failure and 503 storage-full/storage-not-writable on operational write errnos in their outer catches, while keeping 422 on non-OOM errors (#3905)", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();

    const app = Fastify();
    await app.register(multipart);
    registerErrorHandler(app);
    registerCompare(app);
    registerWatermarkImage(app);
    registerCompose(app);
    registerVectorize(app);
    registerContentAwareResize(app);
    await app.ready();

    const seamCarveSpy = vi
      .spyOn(aiMod, "seamCarve")
      .mockResolvedValue({ buffer: png, width: 8, height: 16 });

    try {
      const routeCases = [
        {
          toolId: "compare",
          url: "/api/v1/tools/image/compare",
          files: [
            { name: "a.png", type: "image/png", data: png },
            { name: "b.png", type: "image/png", data: png },
          ],
          settings: undefined,
          expected422Error: "Comparison failed",
        },
        {
          toolId: "watermark-image",
          url: "/api/v1/tools/image/watermark-image",
          files: [
            { field: "file", name: "main.png", type: "image/png", data: png },
            { field: "watermark", name: "wm.png", type: "image/png", data: png },
          ],
          settings: undefined,
          expected422Error: "Processing failed",
        },
        {
          toolId: "compose",
          url: "/api/v1/tools/image/compose",
          files: [
            { field: "file", name: "base.png", type: "image/png", data: png },
            { field: "overlay", name: "over.png", type: "image/png", data: png },
          ],
          settings: undefined,
          expected422Error: "Processing failed",
        },
        {
          toolId: "vectorize",
          url: "/api/v1/tools/image/vectorize",
          files: [{ name: "a.png", type: "image/png", data: png }],
          settings: undefined,
          expected422Error: "Vectorization failed",
        },
        {
          toolId: "content-aware-resize",
          url: "/api/v1/tools/image/content-aware-resize",
          files: [{ name: "a.png", type: "image/png", data: png }],
          settings: { width: 8 },
          expected422Error: "Content-aware resize failed",
        },
      ] as const;

      for (const route of routeCases) {
        putObject
          .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
          .mockRejectedValueOnce(
            Object.assign(new Error("worker exited SIGKILL"), { signal: "SIGKILL" }),
          )
          .mockRejectedValueOnce(
            new Error(
              "heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed",
            ),
          )
          .mockRejectedValueOnce(
            Object.assign(new Error("ENOSPC: no space left on device, open '/tmp/out'"), {
              code: "ENOSPC",
              syscall: "open",
            }),
          )
          .mockRejectedValueOnce(
            Object.assign(new Error("EACCES: permission denied, open '/tmp/out'"), {
              code: "EACCES",
              syscall: "open",
            }),
          )
          .mockRejectedValueOnce(
            Object.assign(new Error("EROFS: read-only file system, open '/tmp/out'"), {
              code: "EROFS",
              syscall: "open",
            }),
          )
          .mockRejectedValueOnce(new RangeError("Invalid output parameter"));

        for (let i = 0; i < 3; i++) {
          const oomRes = await app.inject({
            method: "POST",
            url: route.url,
            ...multipartBody([...route.files], route.settings),
          });
          expect(oomRes.statusCode, `${route.toolId} OOM #${i}: ${oomRes.body}`).toBe(503);
          expect(oomRes.json()).toEqual({
            error: oomMessage,
            code: "ENGINE_UNAVAILABLE",
          });
        }

        const enospcRes = await app.inject({
          method: "POST",
          url: route.url,
          ...multipartBody([...route.files], route.settings),
        });
        expect(enospcRes.statusCode, `${route.toolId} ENOSPC: ${enospcRes.body}`).toBe(503);
        expect(enospcRes.json()).toMatchObject({ code: "storage-full" });

        for (const label of ["EACCES", "EROFS"]) {
          const permRes = await app.inject({
            method: "POST",
            url: route.url,
            ...multipartBody([...route.files], route.settings),
          });
          expect(permRes.statusCode, `${route.toolId} ${label}: ${permRes.body}`).toBe(503);
          expect(permRes.json()).toMatchObject({ code: "storage-not-writable" });
        }

        const badRes = await app.inject({
          method: "POST",
          url: route.url,
          ...multipartBody([...route.files], route.settings),
        });
        expect(badRes.statusCode, `${route.toolId} non-OOM: ${badRes.body}`).toBe(422);
        expect(badRes.json()).toEqual({
          error: route.expected422Error,
          details: "Invalid output parameter",
        });
      }

      // Direct post-prepare processing step faults:
      // 1. compare diff PNG encode (sharp.prototype.png) hits V8 RangeError
      const pngSpy = vi.spyOn(sharp.prototype, "png").mockImplementationOnce(function (
        this: sharp.Sharp,
      ) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      });
      try {
        const compareStepOom = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compare",
          ...multipartBody([
            { name: "a.png", type: "image/png", data: png },
            { name: "b.png", type: "image/png", data: png },
          ]),
        });
        expect(compareStepOom.statusCode, compareStepOom.body).toBe(503);
        expect(compareStepOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      } finally {
        pngSpy.mockRestore();
      }

      // 2. watermark-image and compose composite step (sharp.prototype.composite) hits V8 RangeError
      const compositeSpy = vi
        .spyOn(sharp.prototype, "composite")
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
            toFormat: () => ({
              toBuffer: async () => {
                throw new RangeError("Array buffer allocation failed");
              },
            }),
          } as unknown as sharp.Sharp;
        })
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
            toFormat: () => ({
              toBuffer: async () => {
                throw new RangeError("Array buffer allocation failed");
              },
            }),
          } as unknown as sharp.Sharp;
        });
      try {
        const wmStepOom = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/watermark-image",
          ...multipartBody([
            { field: "file", name: "main.png", type: "image/png", data: png },
            { field: "watermark", name: "wm.png", type: "image/png", data: png },
          ]),
        });
        expect(wmStepOom.statusCode, wmStepOom.body).toBe(503);
        expect(wmStepOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const composeStepOom = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compose",
          ...multipartBody([
            { field: "file", name: "base.png", type: "image/png", data: png },
            { field: "overlay", name: "over.png", type: "image/png", data: png },
          ]),
        });
        expect(composeStepOom.statusCode, composeStepOom.body).toBe(503);
        expect(composeStepOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      } finally {
        compositeSpy.mockRestore();
      }

      // 3. vectorize grayscale step (sharp.prototype.grayscale) hits V8 RangeError on HTTP route and registered process fn
      const grayscaleSpy = vi
        .spyOn(sharp.prototype, "grayscale")
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            png: () => ({
              toBuffer: async () => {
                throw new RangeError("Array buffer allocation failed");
              },
            }),
          } as unknown as sharp.Sharp;
        })
        .mockImplementationOnce(function (this: sharp.Sharp) {
          return {
            png: () => ({
              toBuffer: async () => {
                throw new RangeError("Array buffer allocation failed");
              },
            }),
          } as unknown as sharp.Sharp;
        });
      try {
        const vectorizeStepOom = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/vectorize",
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(vectorizeStepOom.statusCode, vectorizeStepOom.body).toBe(503);
        expect(vectorizeStepOom.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const vectorizeCfg = getToolConfig("vectorize");
        if (!vectorizeCfg) throw new Error("vectorize missing from toolRegistry");
        await expect(
          vectorizeCfg.process(png, vectorizeCfg.settingsSchema.parse({}), "a.png"),
        ).rejects.toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          message: oomMessage,
        });
      } finally {
        grayscaleSpy.mockRestore();
      }

      // 4. content-aware-resize seamCarve rejects with V8 RangeError, SIGKILL, or ENOSPC
      seamCarveSpy
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(
          Object.assign(new Error("caire exited SIGKILL"), { signal: "SIGKILL" }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error("ENOSPC: no space left on device, open '/tmp/caire'"), {
            code: "ENOSPC",
            syscall: "open",
          }),
        );

      for (let i = 0; i < 2; i++) {
        const carveOomRes = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/content-aware-resize",
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }], { width: 8 }),
        });
        expect(carveOomRes.statusCode, carveOomRes.body).toBe(503);
        expect(carveOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }

      const carveEnospcRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/content-aware-resize",
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }], { width: 8 }),
      });
      expect(carveEnospcRes.statusCode, carveEnospcRes.body).toBe(503);
      expect(carveEnospcRes.json()).toMatchObject({ code: "storage-full" });
    } finally {
      seamCarveSpy.mockRestore();
      await app.close();
    }
  });
});
