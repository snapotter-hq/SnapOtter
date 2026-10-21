/**
 * #2119: the effects route reads the `_mask.png` and `_original.png` an earlier
 * remove-background run stored, and that read used to sit inside the catch-all
 * that answers 422. Storage clients throw raw errors with no statusCode, so a
 * missing object and a storage fault both read as "Effects processing failed",
 * with the absolute path in `details`. A missing object now answers 410 with a
 * code the client acts on (run the removal again); a storage fault reaches the
 * error handler and Sentry. Same split as passport-photo generate (#1674).
 */

import { gzipSync } from "node:zlib";
import multipart from "@fastify/multipart";
import { isToolInputError } from "@snapotter/shared";
import Fastify, { type FastifyRequest } from "fastify";
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

import * as autoOrientModule from "../../../apps/api/src/lib/auto-orient.js";
import * as bgEffects from "../../../apps/api/src/lib/bg-effects.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import { UNDECODABLE_IMAGE_MESSAGE } from "../../../apps/api/src/lib/image-error.js";
import * as svgSanitize from "../../../apps/api/src/lib/svg-sanitize.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const EFFECTS_URL = "/api/v1/tools/image/remove-background/effects";

const requestLogError = vi.fn();

async function buildApp() {
  const app = Fastify();
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (vi.isMockFunction(req.log.error)) return;
    const origError = req.log.error.bind(req.log);
    vi.spyOn(req.log, "error").mockImplementation(((...args: unknown[]) => {
      requestLogError(...args);
      return (origError as (...a: unknown[]) => unknown)(...args);
    }) as typeof req.log.error);
  });
  await app.register(multipart);
  registerErrorHandler(app);
  registerRemoveBackground(app);
  await app.ready();
  return app;
}

function effectsRequest(
  settings: Record<string, unknown>,
  backgroundImage?: { filename: string; contentType: string; content: Buffer },
) {
  const boundary = "----unit";
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
    ),
  ];
  if (backgroundImage) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="backgroundImage"; filename="${backgroundImage.filename}"\r\nContent-Type: ${backgroundImage.contentType}\r\n\r\n`,
      ),
      backgroundImage.content,
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    method: "POST" as const,
    url: EFFECTS_URL,
    payload: Buffer.concat(parts),
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
    requestLogError.mockReset();
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

  it("answers 400 Invalid background image when backgroundImage fails validateImageBuffer (#2827)", async () => {
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png")
        ? sharp(await png(3))
            .greyscale()
            .png()
            .toBuffer()
        : png(3),
    );
    app = await buildApp();
    const res = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "bg.png",
          contentType: "image/png",
          content: Buffer.from("not an image"),
        },
      ),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/^Invalid background image:/);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("answers 422 UNDECODABLE_IMAGE_MESSAGE when backgroundImage passes header validation but fails pixel decode", async () => {
    const truncatedJpg = readFixture(fixtures.image.hostile.truncated);
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png")
        ? sharp(await png(3))
            .greyscale()
            .png()
            .toBuffer()
        : png(3),
    );
    app = await buildApp();
    const res = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "truncated.jpg",
          contentType: "image/jpeg",
          content: truncatedJpg,
        },
      ),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "Effects processing failed",
      details: UNDECODABLE_IMAGE_MESSAGE,
    });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("composites a valid uploaded backgroundImage when backgroundType is image", async () => {
    const validBg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    const transparentMask = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png") ? transparentMask : png(3),
    );
    putObject.mockResolvedValue(undefined);
    app = await buildApp();
    const res = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "bg.png",
          contentType: "image/png",
          content: validBg,
        },
      ),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().downloadUrl).toContain("/api/v1/download/job/");
    expect(putObject).toHaveBeenCalledTimes(1);
    const savedBuf = putObject.mock.calls[0]?.[1] as Buffer;
    const { data } = await sharp(savedBuf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 4)]).toEqual([0, 255, 0, 255]);
  });

  it("ignores an unused backgroundImage part when backgroundType is not image", async () => {
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
      effectsRequest(
        { ...settings, backgroundType: "color", backgroundColor: "#ff0000" },
        {
          filename: "unused.bin",
          contentType: "application/octet-stream",
          content: Buffer.from("not an image"),
        },
      ),
    );
    expect(res.statusCode).toBe(200);
    expect(putObject).toHaveBeenCalledTimes(1);
  });

  it("decompresses and sanitizes .svg and .svgz backgroundImage uploads before compositing (#2845)", async () => {
    const transparentMask = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png") ? transparentMask : png(3),
    );
    putObject.mockResolvedValue(undefined);

    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    const applySpy = vi.spyOn(bgEffects, "applyEffects");
    const orientSpy = vi.spyOn(autoOrientModule, "autoOrient");
    try {
      const rawSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><feImage href="http://127.0.0.1:9/ssrf"/><script>alert(1)</script><rect width="8" height="8" fill="#00ff00"/></svg>',
      );
      const svgz = gzipSync(rawSvg);

      app = await buildApp();
      const resSvg = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.svg",
            contentType: "image/svg+xml",
            content: rawSvg,
          },
        ),
      );
      expect(resSvg.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);
      const sanitizedSvg = sanitizeSpy.mock.results[0]?.value as Buffer;
      expect(sanitizedSvg.toString("utf-8")).not.toContain("<script");
      expect(sanitizedSvg.toString("utf-8")).not.toContain("127.0.0.1");
      expect(applySpy.mock.calls[0]?.[2]?.backgroundImageBuffer).toEqual(sanitizedSvg);

      const resSvgz = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.svgz",
            contentType: "image/svg+xml",
            content: svgz,
          },
        ),
      );
      expect(resSvgz.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(2);
      expect(orientSpy).not.toHaveBeenCalled();
      const savedSvgzBuf = putObject.mock.calls[1]?.[1] as Buffer;
      const { data } = await sharp(savedSvgzBuf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([...data.subarray(0, 4)]).toEqual([0, 255, 0, 255]);

      // Comment-padded SVGs uploaded with .apng or .tga extensions still pass through sanitizeSvg
      const longComment = `<!-- ${"x".repeat(4500)} -->`;
      const commentPaddedSvg = Buffer.from(
        `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script><rect width="8" height="8" fill="#00ff00"/></svg>`,
      );
      const resApngSvg = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "padded.apng",
            contentType: "image/apng",
            content: commentPaddedSvg,
          },
        ),
      );
      expect(resApngSvg.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(3);

      const resTgaSvg = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "padded.tga",
            contentType: "image/x-tga",
            content: commentPaddedSvg,
          },
        ),
      );
      expect(resTgaSvg.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(4);
    } finally {
      sanitizeSpy.mockRestore();
      applySpy.mockRestore();
      orientSpy.mockRestore();
    }
  });

  it("answers 400 when an .svg or .svgz backgroundImage fails decompressSvgz or sanitizeSvg (#2845)", async () => {
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png")
        ? sharp(await png(3))
            .greyscale()
            .png()
            .toBuffer()
        : png(3),
    );
    app = await buildApp();

    const tooManyElementsSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">${"<rect/>".repeat(5005)}</svg>`,
    );
    const resBomb = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "bomb.svg",
          contentType: "image/svg+xml",
          content: tooManyElementsSvg,
        },
      ),
    );
    expect(resBomb.statusCode).toBe(400);
    expect(resBomb.json().error).toContain("maximum element count");

    const nonSvgSvgz = gzipSync(Buffer.from("<html><body>not an svg</body></html>"));
    const resNonSvg = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "not-svg.svgz",
          contentType: "image/svg+xml",
          content: nonSvgSvgz,
        },
      ),
    );
    expect(resNonSvg.statusCode).toBe(400);
    expect(resNonSvg.json().error).toContain("valid SVG content");

    const corruptSvgz = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
    const resCorrupt = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "corrupt.svgz",
          contentType: "image/svg+xml",
          content: corruptSvgz,
        },
      ),
    );
    expect(resCorrupt.statusCode).toBe(400);
    expect(requestLogError).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("auto-orients an EXIF-rotated backgroundImage before compositing (#2845)", async () => {
    const transparentMask = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png") ? transparentMask : png(3),
    );
    putObject.mockResolvedValue(undefined);

    // 8x8 JPEG where top-left 4x4 is green and rest is red, tagged with EXIF orientation 3 (180 deg).
    // After autoOrient rotates 180 degrees, top-left (1,1) is red and bottom-right (6,6) is green.
    const greenPatch = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    const exifRotatedJpg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .composite([{ input: greenPatch, left: 0, top: 0 }])
      .withMetadata({ orientation: 3 })
      .jpeg({ quality: 100 })
      .toBuffer();

    const orientSpy = vi.spyOn(autoOrientModule, "autoOrient");
    try {
      app = await buildApp();
      const res = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "rotated.jpg",
            contentType: "image/jpeg",
            content: exifRotatedJpg,
          },
        ),
      );
      expect(res.statusCode).toBe(200);
      expect(orientSpy).toHaveBeenCalledTimes(1);
      expect(orientSpy.mock.calls[0]?.[1]).toBeDefined();
      const savedBuf = putObject.mock.calls[0]?.[1] as Buffer;
      const { data, info } = await sharp(savedBuf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const topLeftIdx = (1 * info.width + 1) * info.channels;
      const bottomRightIdx = (6 * info.width + 6) * info.channels;
      expect(data[topLeftIdx]).toBeGreaterThan(180);
      expect(data[topLeftIdx + 1]).toBeLessThan(60);
      expect(data[bottomRightIdx + 1]).toBeGreaterThan(180);
      expect(data[bottomRightIdx]).toBeLessThan(60);
    } finally {
      orientSpy.mockRestore();
    }
  });

  it("passes lowercase fileExt to decodeToSharpCompat and suppresses error logs on corrupt CLI or HEIC backgroundImage (#2845)", async () => {
    const validPng = await png(3);
    getObjectBuffer.mockImplementation(async (key: string) =>
      key.endsWith("_mask.png") ? sharp(validPng).greyscale().png().toBuffer() : validPng,
    );
    putObject.mockResolvedValue(undefined);
    app = await buildApp();

    // 1. Forwards lowercase fileExt (and undefined when extensionless) to decodeToSharpCompat
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValue(validPng);
    try {
      const resDng = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.CR3",
            contentType: "image/x-canon-cr3",
            content: Buffer.from("fake-raw-header"),
          },
        ),
      );
      expect(resDng.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenCalledWith(Buffer.from("fake-raw-header"), "raw", "cr3");

      const psdHeader = Buffer.alloc(32, 0);
      psdHeader.write("8BPS", 0, "ascii");
      psdHeader.writeUInt16BE(1, 4);
      const resNoExt = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "background",
            contentType: "image/vnd.adobe.photoshop",
            content: psdHeader,
          },
        ),
      );
      expect(resNoExt.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenLastCalledWith(psdHeader, "psd", undefined);
    } finally {
      cliSpy.mockRestore();
    }

    // 2. Corrupt CLI-decoded upload (e.g. bg.tga with arbitrary bytes) returns 422 without request.log.error
    requestLogError.mockReset();
    const resCorruptTga = await app.inject(
      effectsRequest(
        { ...settings, backgroundType: "image" },
        {
          filename: "bg.tga",
          contentType: "image/x-tga",
          content: Buffer.from("not an image"),
        },
      ),
    );
    expect(resCorruptTga.statusCode).toBe(422);
    expect(resCorruptTga.json()).toEqual({
      error: "Effects processing failed",
      details: UNDECODABLE_IMAGE_MESSAGE,
    });
    expect(requestLogError).not.toHaveBeenCalled();

    // 3. Corrupt HEIC upload rejected by decodeHeic returns 422 without request.log.error
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error("Could not read HEIF input"));
    try {
      requestLogError.mockReset();
      const resCorruptHeic = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.heic",
            contentType: "image/heic",
            content: readFixture(fixtures.image.base.heic200),
          },
        ),
      );
      expect(resCorruptHeic.statusCode).toBe(422);
      expect(requestLogError).not.toHaveBeenCalled();
    } finally {
      heicSpy.mockRestore();
    }

    // 4. DecoderUnavailableError from decodeHeic and decodeToSharpCompat reaches error handler as 503 without ToolInputError marker
    const unavailableCli = new formatDecoders.DecoderUnavailableError("No magick found");
    const cliUnavailSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(unavailableCli);
    try {
      const resCli503 = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.tga",
            contentType: "image/x-tga",
            content: Buffer.from("not an image"),
          },
        ),
      );
      expect(resCli503.statusCode).toBe(503);
      expect(resCli503.json().code).toBe("ENGINE_UNAVAILABLE");
      expect(isToolInputError(unavailableCli)).toBe(false);
    } finally {
      cliUnavailSpy.mockRestore();
    }

    const unavailableHeic = new formatDecoders.DecoderUnavailableError("No heif-dec found");
    const heicUnavailSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(unavailableHeic);
    try {
      const resHeic503 = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.heic",
            contentType: "image/heic",
            content: readFixture(fixtures.image.base.heic200),
          },
        ),
      );
      expect(resHeic503.statusCode).toBe(503);
      expect(resHeic503.json().code).toBe("ENGINE_UNAVAILABLE");
      expect(isToolInputError(unavailableHeic)).toBe(false);
    } finally {
      heicUnavailSpy.mockRestore();
    }

    // 5. Operational errno (ENOSPC) from decodeToSharpCompat or decodeHeic is normalized to 503 storage-full
    const enospc = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
    });
    const cliEnospcSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(enospc);
    try {
      requestLogError.mockReset();
      const resEnospc = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.tga",
            contentType: "image/x-tga",
            content: Buffer.from("not an image"),
          },
        ),
      );
      expect(resEnospc.statusCode).toBe(503);
      expect(resEnospc.json().code).toBe("storage-full");
      expect(isToolInputError(enospc)).toBe(false);
    } finally {
      cliEnospcSpy.mockRestore();
    }

    const heicEnospc = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
    });
    const heicEnospcSpy = vi.spyOn(heicConverter, "decodeHeic").mockRejectedValueOnce(heicEnospc);
    try {
      const resHeicEnospc = await app.inject(
        effectsRequest(
          { ...settings, backgroundType: "image" },
          {
            filename: "bg.heic",
            contentType: "image/heic",
            content: readFixture(fixtures.image.base.heic200),
          },
        ),
      );
      expect(resHeicEnospc.statusCode).toBe(503);
      expect(resHeicEnospc.json().code).toBe("storage-full");
      expect(isToolInputError(heicEnospc)).toBe(false);
    } finally {
      heicEnospcSpy.mockRestore();
    }
  });
});
