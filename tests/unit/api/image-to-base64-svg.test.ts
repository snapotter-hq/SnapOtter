import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { registerImageToBase64 } from "../../../apps/api/src/routes/tools/image-to-base64.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;

const PNG_200 = readFixture(fixtures.image.base.png200);

describe("image-to-base64 SVG and SVGZ sanitization in original mode (#2594)", () => {
  let handler: RouteHandler;

  beforeAll(() => {
    const fakeApp = {
      post: vi.fn((_path: string, fn: RouteHandler) => {
        handler = fn;
      }),
    } as unknown as Parameters<typeof registerImageToBase64>[0];
    registerImageToBase64(fakeApp);
  });

  async function invokeRoute(
    files: Array<{ filename: string; content: Buffer }>,
    settings: Record<string, unknown> = {},
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
    const request = {
      async *parts() {
        for (const file of files) {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: file.filename,
            file: Readable.from([file.content]),
          };
        }
        yield {
          type: "field" as const,
          fieldname: "settings",
          value: JSON.stringify(settings),
        };
      },
    };
    await handler(request, reply);
    return {
      statusCode,
      json: body as {
        results: Array<{
          filename: string;
          mimeType: string;
          width: number;
          height: number;
          originalSize: number;
          encodedSize: number;
          overheadPercent: number;
          base64: string;
          dataUri: string;
        }>;
        errors: Array<{ filename: string; error: string }>;
      },
    };
  }

  it("strips <script> and event handlers from .svg inputs when outputFormat is original", async () => {
    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="alert(1)"><script>alert(1)</script><rect width="20" height="20" fill="red"/></svg>',
    );

    const { statusCode, json } = await invokeRoute([{ filename: "xss.svg", content: rawSvg }], {
      outputFormat: "original",
      maxWidth: 0,
      maxHeight: 0,
    });

    expect(statusCode).toBe(200);
    expect(json.errors).toEqual([]);
    expect(json.results).toHaveLength(1);

    const result = json.results[0];
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(result.originalSize).toBe(rawSvg.length);
    expect(result.encodedSize).toBe(Buffer.byteLength(result.base64, "utf8"));
    expect(result.dataUri).toBe(`data:image/svg+xml;base64,${result.base64}`);

    const decodedXml = Buffer.from(result.base64, "base64").toString("utf-8");
    expect(decodedXml).toContain("<svg");
    expect(decodedXml).toContain("<rect");
    expect(decodedXml).not.toContain("<script");
    expect(decodedXml).not.toContain("alert(1)");
    expect(decodedXml).not.toContain("onload=");
  });

  it("decompresses and sanitizes .svgz inputs when outputFormat is original", async () => {
    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="15"><script>alert(2)</script><circle cx="5" cy="5" r="4"/></svg>',
    );
    const svgz = gzipSync(rawSvg);

    const { statusCode, json } = await invokeRoute([{ filename: "xss.svgz", content: svgz }], {
      outputFormat: "original",
      maxWidth: 0,
      maxHeight: 0,
    });

    expect(statusCode).toBe(200);
    expect(json.errors).toEqual([]);
    expect(json.results).toHaveLength(1);

    const result = json.results[0];
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.width).toBe(30);
    expect(result.height).toBe(15);
    expect(result.originalSize).toBe(svgz.length);
    expect(result.encodedSize).toBe(Buffer.byteLength(result.base64, "utf8"));

    const decodedBytes = Buffer.from(result.base64, "base64");
    expect(decodedBytes[0]).not.toBe(0x1f);
    expect(decodedBytes[1]).not.toBe(0x8b);

    const decodedXml = decodedBytes.toString("utf-8");
    expect(decodedXml.trimStart().startsWith("<svg")).toBe(true);
    expect(decodedXml).toContain("<circle");
    expect(decodedXml).not.toContain("<script");
    expect(decodedXml).not.toContain("alert(2)");
  });

  it("keeps decompressed, sanitized SVG XML when maxWidth or maxHeight is set in original mode", async () => {
    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><script>alert(3)</script><rect width="100" height="80"/></svg>',
    );
    const svgz = gzipSync(rawSvg);

    const { statusCode, json } = await invokeRoute(
      [
        { filename: "icon.svg", content: rawSvg },
        { filename: "icon.svgz", content: svgz },
        { filename: "misnamed.png", content: rawSvg },
      ],
      { outputFormat: "original", maxWidth: 40, maxHeight: 40 },
    );

    expect(statusCode).toBe(200);
    expect(json.errors).toEqual([]);
    expect(json.results).toHaveLength(3);

    for (const result of json.results) {
      expect(result.mimeType).toBe("image/svg+xml");
      expect(result.width).toBe(100);
      expect(result.height).toBe(80);
      const decodedXml = Buffer.from(result.base64, "base64").toString("utf-8");
      expect(decodedXml.trimStart().startsWith("<svg")).toBe(true);
      expect(decodedXml).not.toContain("<script");
      expect(decodedXml).not.toContain("alert(3)");
    }
  });

  it("rejects SVGs that fail validateImageBuffer (such as >4KB leading comment or gzipped .svg) in errors", async () => {
    const longComment = `<!-- ${"x".repeat(4500)} -->`;
    const commentPaddedSvg = Buffer.from(
      `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><script>alert(4)</script><rect width="25" height="25"/></svg>`,
    );
    const gzippedWithSvgExt = gzipSync(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><script>alert(5)</script><rect width="25" height="25"/></svg>',
      ),
    );

    const { statusCode, json } = await invokeRoute(
      [
        { filename: "long-comment.svg", content: commentPaddedSvg },
        { filename: "gzipped-as-svg.svg", content: gzippedWithSvgExt },
      ],
      { outputFormat: "original", maxWidth: 0, maxHeight: 0 },
    );

    expect(statusCode).toBe(200);
    expect(json.results).toEqual([]);
    expect(json.errors).toEqual([
      { filename: "long-comment.svg", error: "Unrecognized image format" },
      { filename: "gzipped-as-svg.svg", error: "Unrecognized image format" },
    ]);
  });

  it("sanitizes comment-padded SVGs that pass validateImageBuffer via .apng or .tga extension fallback", async () => {
    const longComment = `<!-- ${"x".repeat(4500)} -->`;
    const commentPaddedSvg = Buffer.from(
      `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"><script>alert(4)</script><rect width="25" height="25"/></svg>`,
    );

    const { statusCode, json } = await invokeRoute(
      [
        { filename: "long-comment.apng", content: commentPaddedSvg },
        { filename: "long-comment.tga", content: commentPaddedSvg },
        { filename: "empty.png", content: Buffer.alloc(0) },
        { filename: "nulls.png", content: Buffer.alloc(64, 0) },
      ],
      { outputFormat: "original", maxWidth: 0, maxHeight: 0 },
    );

    expect(statusCode).toBe(200);
    expect(json.results).toHaveLength(2);
    for (const result of json.results) {
      expect(result.mimeType).toBe("image/svg+xml");
      const decodedXml = Buffer.from(result.base64, "base64").toString("utf-8");
      expect(decodedXml).toContain("<svg");
      expect(decodedXml).not.toContain("<script");
      expect(decodedXml).not.toContain("alert(");
    }
    expect(json.errors).toEqual([
      { filename: "empty.png", error: "File is empty" },
      { filename: "nulls.png", error: "File contains no image data" },
    ]);
  });

  it("rejects images exceeding MAX_MEGAPIXELS in errors and continues processing valid files (#3104)", async () => {
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
      const { statusCode, json } = await invokeRoute(
        [
          { filename: "too-big.png", content: twoMpPng },
          { filename: "ok.png", content: PNG_200 },
        ],
        { outputFormat: "original" },
      );

      expect(statusCode).toBe(200);
      expect(json.results).toHaveLength(1);
      expect(json.results[0].filename).toBe("ok.png");
      expect(json.errors).toEqual([
        {
          filename: "too-big.png",
          error: "Image exceeds maximum size: 2.0MP (limit: 1MP)",
        },
      ]);
    } finally {
      (env as { MAX_MEGAPIXELS: number }).MAX_MEGAPIXELS = prevMaxMp;
    }
  });

  it("preserves raster MIME type and resize when a PNG file has a .svg extension", async () => {
    const { statusCode, json } = await invokeRoute(
      [{ filename: "misnamed.svg", content: PNG_200 }],
      { outputFormat: "original", maxWidth: 50, maxHeight: 0 },
    );

    expect(statusCode).toBe(200);
    expect(json.errors).toEqual([]);
    expect(json.results).toHaveLength(1);

    const result = json.results[0];
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBeLessThanOrEqual(50);
    expect(result.dataUri.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("decompresses and sanitizes .svgz before rasterizing when outputFormat is png", async () => {
    const rawSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><script>alert(6)</script><rect width="40" height="20" fill="blue"/></svg>',
    );
    const svgz = gzipSync(rawSvg);

    const { statusCode, json } = await invokeRoute([{ filename: "icon.svgz", content: svgz }], {
      outputFormat: "png",
      maxWidth: 20,
      maxHeight: 0,
    });

    expect(statusCode).toBe(200);
    expect(json.errors).toEqual([]);
    expect(json.results).toHaveLength(1);

    const result = json.results[0];
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(20);
    expect(result.height).toBe(10);
    const decodedBytes = Buffer.from(result.base64, "base64");
    expect(decodedBytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("records errors for corrupt .svgz, non-SVG .svgz, and SVGs exceeding element limits", async () => {
    const corruptSvgz = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
    const nonSvgSvgz = gzipSync(Buffer.from("<html><body>not an svg</body></html>"));
    const tooManyElementsSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${"<rect/>".repeat(5005)}</svg>`,
    );

    const { statusCode, json } = await invokeRoute(
      [
        { filename: "corrupt.svgz", content: corruptSvgz },
        { filename: "not-svg.svgz", content: nonSvgSvgz },
        { filename: "too-many.svg", content: tooManyElementsSvg },
      ],
      { outputFormat: "original" },
    );

    expect(statusCode).toBe(200);
    expect(json.results).toEqual([]);
    expect(json.errors).toHaveLength(3);
    expect(json.errors.map((e) => e.filename)).toEqual([
      "corrupt.svgz",
      "not-svg.svgz",
      "too-many.svg",
    ]);
    expect(json.errors[1].error).toContain("valid SVG content");
    expect(json.errors[2].error).toContain("maximum element count");
  });
});
