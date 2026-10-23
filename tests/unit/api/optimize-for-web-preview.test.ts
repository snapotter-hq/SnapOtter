import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { openAnimated } from "../../../apps/api/src/lib/animated-image.js";
import * as fileValidation from "../../../apps/api/src/lib/file-validation.js";
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
});
