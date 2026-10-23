import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { openAnimated } from "../../../apps/api/src/lib/animated-image.js";
import * as fileValidation from "../../../apps/api/src/lib/file-validation.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import * as imageInputPrep from "../../../apps/api/src/lib/image-input-prep.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";

const mocks = vi.hoisted(() => ({
  reportError: vi.fn(),
}));

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>()),
  reportError: mocks.reportError,
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/file-validation.js")>();
  return {
    ...actual,
    validateImageBuffer: vi.fn((...args: Parameters<typeof actual.validateImageBuffer>) =>
      actual.validateImageBuffer(...args),
    ),
  };
});

vi.mock("../../../apps/api/src/lib/image-input-prep.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/image-input-prep.js")>();
  return {
    ...actual,
    prepareRouteImage: vi.fn((...args: Parameters<typeof actual.prepareRouteImage>) =>
      actual.prepareRouteImage(...args),
    ),
  };
});

vi.mock("../../../apps/api/src/lib/format-encoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-encoders.js")>();
  return {
    ...actual,
    encodeJxl: vi.fn((...args: Parameters<typeof actual.encodeJxl>) => actual.encodeJxl(...args)),
  };
});

vi.mock("../../../apps/api/src/lib/animated-image.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/animated-image.js")>();
  return {
    ...actual,
    openAnimated: vi.fn((...args: Parameters<typeof actual.openAnimated>) =>
      actual.openAnimated(...args),
    ),
  };
});

describe("POST /api/v1/tools/image/optimize-for-web/preview SVG/SVGZ handling (#3083)", () => {
  async function invokePreviewRoute(
    parts: Array<
      | { type: "file"; filename: string; content: Buffer }
      | { type: "field"; fieldname: string; value: string }
    >,
    log: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } = {
      error: vi.fn(),
      warn: vi.fn(),
    },
  ) {
    let handler: ((req: unknown, rep: unknown) => Promise<unknown>) | undefined;
    registerOptimizeForWeb({
      post: vi.fn((url: string, fn: typeof handler) => {
        if (url === "/api/v1/tools/image/optimize-for-web/preview") handler = fn;
      }),
    } as never);

    const headers: Record<string, string> = {};
    const request = {
      headers: {},
      log,
      parts: async function* () {
        for (const p of parts) {
          if (p.type === "file") {
            yield {
              type: "file" as const,
              fieldname: "file",
              filename: p.filename,
              file: Readable.from([p.content]),
            };
          } else {
            yield p;
          }
        }
      },
    };
    const reply = {
      statusCode: 200,
      headers,
      payload: undefined as unknown,
      header(key: string, val: string) {
        headers[key.toLowerCase()] = val;
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };

    await handler?.(request, reply);
    return reply;
  }

  it("decompresses and sanitizes .svgz inputs before rendering preview (#3083)", async () => {
    vi.mocked(openAnimated).mockClear();
    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><rect width="100" height="100" fill="red"/></svg>',
      "utf-8",
    );
    const svgz = gzipSync(rawSvg);

    const reply = await invokePreviewRoute([
      { type: "file", filename: "icon.svgz", content: svgz },
      { type: "field", fieldname: "settings", value: '{"format":"webp","quality":80}' },
    ]);

    expect(reply.statusCode).toBe(200);
    expect(reply.headers["content-type"]).toBe("image/webp");
    expect(Buffer.isBuffer(reply.payload)).toBe(true);
    expect((reply.payload as Buffer).length).toBeGreaterThan(0);
    expect(openAnimated).toHaveBeenCalledTimes(1);
    const passedSvg = vi.mocked(openAnimated).mock.calls[0]?.[0]?.toString("utf-8") ?? "";
    expect(passedSvg).toContain("<svg");
    expect(passedSvg).not.toContain("<script");
    expect(passedSvg).not.toContain("alert(1)");
  });

  it("returns 400 when .svgz decompression or SVG sanitization fails on preview (#3083)", async () => {
    const notSvgSvgz = gzipSync(Buffer.from("not an svg document", "utf-8"));
    const badSvgzReply = await invokePreviewRoute([
      { type: "file", filename: "bad.svgz", content: notSvgSvgz },
    ]);
    expect(badSvgzReply.statusCode).toBe(400);
    expect(badSvgzReply.payload).toEqual({
      error: "SVGZ file does not contain valid SVG content after decompression",
    });

    const overElementSvg = gzipSync(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
        "utf-8",
      ),
    );
    const overCapReply = await invokePreviewRoute([
      { type: "file", filename: "too-many.svgz", content: overElementSvg },
    ]);
    expect(overCapReply.statusCode).toBe(400);
    expect(overCapReply.payload).toEqual({
      error: "SVG exceeds maximum element count of 5000",
    });
  });

  it("routes validateImageBuffer DecoderOutOfMemoryError and 5xx faults through sendInputValidationError, deduplicating within the 10-minute window (#3831)", async () => {
    const validPng = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
    let fakeNow = Date.now() + 20 * 60_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    try {
      mocks.reportError.mockClear();
      const metaSpy = vi
        .spyOn(sharp.prototype, "metadata")
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"));
      try {
        const log = { error: vi.fn(), warn: vi.fn() };
        for (let attempt = 0; attempt < 2; attempt++) {
          const reply = await invokePreviewRoute(
            [{ type: "file", filename: "photo.png", content: validPng }],
            log,
          );
          expect(reply.statusCode).toBe(503);
          expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
        }
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "ENGINE_UNAVAILABLE",
            cause: "DecoderOutOfMemoryError",
            toolId: "optimize-for-web",
          }),
          "Tool engine unavailable during input preparation",
        );
        expect(mocks.reportError).toHaveBeenCalledTimes(1);
      } finally {
        metaSpy.mockRestore();
      }

      fakeNow += 11 * 60_000;
      mocks.reportError.mockClear();
      const storageFullErr = Object.assign(new Error("The server's storage is full."), {
        isSafeMessage: true,
        statusCode: 503,
        code: "storage-full",
      });
      vi.mocked(fileValidation.validateImageBuffer).mockRejectedValueOnce(storageFullErr);
      const storageReply = await invokePreviewRoute([
        { type: "file", filename: "photo.png", content: validPng },
      ]);
      expect(storageReply.statusCode).toBe(503);
      expect(storageReply.payload).toEqual({
        error: "The server's storage is full.",
        code: "storage-full",
      });

      const unexpectedValidateErr = new TypeError("unexpected preview validator fault");
      vi.mocked(fileValidation.validateImageBuffer).mockRejectedValueOnce(unexpectedValidateErr);
      await expect(
        invokePreviewRoute([{ type: "file", filename: "photo.png", content: validPng }]),
      ).rejects.toBe(unexpectedValidateErr);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("routes prepareRouteImage and processImage V8 OOM and SIGKILL faults through sendInputValidationError as 503 ENGINE_UNAVAILABLE (#3773)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    const validPng = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
    let fakeNow = Date.now() + 60 * 60_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    try {
      // 1. prepareRouteImage rejecting with raw RangeError("Array buffer allocation failed") and SIGKILL
      fakeNow += 11 * 60_000;
      mocks.reportError.mockClear();
      vi.mocked(imageInputPrep.prepareRouteImage)
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(
          Object.assign(new Error("Command failed: heif-dec"), {
            signal: "SIGKILL",
            killed: true,
          }),
        );
      const prepLog = { error: vi.fn(), warn: vi.fn() };
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await invokePreviewRoute(
          [{ type: "file", filename: "photo.png", content: validPng }],
          prepLog,
        );
        expect(reply.statusCode).toBe(503);
        expect(reply.payload).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }
      expect(prepLog.error).not.toHaveBeenCalled();
      expect(prepLog.warn).toHaveBeenCalledTimes(1);
      expect(prepLog.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "ENGINE_UNAVAILABLE",
          cause: "DecoderOutOfMemoryError",
          toolId: "optimize-for-web",
        }),
        "Tool engine unavailable during input preparation",
      );
      expect(mocks.reportError).toHaveBeenCalledTimes(1);

      // 2. processImage (sharp.prototype.webp and encodeJxl) rejecting with V8 OOM and SIGKILL
      fakeNow += 11 * 60_000;
      mocks.reportError.mockClear();
      const webpSpy = vi.spyOn(sharp.prototype, "webp").mockImplementationOnce(() => {
        throw new RangeError("Array buffer allocation failed");
      });
      try {
        const webpLog = { error: vi.fn(), warn: vi.fn() };
        const webpOomReply = await invokePreviewRoute(
          [{ type: "file", filename: "photo.png", content: validPng }],
          webpLog,
        );
        expect(webpOomReply.statusCode).toBe(503);
        expect(webpOomReply.payload).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
        expect(webpLog.error).not.toHaveBeenCalled();
        expect(webpLog.warn).toHaveBeenCalledTimes(1);
      } finally {
        webpSpy.mockRestore();
      }

      vi.mocked(formatEncoders.encodeJxl)
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(
          Object.assign(new Error("Command failed: cjxl"), {
            signal: "SIGKILL",
            killed: true,
          }),
        );
      const jxlLog = { error: vi.fn(), warn: vi.fn() };
      for (let attempt = 0; attempt < 2; attempt++) {
        const jxlReply = await invokePreviewRoute(
          [
            { type: "file", filename: "photo.png", content: validPng },
            { type: "field", fieldname: "settings", value: '{"format":"jxl","quality":80}' },
          ],
          jxlLog,
        );
        expect(jxlReply.statusCode).toBe(503);
        expect(jxlReply.payload).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }
      expect(jxlLog.error).not.toHaveBeenCalled();
      expect(jxlLog.warn).not.toHaveBeenCalled();
      expect(mocks.reportError).toHaveBeenCalledTimes(1);

      // 3. Non-OOM operational write fault in prepareRouteImage and processImage still rethrows 503 storage-full,
      // and ToolInputError / non-OOM Error still return 422
      vi.mocked(imageInputPrep.prepareRouteImage).mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }),
      );
      await expect(
        invokePreviewRoute([{ type: "file", filename: "photo.png", content: validPng }]),
      ).rejects.toMatchObject({
        statusCode: 503,
        code: "storage-full",
      });

      vi.mocked(imageInputPrep.prepareRouteImage).mockRejectedValueOnce(
        new Error("decode failed on /tmp/prep-in.png"),
      );
      const prepErrLog = { error: vi.fn(), warn: vi.fn() };
      const prepErrReply = await invokePreviewRoute(
        [{ type: "file", filename: "photo.png", content: validPng }],
        prepErrLog,
      );
      expect(prepErrReply.statusCode).toBe(422);
      expect(prepErrReply.payload).toEqual({
        error: "Failed to decode png file",
        details: "decode failed on [internal]",
      });
      expect(prepErrLog.error).toHaveBeenCalledTimes(1);

      vi.mocked(formatEncoders.encodeJxl).mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }),
      );
      await expect(
        invokePreviewRoute([
          { type: "file", filename: "photo.png", content: validPng },
          { type: "field", fieldname: "settings", value: '{"format":"jxl","quality":80}' },
        ]),
      ).rejects.toMatchObject({
        statusCode: 503,
        code: "storage-full",
      });

      vi.mocked(formatEncoders.encodeJxl).mockRejectedValueOnce(
        new ToolInputError("Unsupported JXL input dimensions"),
      );
      const inputErrLog = { error: vi.fn(), warn: vi.fn() };
      const inputErrReply = await invokePreviewRoute(
        [
          { type: "file", filename: "photo.png", content: validPng },
          { type: "field", fieldname: "settings", value: '{"format":"jxl","quality":80}' },
        ],
        inputErrLog,
      );
      expect(inputErrReply.statusCode).toBe(422);
      expect(inputErrReply.payload).toEqual({
        error: "Preview failed",
        details: "Unsupported JXL input dimensions",
      });
      expect(inputErrLog.error).not.toHaveBeenCalled();

      vi.mocked(formatEncoders.encodeJxl).mockRejectedValueOnce(
        new Error("cjxl failed on /tmp/jxl-enc-in.png"),
      );
      const plainErrLog = { error: vi.fn(), warn: vi.fn() };
      const plainErrReply = await invokePreviewRoute(
        [
          { type: "file", filename: "photo.png", content: validPng },
          { type: "field", fieldname: "settings", value: '{"format":"jxl","quality":80}' },
        ],
        plainErrLog,
      );
      expect(plainErrReply.statusCode).toBe(422);
      expect(plainErrReply.payload).toEqual({
        error: "Preview failed",
        details: "cjxl failed on [internal]",
      });
      expect(plainErrLog.error).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
