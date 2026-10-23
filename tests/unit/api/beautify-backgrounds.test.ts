import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { isToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  generateBackground,
  getDominantBackground,
} from "../../../apps/api/src/lib/beautify/backgrounds.js";
import { settingsSchema } from "../../../apps/api/src/lib/beautify/constants.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import { UNDECODABLE_IMAGE_MESSAGE } from "../../../apps/api/src/lib/image-error.js";
import * as objectStorage from "../../../apps/api/src/lib/object-storage.js";
import * as svgSanitize from "../../../apps/api/src/lib/svg-sanitize.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { processBeautify, registerBeautify } from "../../../apps/api/src/routes/tools/beautify.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe("generateBackground", () => {
  it("generates a solid color background", async () => {
    const buf = await generateBackground({
      type: "solid",
      color: "#ff0000",
      width: 200,
      height: 100,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.channels).toBe(4);
  });

  it("generates a linear gradient background", async () => {
    const buf = await generateBackground({
      type: "linear-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
      angle: 135,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates a radial gradient background", async () => {
    const buf = await generateBackground({
      type: "radial-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates a transparent background", async () => {
    const buf = await generateBackground({
      type: "transparent",
      width: 200,
      height: 100,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.hasAlpha).toBe(true);
  });

  it("generates an image background", async () => {
    const red = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const buf = await generateBackground({
      type: "image",
      imageBuffer: red,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates multi-stop linear gradient", async () => {
    const buf = await generateBackground({
      type: "linear-gradient",
      stops: [
        { color: "#0f0c29", position: 0 },
        { color: "#302b63", position: 50 },
        { color: "#24243e", position: 100 },
      ],
      angle: 135,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});

describe("getDominantBackground", () => {
  it("returns solid color for solid type", () => {
    const result = getDominantBackground({ type: "solid", color: "#ff0000" });
    expect(result).toEqual({ r: 255, g: 0, b: 0, alpha: 1 });
  });

  it("returns last gradient stop for gradient type", () => {
    const result = getDominantBackground({
      type: "linear-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
    });
    expect(result.r).toBe(118);
    expect(result.g).toBe(75);
    expect(result.b).toBe(162);
  });

  it("returns transparent for transparent type", () => {
    const result = getDominantBackground({ type: "transparent" });
    expect(result.alpha).toBe(0);
  });
});

describe("beautify route and processBeautify validation & backgroundImage preparation (#3104)", () => {
  type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
  let handler: RouteHandler;
  let memeHandler: RouteHandler;
  const PNG_200 = readFixture(fixtures.image.base.png200);
  const storedObjects = new Map<string, Buffer>();

  beforeAll(() => {
    vi.spyOn(objectStorage, "putObject").mockImplementation(async (key: string, buf: Buffer) => {
      storedObjects.set(key, buf);
    });
    const fakeApp = {
      post: vi.fn((path: string, fn: RouteHandler) => {
        if (path.endsWith("/meme-generator")) {
          memeHandler = fn;
        } else {
          handler = fn;
        }
      }),
    } as unknown as Parameters<typeof registerBeautify>[0];
    registerMemeGenerator(fakeApp);
    registerBeautify(fakeApp);
  });

  async function invokeBeautify(opts: {
    file?: { filename: string; content: Buffer };
    backgroundImage?: { filename: string; content: Buffer };
    settings?: Record<string, unknown>;
  }) {
    let statusCode = 200;
    let body: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(payload: unknown) {
        body = payload;
        return reply;
      },
    };
    const requestLog = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const request = {
      log: requestLog,
      async *parts() {
        if (opts.file) {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: opts.file.filename,
            file: Readable.from([opts.file.content]),
          };
        }
        if (opts.backgroundImage) {
          yield {
            type: "file" as const,
            fieldname: "backgroundImage",
            filename: opts.backgroundImage.filename,
            file: Readable.from([opts.backgroundImage.content]),
          };
        }
        if (opts.settings !== undefined) {
          yield {
            type: "field" as const,
            fieldname: "settings",
            value: JSON.stringify(opts.settings),
          };
        }
      },
    };
    await handler(request, reply);
    return {
      statusCode,
      json: body as Record<string, unknown>,
      requestLog,
    };
  }

  async function invokeMemeMultipart(
    filename: string,
    content: Buffer,
    settings: Record<string, unknown> = { textBoxes: [] },
  ) {
    let statusCode = 200;
    let body: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(payload: unknown) {
        body = payload;
        return reply;
      },
    };
    const requestLog = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const request = {
      log: requestLog,
      headers: { "content-type": "multipart/form-data; boundary=test" },
      async *parts() {
        yield {
          type: "file" as const,
          fieldname: "file",
          filename,
          file: Readable.from([content]),
        };
        yield {
          type: "field" as const,
          fieldname: "settings",
          value: JSON.stringify(settings),
        };
      },
    };
    await memeHandler(request, reply);
    return { statusCode, json: body as Record<string, unknown>, requestLog };
  }

  it("rejects main image exceeding MAX_MEGAPIXELS with 400", async () => {
    const twoMpPng = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    const prevMaxMp = env.MAX_MEGAPIXELS;
    (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = 1;
    try {
      const { statusCode, json } = await invokeBeautify({
        file: { filename: "huge.png", content: twoMpPng },
        settings: {},
      });

      expect(statusCode).toBe(400);
      expect(json.error).toBe("Invalid image: Image exceeds maximum size: 2.0MP (limit: 1MP)");
    } finally {
      (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = prevMaxMp;
    }
  });

  it("rejects backgroundImage exceeding MAX_MEGAPIXELS with 400 when backgroundType is image", async () => {
    const twoMpPng = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    const prevMaxMp = env.MAX_MEGAPIXELS;
    (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = 1;
    try {
      const { statusCode, json } = await invokeBeautify({
        file: { filename: "ok.png", content: PNG_200 },
        backgroundImage: { filename: "huge-bg.png", content: twoMpPng },
        settings: { backgroundType: "image" },
      });

      expect(statusCode).toBe(400);
      expect(json.error).toBe(
        "Invalid background image: Image exceeds maximum size: 2.0MP (limit: 1MP)",
      );
    } finally {
      (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = prevMaxMp;
    }
  });

  it("rejects SVGs that fail validateImageBuffer (>4KB comment or gzipped .svg) with 400 before reaching Sharp", async () => {
    const longComment = `<!-- ${"x".repeat(4500)} -->`;
    const commentPaddedSvg = Buffer.from(
      `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><feImage href="http://127.0.0.1:9/ssrf"/><rect width="25" height="25" fill="red"/></svg>`,
    );
    const gzippedWithSvgExt = gzipSync(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><script>alert(1)</script><rect width="25" height="25" fill="red"/></svg>',
      ),
    );

    const resComment = await invokeBeautify({
      file: { filename: "long-comment.svg", content: commentPaddedSvg },
      settings: {},
    });
    expect(resComment.statusCode).toBe(400);
    expect(resComment.json.error).toBe("Invalid image: Unrecognized image format");

    const resGzip = await invokeBeautify({
      file: { filename: "gzipped.svg", content: gzippedWithSvgExt },
      settings: {},
    });
    expect(resGzip.statusCode).toBe(400);
    expect(resGzip.json.error).toBe("Invalid image: Unrecognized image format");
  });

  it("decompresses and sanitizes .svg and .svgz backgroundImage uploads before compositing", async () => {
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    try {
      const rawSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><feImage href="http://127.0.0.1:9/ssrf"/><script>alert(1)</script><rect width="300" height="200" fill="#00ff00"/></svg>',
      );
      const svgz = gzipSync(rawSvg);

      const resSvg = await invokeBeautify({
        file: { filename: "main.png", content: PNG_200 },
        backgroundImage: { filename: "bg.svg", content: rawSvg },
        settings: { backgroundType: "image", padding: 30, shadowPreset: "none" },
      });
      expect(resSvg.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);
      const sanitizedPassedToSharp = sanitizeSpy.mock.results[0]?.value as Buffer;
      expect(sanitizedPassedToSharp.toString("utf-8")).not.toContain("<script");
      expect(sanitizedPassedToSharp.toString("utf-8")).not.toContain("127.0.0.1");

      const resSvgz = await invokeBeautify({
        file: { filename: "main.png", content: PNG_200 },
        backgroundImage: { filename: "bg.svgz", content: svgz },
        settings: { backgroundType: "image", padding: 30, shadowPreset: "none" },
      });
      expect(resSvgz.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(2);

      const jobId = resSvgz.json.jobId as string;
      const outBuf = storedObjects.get(`outputs/${jobId}/main.png`);
      if (!outBuf) throw new Error("Expected output buffer in object storage");
      const { data } = await sharp(outBuf).raw().toBuffer({ resolveWithObject: true });
      // Top-left pixel sits in the padding area and should reflect the green SVG background
      expect(data[0]).toBe(0);
      expect(data[1]).toBe(255);
      expect(data[2]).toBe(0);
    } finally {
      sanitizeSpy.mockRestore();
    }
  });

  it("returns 400 when main image or backgroundImage fails decompressSvgz or sanitizeSvg", async () => {
    const tooManyElementsSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${"<rect/>".repeat(5005)}</svg>`,
    );
    const nonSvgSvgz = gzipSync(Buffer.from("<html><body>not an svg</body></html>"));

    const resMainCap = await invokeBeautify({
      file: { filename: "bomb.svg", content: tooManyElementsSvg },
      settings: {},
    });
    expect(resMainCap.statusCode).toBe(400);
    expect(String(resMainCap.json.error)).toContain("maximum element count");

    const resBgCap = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "bomb.svg", content: tooManyElementsSvg },
      settings: { backgroundType: "image" },
    });
    expect(resBgCap.statusCode).toBe(400);
    expect(String(resBgCap.json.error)).toContain("maximum element count");

    const resBgNonSvg = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "not-svg.svgz", content: nonSvgSvgz },
      settings: { backgroundType: "image" },
    });
    expect(resBgNonSvg.statusCode).toBe(400);
    expect(String(resBgNonSvg.json.error)).toContain("valid SVG content");

    const corruptSvgz = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
    const resCorruptSvgz = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "corrupt.svgz", content: corruptSvgz },
      settings: { backgroundType: "image" },
    });
    expect(resCorruptSvgz.statusCode).toBe(400);
    expect(typeof resCorruptSvgz.json.error).toBe("string");

    const resMainNonSvgSvgz = await invokeBeautify({
      file: { filename: "not-svg.svgz", content: nonSvgSvgz },
      settings: {},
    });
    expect(resMainNonSvgSvgz.statusCode).toBe(400);
    expect(String(resMainNonSvgSvgz.json.error)).toContain("valid SVG content");

    const resEmptyBg = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "empty.png", content: Buffer.alloc(0) },
      settings: { backgroundType: "image" },
    });
    expect(resEmptyBg.statusCode).toBe(400);
    expect(resEmptyBg.json.error).toBe("Invalid background image: File is empty");

    const resNullBg = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "nulls.png", content: Buffer.alloc(64, 0) },
      settings: { backgroundType: "image" },
    });
    expect(resNullBg.statusCode).toBe(400);
    expect(resNullBg.json.error).toBe("Invalid background image: File contains no image data");
  });

  it("keeps 422 UNDECODABLE_IMAGE_MESSAGE contract for truncated or corrupt CLI-decoded inputs and classifies pipeline errors", async () => {
    const truncatedJpg = readFixture(fixtures.image.hostile.truncated);

    const resTruncMain = await invokeBeautify({
      file: { filename: "truncated.jpg", content: truncatedJpg },
      settings: {},
    });
    expect(resTruncMain.statusCode).toBe(422);
    expect(resTruncMain.json).toEqual({
      error: "Processing failed",
      details: UNDECODABLE_IMAGE_MESSAGE,
    });
    expect(resTruncMain.requestLog.error).not.toHaveBeenCalled();

    const resCorruptTgaBg = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "bad.tga", content: Buffer.from("not a tga") },
      settings: { backgroundType: "image" },
    });
    expect(resCorruptTgaBg.statusCode).toBe(422);
    expect(resCorruptTgaBg.json).toEqual({
      error: "Processing failed",
      details: UNDECODABLE_IMAGE_MESSAGE,
    });
    expect(resCorruptTgaBg.requestLog.error).not.toHaveBeenCalled();

    // Pipeline / batch registry entry passes InputValidationError and ToolInputError through
    const config = getToolConfig("beautify");
    if (!config) throw new Error("beautify missing from toolRegistry");
    const invalidErr = await config.process(Buffer.from("not an image"), {}, "bad.png").then(
      () => null,
      (e: unknown) => e,
    );
    expect(invalidErr).toBeInstanceOf(InputValidationError);

    const tgaErr = await config.process(Buffer.from("not a tga"), {}, "bad.tga").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isToolInputError(tgaErr)).toBe(true);
    expect((tgaErr as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);

    // #2801: when decodeToSharpCompat throws DecoderUnavailableError on a TIFF-headed RAW (CR2)
    // whose header Sharp reads but whose pixels fail, beautify and meme-generator rethrow DecoderUnavailableError (503)
    const cr2Buf = readFixture(fixtures.image.formats("cr2"));
    const unavailableErr = new formatDecoders.DecoderUnavailableError("No dcraw_emu found.");
    const unavailSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValue(unavailableErr);
    try {
      await expect(
        invokeBeautify({
          file: { filename: "photo.cr2", content: cr2Buf },
          settings: {},
        }),
      ).rejects.toBe(unavailableErr);

      const memeConfig = getToolConfig("meme-generator");
      if (!memeConfig) throw new Error("meme-generator missing from toolRegistry");
      await expect(memeConfig.process(cr2Buf, {}, "photo.cr2")).rejects.toBe(unavailableErr);

      unavailSpy.mockRejectedValueOnce(new Error("dcraw_emu failed on corrupt CR2"));
      const memeClientErr = await memeConfig.process(cr2Buf, {}, "photo.cr2").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isToolInputError(memeClientErr)).toBe(true);
      expect((memeClientErr as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    } finally {
      unavailSpy.mockRestore();
    }
  });

  it("sanitizes comment-padded SVGs uploaded with .apng or .tga extension on beautify", async () => {
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    try {
      const longComment = `<!-- ${"x".repeat(4500)} -->`;
      const commentPaddedSvg = Buffer.from(
        `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><script>alert(1)</script><rect width="50" height="50" fill="red"/></svg>`,
      );

      const resApng = await invokeBeautify({
        file: { filename: "padded.apng", content: commentPaddedSvg },
        backgroundImage: { filename: "padded.tga", content: commentPaddedSvg },
        settings: { backgroundType: "image", shadowPreset: "none" },
      });
      expect(resApng.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(2);
    } finally {
      sanitizeSpy.mockRestore();
    }
  });

  it("ignores invalid backgroundImage when backgroundType is not image", async () => {
    const res = await invokeBeautify({
      file: { filename: "main.png", content: PNG_200 },
      backgroundImage: { filename: "garbage.png", content: Buffer.from("not an image") },
      settings: { backgroundType: "solid", backgroundColor: "#112233", shadowPreset: "none" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("decodes HEIC and CLI-decoded backgroundImage uploads with fileExt and applies autoOrient", async () => {
    // 1. EXIF orientation 6 (90 CW): 40x20 image with left half red and right half blue
    // After autoOrient, dimensions become 20x40 with top half red and bottom half blue
    const leftRed = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const rightBlue = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const exifRotatedJpg = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: leftRed, left: 0, top: 0 },
        { input: rightBlue, left: 20, top: 0 },
      ])
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100 })
      .toBuffer();

    const tinyMain = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const orientedOut = await processBeautify(
      tinyMain,
      settingsSchema.parse({ backgroundType: "image", padding: 8, shadowPreset: "none" }),
      "main.png",
      exifRotatedJpg,
      "bg.jpg",
    );
    const { data, info } = await sharp(orientedOut).raw().toBuffer({ resolveWithObject: true });
    // Bottom-center pixel in the padding area should be blue (not red/black from unoriented cover)
    const bottomIdx = ((info.height - 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    expect(data[bottomIdx + 2]).toBeGreaterThan(150);
    expect(data[bottomIdx]).toBeLessThan(80);

    // 2. CLI-decoded backgroundImage passes fileExt to decodeToSharpCompat
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValueOnce(PNG_200);
    try {
      const dngBuf = Buffer.from("fake-raw-dng-header");
      const resCli = await invokeBeautify({
        file: { filename: "main.png", content: PNG_200 },
        backgroundImage: { filename: "bg.dng", content: dngBuf },
        settings: { backgroundType: "image", shadowPreset: "none" },
      });
      expect(resCli.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenCalledWith(dngBuf, "raw", "dng");
    } finally {
      cliSpy.mockRestore();
    }

    // 3. HEIC backgroundImage calls decodeHeic
    const heicSpy = vi.spyOn(heicConverter, "decodeHeic").mockResolvedValueOnce(PNG_200);
    try {
      const heicBuf = readFixture(fixtures.image.base.heic200);
      const resHeic = await invokeBeautify({
        file: { filename: "main.png", content: PNG_200 },
        backgroundImage: { filename: "bg.heic", content: heicBuf },
        settings: { backgroundType: "image", shadowPreset: "none" },
      });
      expect(resHeic.statusCode).toBe(200);
      expect(heicSpy).toHaveBeenCalledWith(heicBuf);
    } finally {
      heicSpy.mockRestore();
    }
  });

  it("preserves extensionless and dotfile stems when resolving output filenames in beautify and meme-generator (#3406)", async () => {
    const JPG_100 = readFixture(fixtures.image.base.jpg100);
    const beautifyConfig = getToolConfig("beautify");
    if (!beautifyConfig) throw new Error("beautify missing from toolRegistry");
    const memeConfig = getToolConfig("meme-generator");
    if (!memeConfig) throw new Error("meme-generator missing from toolRegistry");

    // 1. beautify registry process: extensionless and dotfile inputs
    const beautifyExtlessPng = await beautifyConfig.process(
      JPG_100,
      beautifyConfig.settingsSchema.parse({ outputFormat: "png", shadowPreset: "none" }),
      "image",
    );
    expect(beautifyExtlessPng.filename).toBe("image.png");
    expect(beautifyExtlessPng.contentType).toBe("image/png");

    const beautifyExtlessForcedPng = await beautifyConfig.process(
      JPG_100,
      beautifyConfig.settingsSchema.parse({ outputFormat: "jpeg", shadowPreset: "medium" }),
      "image",
    );
    expect(beautifyExtlessForcedPng.filename).toBe("image.png");
    expect(beautifyExtlessForcedPng.contentType).toBe("image/png");

    const beautifyDotfilePng = await beautifyConfig.process(
      PNG_200,
      beautifyConfig.settingsSchema.parse({ outputFormat: "png", shadowPreset: "none" }),
      ".hidden",
    );
    expect(beautifyDotfilePng.filename).toBe(".hidden.png");
    expect(beautifyDotfilePng.contentType).toBe("image/png");

    const beautifyDotfileJpeg = await beautifyConfig.process(
      JPG_100,
      beautifyConfig.settingsSchema.parse({
        outputFormat: "jpeg",
        shadowPreset: "none",
        borderRadius: 0,
        frame: "none",
        backgroundType: "solid",
      }),
      ".hidden",
    );
    expect(beautifyDotfileJpeg.filename).toBe(".hidden.jpeg");
    expect(beautifyDotfileJpeg.contentType).toBe("image/jpeg");

    const beautifyDotfileWithExt = await beautifyConfig.process(
      JPG_100,
      beautifyConfig.settingsSchema.parse({ outputFormat: "png", shadowPreset: "none" }),
      ".hidden.jpg",
    );
    expect(beautifyDotfileWithExt.filename).toBe(".hidden.png");
    expect(beautifyDotfileWithExt.contentType).toBe("image/png");

    // 2. beautify HTTP route: extensionless and dotfile uploads
    const resBeautifyExtless = await invokeBeautify({
      file: { filename: "image", content: JPG_100 },
      settings: { shadowPreset: "medium", outputFormat: "jpeg" },
    });
    expect(resBeautifyExtless.statusCode).toBe(200);
    expect(resBeautifyExtless.json.downloadUrl).toBe(
      `/api/v1/download/${resBeautifyExtless.json.jobId}/image.png`,
    );

    const resBeautifyDotfile = await invokeBeautify({
      file: { filename: ".hidden", content: PNG_200 },
      settings: { shadowPreset: "none", outputFormat: "webp" },
    });
    expect(resBeautifyDotfile.statusCode).toBe(200);
    expect(resBeautifyDotfile.json.downloadUrl).toBe(
      `/api/v1/download/${resBeautifyDotfile.json.jobId}/.hidden.webp`,
    );

    // 3. meme-generator registry process: extensionless, dotfile, and normal inputs
    const memeExtlessJpg = await memeConfig.process(JPG_100, {}, "image");
    expect(memeExtlessJpg.filename).toBe("image.jpg");
    expect(memeExtlessJpg.contentType).toBe("image/jpeg");

    const memeExtlessPng = await memeConfig.process(PNG_200, {}, "image");
    expect(memeExtlessPng.filename).toBe("image.png");
    expect(memeExtlessPng.contentType).toBe("image/png");

    const memeDotfileJpg = await memeConfig.process(JPG_100, {}, ".hidden");
    expect(memeDotfileJpg.filename).toBe(".hidden.jpg");
    expect(memeDotfileJpg.contentType).toBe("image/jpeg");

    const memeDotfilePng = await memeConfig.process(PNG_200, {}, ".hidden");
    expect(memeDotfilePng.filename).toBe(".hidden.png");
    expect(memeDotfilePng.contentType).toBe("image/png");

    const memeNormalSvg = await memeConfig.process(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
      ),
      {},
      "vector.svg",
    );
    expect(memeNormalSvg.filename).toBe("vector.png");
    expect(memeNormalSvg.contentType).toBe("image/png");

    const memeDotfileSvg = await memeConfig.process(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
      ),
      {},
      ".hidden.svg",
    );
    expect(memeDotfileSvg.filename).toBe(".hidden.png");
    expect(memeDotfileSvg.contentType).toBe("image/png");

    // 4. meme-generator HTTP route: extensionless and dotfile uploads
    const resMemeExtless = await invokeMemeMultipart("image", JPG_100);
    expect(resMemeExtless.statusCode).toBe(200);
    expect(resMemeExtless.json.downloadUrl).toBe(
      `/api/v1/download/${resMemeExtless.json.jobId}/image.jpg`,
    );

    const resMemeDotfile = await invokeMemeMultipart(".hidden", PNG_200);
    expect(resMemeDotfile.statusCode).toBe(200);
    expect(resMemeDotfile.json.downloadUrl).toBe(
      `/api/v1/download/${resMemeDotfile.json.jobId}/.hidden.png`,
    );
  });

  it("sanitizes upload filenames and validates/prepares images in meme-generator route and registry process (#3415)", async () => {
    const memeConfig = getToolConfig("meme-generator");
    if (!memeConfig) throw new Error("meme-generator missing from toolRegistry");

    // 1. Upload filename sanitization: nested path, ".." sequence, double extension
    const resNested = await invokeMemeMultipart("nested/photo.png", PNG_200);
    expect(resNested.statusCode).toBe(200);
    expect(resNested.json.downloadUrl).toBe(`/api/v1/download/${resNested.json.jobId}/photo.png`);

    const resDotDot = await invokeMemeMultipart("foo..bar.png", PNG_200);
    expect(resDotDot.statusCode).toBe(200);
    expect(resDotDot.json.downloadUrl).toBe(`/api/v1/download/${resDotDot.json.jobId}/foobar.png`);

    const resDoubleExt = await invokeMemeMultipart("meme.html.png", PNG_200);
    expect(resDoubleExt.statusCode).toBe(200);
    expect(resDoubleExt.json.downloadUrl).toBe(
      `/api/v1/download/${resDoubleExt.json.jobId}/meme.png`,
    );

    // 2. Registry process: validateImageBuffer rejection (corrupt buffer & MAX_MEGAPIXELS)
    const invalidErr = await memeConfig.process(Buffer.from("not an image"), {}, "bad.png").then(
      () => null,
      (e: unknown) => e,
    );
    expect(invalidErr).toBeInstanceOf(InputValidationError);
    expect((invalidErr as Error).message).toBe("Invalid image: Unrecognized image format");

    const twoMpPng = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    const prevMaxMp = env.MAX_MEGAPIXELS;
    (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = 1;
    try {
      const mpErr = await memeConfig.process(twoMpPng, {}, "huge.png").then(
        () => null,
        (e: unknown) => e,
      );
      expect(mpErr).toBeInstanceOf(InputValidationError);
      expect((mpErr as Error).message).toBe(
        "Invalid image: Image exceeds maximum size: 2.0MP (limit: 1MP)",
      );

      const resRouteMp = await invokeMemeMultipart("huge.png", twoMpPng);
      expect(resRouteMp.statusCode).toBe(400);
      expect(resRouteMp.json.error).toBe(
        "Invalid image: Image exceeds maximum size: 2.0MP (limit: 1MP)",
      );
    } finally {
      (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = prevMaxMp;
    }

    // 3. Registry process & HTTP route: decompressSvgz + sanitizeSvg on .svg, .svgz, and comment-padded .apng/.tga
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    try {
      const rawSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><feImage href="http://127.0.0.1:9/ssrf"/><script>alert(1)</script><rect width="80" height="80" fill="#00ff00"/></svg>',
      );
      const svgz = gzipSync(rawSvg);

      const svgOut = await memeConfig.process(rawSvg, {}, "attack.svg");
      expect(svgOut.filename).toBe("attack.png");
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);
      const sanitizedSvgArg = sanitizeSpy.mock.results[0]?.value as Buffer;
      expect(sanitizedSvgArg.toString("utf-8")).not.toContain("<script");
      expect(sanitizedSvgArg.toString("utf-8")).not.toContain("127.0.0.1");

      const svgzOut = await memeConfig.process(svgz, {}, "attack.svgz");
      expect(svgzOut.filename).toBe("attack.png");
      expect(sanitizeSpy).toHaveBeenCalledTimes(2);

      const longComment = `<!-- ${"x".repeat(4500)} -->`;
      const commentPaddedSvg = Buffer.from(
        `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><script>alert(1)</script><rect width="50" height="50" fill="red"/></svg>`,
      );

      const resRouteApng = await invokeMemeMultipart("padded.apng", commentPaddedSvg);
      expect(resRouteApng.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(3);

      const resRouteTga = await invokeMemeMultipart("padded.tga", commentPaddedSvg);
      expect(resRouteTga.statusCode).toBe(200);
      expect(sanitizeSpy).toHaveBeenCalledTimes(4);

      const regApng = await memeConfig.process(commentPaddedSvg, {}, "padded.apng");
      expect(regApng.filename).toBe("padded.png");
      expect(sanitizeSpy).toHaveBeenCalledTimes(5);

      const regTga = await memeConfig.process(commentPaddedSvg, {}, "padded.tga");
      expect(regTga.filename).toBe("padded.png");
      expect(sanitizeSpy).toHaveBeenCalledTimes(6);
    } finally {
      sanitizeSpy.mockRestore();
    }

    // 4. SVG / SVGZ client errors (element cap, corrupt gzip, non-SVG svgz) become InputValidationError (400 on HTTP)
    const tooManyElementsSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${"<rect/>".repeat(5005)}</svg>`,
    );
    const nonSvgSvgz = gzipSync(Buffer.from("<html><body>not an svg</body></html>"));
    const corruptSvgz = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);

    const capErr = await memeConfig.process(tooManyElementsSvg, {}, "bomb.svg").then(
      () => null,
      (e: unknown) => e,
    );
    expect(capErr).toBeInstanceOf(InputValidationError);
    expect((capErr as Error).message).toContain("maximum element count");

    const nonSvgErr = await memeConfig.process(nonSvgSvgz, {}, "not-svg.svgz").then(
      () => null,
      (e: unknown) => e,
    );
    expect(nonSvgErr).toBeInstanceOf(InputValidationError);
    expect((nonSvgErr as Error).message).toContain("valid SVG content");

    const corruptSvgzErr = await memeConfig.process(corruptSvgz, {}, "corrupt.svgz").then(
      () => null,
      (e: unknown) => e,
    );
    expect(corruptSvgzErr).toBeInstanceOf(InputValidationError);

    const resRouteNonSvgSvgz = await invokeMemeMultipart("not-svg.svgz", nonSvgSvgz);
    expect(resRouteNonSvgSvgz.statusCode).toBe(400);
    expect(String(resRouteNonSvgSvgz.json.error)).toContain("valid SVG content");

    const resRouteCorruptSvgz = await invokeMemeMultipart("corrupt.svgz", corruptSvgz);
    expect(resRouteCorruptSvgz.statusCode).toBe(400);
    expect(typeof resRouteCorruptSvgz.json.error).toBe("string");

    // 5. Registry process decodeHeic failure wraps non-server errors with asInputErrorIfUndecodable,
    // and decodeToSharpCompat receives lowercase fileExt
    const heicBuf = readFixture(fixtures.image.base.heic200);
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error("heif-dec failed on corrupt HEIC"));
    try {
      const heicErr = await memeConfig.process(heicBuf, {}, "bad.heic").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isToolInputError(heicErr)).toBe(true);
      expect((heicErr as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    } finally {
      heicSpy.mockRestore();
    }

    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValueOnce(PNG_200);
    try {
      const dngBuf = Buffer.from("fake-raw-dng-header");
      const outDng = await memeConfig.process(dngBuf, {}, "Photo.DNG");
      expect(outDng.filename).toBe("Photo.png");
      expect(cliSpy).toHaveBeenCalledWith(dngBuf, "raw", "dng");
    } finally {
      cliSpy.mockRestore();
    }

    // 6. Unexpected non-client error from sanitizeSvg rethrows on registry process and logs on HTTP route
    const unexpectedErr = new TypeError("unexpected sanitizer fault");
    const sanitizeFaultSpy = vi.spyOn(svgSanitize, "sanitizeSvg").mockImplementation(() => {
      throw unexpectedErr;
    });
    try {
      const validSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
      );
      const faultErr = await memeConfig.process(validSvg, {}, "valid.svg").then(
        () => null,
        (e: unknown) => e,
      );
      expect(faultErr).not.toBeInstanceOf(InputValidationError);
      expect((faultErr as { cause?: unknown }).cause).toBe(unexpectedErr);

      await expect(invokeMemeMultipart("valid.svg", validSvg)).rejects.toBe(unexpectedErr);
    } finally {
      sanitizeFaultSpy.mockRestore();
    }
  });

  it("rethrows unexpected sanitizeSvg and decompressSvgz faults on beautify route and registry process (#3736)", async () => {
    const beautifyConfig = getToolConfig("beautify");
    if (!beautifyConfig) throw new Error("beautify missing from toolRegistry");

    const validSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
    );
    const validSvgz = gzipSync(validSvg);

    const unexpectedSanitizeErr = new TypeError("unexpected sanitizer fault");
    const sanitizeFaultSpy = vi.spyOn(svgSanitize, "sanitizeSvg").mockImplementation(() => {
      throw unexpectedSanitizeErr;
    });
    try {
      const regSanitizeErr = await beautifyConfig.process(validSvg, {}, "valid.svg").then(
        () => null,
        (e: unknown) => e,
      );
      expect(regSanitizeErr).not.toBeInstanceOf(InputValidationError);
      expect((regSanitizeErr as { cause?: unknown }).cause).toBe(unexpectedSanitizeErr);

      await expect(
        invokeBeautify({
          file: { filename: "valid.svg", content: validSvg },
          settings: {},
        }),
      ).rejects.toBe(unexpectedSanitizeErr);

      await expect(
        invokeBeautify({
          file: { filename: "main.png", content: PNG_200 },
          backgroundImage: { filename: "bg.svg", content: validSvg },
          settings: { backgroundType: "image" },
        }),
      ).rejects.toBe(unexpectedSanitizeErr);
    } finally {
      sanitizeFaultSpy.mockRestore();
    }

    const unexpectedDecompressErr = new TypeError("unexpected gunzip fault");
    const decompressFaultSpy = vi.spyOn(svgSanitize, "decompressSvgz").mockImplementation(() => {
      throw unexpectedDecompressErr;
    });
    try {
      const regDecompressErr = await beautifyConfig.process(validSvgz, {}, "valid.svgz").then(
        () => null,
        (e: unknown) => e,
      );
      expect(regDecompressErr).not.toBeInstanceOf(InputValidationError);
      expect((regDecompressErr as { cause?: unknown }).cause).toBe(unexpectedDecompressErr);

      await expect(
        invokeBeautify({
          file: { filename: "valid.svgz", content: validSvgz },
          settings: {},
        }),
      ).rejects.toBe(unexpectedDecompressErr);

      await expect(
        invokeBeautify({
          file: { filename: "main.png", content: PNG_200 },
          backgroundImage: { filename: "bg.svgz", content: validSvgz },
          settings: { backgroundType: "image" },
        }),
      ).rejects.toBe(unexpectedDecompressErr);
    } finally {
      decompressFaultSpy.mockRestore();
    }
  });

  it("rethrows DecoderOutOfMemoryError when sharp(buf).metadata() rejects on the .apng disguised-SVG check in beautify and meme-generator (#3804)", async () => {
    const memeConfig = getToolConfig("meme-generator");
    if (!memeConfig) throw new Error("meme-generator missing from toolRegistry");
    const v8Oom = new RangeError("Array buffer allocation failed");
    const origMetadata = sharp.prototype.metadata;

    // 1. processBeautify main .apng upload: 1st metadata() is validateImageBuffer, 2nd is .apng SVG check
    let callCount = 0;
    const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(async function (
      this: sharp.Sharp,
    ) {
      callCount++;
      if (callCount === 2) throw v8Oom;
      return origMetadata.call(this);
    });
    try {
      const mainThrown = await processBeautify(
        PNG_200,
        settingsSchema.parse({}),
        "photo.apng",
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );
      expect(mainThrown).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });

      // 2. POST /api/v1/tools/image/beautify backgroundImage .apng upload
      // (call 1: main validateImageBuffer, call 2: main autoOrient metadata, call 3: bg validateImageBuffer, call 4: bg .apng SVG check)
      callCount = 0;
      metaSpy.mockImplementation(async function (this: sharp.Sharp) {
        callCount++;
        if (callCount === 4) throw v8Oom;
        return origMetadata.call(this);
      });
      const bgThrown = await invokeBeautify({
        file: { filename: "main.png", content: PNG_200 },
        backgroundImage: { filename: "bg.apng", content: PNG_200 },
        settings: { backgroundType: "image", shadowPreset: "none" },
      }).then(
        () => "resolved",
        (e: unknown) => e,
      );
      expect(bgThrown).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });

      // 3. POST /api/v1/tools/image/meme-generator and registry process .apng upload
      callCount = 0;
      metaSpy.mockImplementation(async function (this: sharp.Sharp) {
        callCount++;
        if (callCount === 2) throw v8Oom;
        return origMetadata.call(this);
      });
      const memeRouteThrown = await invokeMemeMultipart("photo.apng", PNG_200).then(
        () => "resolved",
        (e: unknown) => e,
      );
      expect(memeRouteThrown).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });

      callCount = 0;
      const memeRegThrown = await memeConfig.process(PNG_200, {}, "photo.apng").then(
        () => "resolved",
        (e: unknown) => e,
      );
      expect(memeRegThrown).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      metaSpy.mockRestore();
    }
  });
});
