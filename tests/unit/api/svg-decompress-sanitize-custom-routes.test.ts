import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InspectResult } from "../../../apps/api/src/lib/exiftool.js";

function defaultInspectMetadata(buf: Buffer, filename: string): InspectResult {
  const text = buf.toString("utf-8");
  const hasXmp = text.trimStart().startsWith("<svg") && text.includes("Test Icon Title");
  return {
    filename,
    fileSize: buf.length,
    exif: null,
    iptc: null,
    xmp: hasXmp ? { Title: "Test Icon Title", Subject: ["vector", "icon"] } : null,
    gps: null,
    keywords: hasXmp ? ["vector", "icon"] : [],
  };
}

const mocks = vi.hoisted(() => ({
  putObject: vi.fn<(key: string, data: Buffer | string) => Promise<void>>(async () => {}),
  failBatchJob: vi.fn<(opts: unknown) => Promise<boolean>>(async () => true),
  inspectMetadata: vi.fn<(buf: Buffer, filename: string) => Promise<InspectResult>>(),
  writeMetadata: vi.fn<(buf: Buffer, filename: string, tags: string[]) => Promise<Buffer>>(
    async (buf: Buffer) => buf,
  ),
  decompressSvgz: vi.fn<(buf: Buffer) => Buffer>(),
  sanitizeSvg: vi.fn<(buf: Buffer) => Buffer>(),
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  return {
    ...actual,
    decompressSvgz: (...args: Parameters<typeof actual.decompressSvgz>) =>
      mocks.decompressSvgz.getMockImplementation()
        ? mocks.decompressSvgz(...args)
        : actual.decompressSvgz(...args),
    sanitizeSvg: (...args: Parameters<typeof actual.sanitizeSvg>) =>
      mocks.sanitizeSvg.getMockImplementation()
        ? mocks.sanitizeSvg(...args)
        : actual.sanitizeSvg(...args),
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: Parameters<typeof actual.putObject>) => mocks.putObject(...args),
  };
});

vi.mock("../../../apps/api/src/lib/exiftool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/exiftool.js")>();
  return {
    ...actual,
    inspectMetadata: (...args: Parameters<typeof actual.inspectMetadata>) =>
      mocks.inspectMetadata(...args),
    writeMetadata: (...args: Parameters<typeof actual.writeMetadata>) =>
      mocks.writeMetadata(...args),
  };
});

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn(),
  registerToolProcessFn: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: vi.fn(async () => undefined),
    }),
  },
  schema: { jobs: {} },
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  failBatchJob: (opts: unknown) => mocks.failBatchJob(opts),
  updateJobProgress: vi.fn(async () => undefined),
}));

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => ({ id: "user-1" }) };
});

import sharp from "sharp";
import { env } from "../../../apps/api/src/config.js";
import { DecoderOutOfMemoryError } from "../../../apps/api/src/lib/format-decoders.js";
import { registerBarcodeRead } from "../../../apps/api/src/routes/tools/barcode-read.js";
import { registerCollage } from "../../../apps/api/src/routes/tools/collage.js";
import { registerColorPalette } from "../../../apps/api/src/routes/tools/color-palette.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerImageToPdf } from "../../../apps/api/src/routes/tools/image-to-pdf.js";
import { registerInfo } from "../../../apps/api/src/routes/tools/info.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerStitch } from "../../../apps/api/src/routes/tools/stitch.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

type RouteHandler = (req: unknown, rep: unknown) => Promise<unknown>;

function buildRoutes() {
  const routes = new Map<string, RouteHandler>();
  const fakeApp = {
    post: vi.fn((url: string, fn: RouteHandler) => {
      routes.set(url, fn);
    }),
  };
  registerEditMetadata(fakeApp as never);
  registerStripMetadata(fakeApp as never);
  registerInfo(fakeApp as never);
  registerSvgToRaster(fakeApp as never);
  registerStitch(fakeApp as never);
  registerBarcodeRead(fakeApp as never);
  registerSplit(fakeApp as never);
  registerMemeGenerator(fakeApp as never);
  registerColorPalette(fakeApp as never);
  registerCollage(fakeApp as never);
  registerImageToPdf(fakeApp as never);
  return routes;
}

async function invokeRoute(
  handler: RouteHandler | undefined,
  parts: Array<
    | { type: "file"; filename: string; content: Buffer }
    | { type: "field"; fieldname: string; value: string }
  >,
) {
  if (!handler) throw new Error("Route handler not registered");
  const request = {
    headers: { "content-type": "multipart/form-data; boundary=---test" },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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
    payload: undefined as unknown,
    raw: { headersSent: false, destroy: vi.fn() },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
  await handler(request, reply);
  return reply;
}

const DIRTY_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><script>alert(1)</script><filter id="f"><feImage href="http://169.254.169.254/latest/meta-data/"/></filter><rect width="100" height="80" fill="red"/></svg>',
  "utf-8",
);
const DIRTY_SVGZ = gzipSync(DIRTY_SVG);
const SCRIPT_LT_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><script>if (1 < 2) alert(1);</script><rect width="100" height="80" fill="red"/></svg>',
  "utf-8",
);
const SCRIPT_LT_SVGZ = gzipSync(SCRIPT_LT_SVG);
const XMP_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><metadata><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Test Icon Title</rdf:li></rdf:Alt></dc:title><dc:subject><rdf:Bag><rdf:li>vector</rdf:li><rdf:li>icon</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta></metadata><script>alert(1)</script><rect width="100" height="80" fill="red"/></svg>',
  "utf-8",
);
const XMP_SVGZ = gzipSync(XMP_SVG);
const NOT_SVG_SVGZ = gzipSync(Buffer.from("not an svg document", "utf-8"));
const CORRUPT_SVGZ = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
const NON_GZIP_SVGZ = Buffer.from("not gzip and not an image", "utf-8");
const TRUNCATED_1B_SVGZ = Buffer.from([0x1f]);
const OVER_ELEMENT_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${"<rect/>".repeat(5001)}</svg>`,
  "utf-8",
);
const OVER_SIZE_SVGZ = gzipSync(
  Buffer.concat([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'),
    Buffer.alloc(1024 * 1024 + 128, 0x20),
    Buffer.from("</svg>"),
  ]),
);

describe("SVG/SVGZ decompression and sanitization across edit-metadata, strip-metadata/inspect, and info (#3095)", () => {
  const routes = buildRoutes();

  beforeEach(() => {
    mocks.putObject.mockClear();
    mocks.failBatchJob.mockClear();
    mocks.failBatchJob.mockResolvedValue(true);
    mocks.inspectMetadata.mockClear();
    mocks.inspectMetadata.mockImplementation(async (buf: Buffer, filename: string) =>
      defaultInspectMetadata(buf, filename),
    );
    mocks.writeMetadata.mockClear();
    mocks.writeMetadata.mockImplementation(async (buf: Buffer) => buf);
    mocks.decompressSvgz.mockReset();
    mocks.sanitizeSvg.mockReset();
  });

  describe("POST /api/v1/tools/image/edit-metadata/inspect (#3505)", () => {
    const handler = routes.get("/api/v1/tools/image/edit-metadata/inspect");

    it("decompresses and sanitizes .svgz and .svg inputs before calling inspectMetadata while preserving uploaded fileSize and misnamed raster files", async () => {
      const svgzReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svgz", content: XMP_SVGZ },
      ]);
      expect(svgzReply.statusCode).toBe(200);
      expect(mocks.inspectMetadata).toHaveBeenCalledTimes(1);
      const [passedSvgzBuf] = mocks.inspectMetadata.mock.calls[0] as [Buffer, string];
      const passedSvgzXml = passedSvgzBuf.toString("utf-8");
      expect(passedSvgzXml.trimStart().startsWith("<svg")).toBe(true);
      expect(passedSvgzXml).not.toContain("<script");
      expect(svgzReply.payload).toMatchObject({
        filename: "icon.svgz",
        fileSize: XMP_SVGZ.length,
        xmp: expect.objectContaining({
          Title: "Test Icon Title",
        }),
        keywords: ["vector", "icon"],
      });

      mocks.inspectMetadata.mockClear();
      const svgReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svg", content: XMP_SVG },
      ]);
      expect(svgReply.statusCode).toBe(200);
      expect(mocks.inspectMetadata).toHaveBeenCalledTimes(1);
      const [passedSvgBuf] = mocks.inspectMetadata.mock.calls[0] as [Buffer, string];
      expect(passedSvgBuf.toString("utf-8")).not.toContain("<script");
      expect(svgReply.payload).toMatchObject({
        filename: "icon.svg",
        fileSize: XMP_SVG.length,
        xmp: expect.objectContaining({
          Title: "Test Icon Title",
        }),
        keywords: ["vector", "icon"],
      });

      mocks.inspectMetadata.mockClear();
      const plainSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "plain.svgz", content: XMP_SVG },
      ]);
      expect(plainSvgzReply.statusCode).toBe(200);
      expect(mocks.inspectMetadata).toHaveBeenCalledTimes(1);
      const [passedPlainSvgzBuf] = mocks.inspectMetadata.mock.calls[0] as [Buffer, string];
      expect(passedPlainSvgzBuf.toString("utf-8")).not.toContain("<script");
      expect(plainSvgzReply.payload).toMatchObject({
        filename: "plain.svgz",
        fileSize: XMP_SVG.length,
        xmp: expect.objectContaining({
          Title: "Test Icon Title",
        }),
        keywords: ["vector", "icon"],
      });

      mocks.inspectMetadata.mockClear();
      const exifJpg = readFixture(fixtures.image.exifGps);
      const misnamedJpgReply = await invokeRoute(handler, [
        { type: "file", filename: "misnamed.svgz", content: exifJpg },
      ]);
      expect(misnamedJpgReply.statusCode).toBe(200);
      expect(mocks.inspectMetadata).toHaveBeenCalledTimes(1);
      const [passedJpgBuf] = mocks.inspectMetadata.mock.calls[0] as [Buffer, string];
      expect(Buffer.compare(passedJpgBuf, exifJpg)).toBe(0);
      expect(misnamedJpgReply.payload).toMatchObject({
        filename: "misnamed.svgz",
        fileSize: exifJpg.length,
      });
    });

    it("returns 400 without calling inspectMetadata when .svgz decompression or SVG sanitization rejects", async () => {
      const badSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "bad.svgz", content: NOT_SVG_SVGZ },
      ]);
      expect(badSvgzReply.statusCode).toBe(400);
      expect(badSvgzReply.payload).toEqual({
        error: "SVGZ file does not contain valid SVG content after decompression",
      });

      const corruptSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "corrupt.svgz", content: CORRUPT_SVGZ },
      ]);
      expect(corruptSvgzReply.statusCode).toBe(400);

      const nonGzipSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.svgz", content: NON_GZIP_SVGZ },
      ]);
      expect(nonGzipSvgzReply.statusCode).toBe(400);
      expect(nonGzipSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const truncated1bSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.SVGZ", content: TRUNCATED_1B_SVGZ },
      ]);
      expect(truncated1bSvgzReply.statusCode).toBe(400);
      expect(truncated1bSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const overCapReply = await invokeRoute(handler, [
        { type: "file", filename: "too-many.svg", content: OVER_ELEMENT_SVG },
      ]);
      expect(overCapReply.statusCode).toBe(400);
      expect(overCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });

      const prevMaxSvgMb = env.MAX_SVG_SIZE_MB;
      (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = 1;
      try {
        const overSizeReply = await invokeRoute(handler, [
          { type: "file", filename: "too-large.svgz", content: OVER_SIZE_SVGZ },
        ]);
        expect(overSizeReply.statusCode).toBe(400);
        expect(overSizeReply.payload).toEqual({
          error: "SVG exceeds maximum size of 1MB",
        });
      } finally {
        (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = prevMaxSvgMb;
      }

      expect(mocks.inspectMetadata).not.toHaveBeenCalled();
    });

    it("rethrows unexpected faults from decompressSvgz or sanitizeSvg instead of returning 400", async () => {
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svg", content: XMP_SVG }]),
      ).rejects.toThrow(sanitizeFault);

      const decompressFault = new TypeError("unexpected gunzip fault");
      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svgz", content: XMP_SVGZ }]),
      ).rejects.toThrow(decompressFault);

      expect(mocks.inspectMetadata).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/tools/image/edit-metadata", () => {
    const handler = routes.get("/api/v1/tools/image/edit-metadata");

    it("sanitizes .svg inputs before storing output when no tags are modified", async () => {
      const reply = await invokeRoute(handler, [
        { type: "file", filename: "dirty.svg", content: DIRTY_SVG },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);

      expect(reply.statusCode).toBe(200);
      expect(mocks.writeMetadata).not.toHaveBeenCalled();
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const [, storedBuf] = mocks.putObject.mock.calls[0] as [string, Buffer];
      const storedXml = storedBuf.toString("utf-8");
      expect(storedXml).toContain("<svg");
      expect(storedXml).toContain("<rect");
      expect(storedXml).not.toContain("<script");
      expect(storedXml).not.toContain("alert(1)");
      expect(storedXml).not.toContain("169.254.169.254");
      expect(reply.payload).toMatchObject({
        originalSize: DIRTY_SVG.length,
        processedSize: storedBuf.length,
        previewUrl: undefined,
      });
    });

    it("decompresses and sanitizes .svgz inputs before passing to writeMetadata and storing output", async () => {
      const reply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svgz", content: DIRTY_SVGZ },
        { type: "field", fieldname: "settings", value: JSON.stringify({ title: "Clean Icon" }) },
      ]);

      expect(reply.statusCode).toBe(200);
      expect(mocks.writeMetadata).toHaveBeenCalledTimes(1);
      const [passedBuf] = mocks.writeMetadata.mock.calls[0] as [Buffer, string, string[]];
      const passedXml = passedBuf.toString("utf-8");
      expect(passedXml.trimStart().startsWith("<svg")).toBe(true);
      expect(passedXml).not.toContain("<script");
      expect(passedXml).not.toContain("169.254.169.254");

      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const [, storedBuf] = mocks.putObject.mock.calls[0] as [string, Buffer];
      expect(storedBuf.toString("utf-8")).toBe(passedXml);
      expect(reply.payload).toMatchObject({
        originalSize: DIRTY_SVGZ.length,
        processedSize: storedBuf.length,
      });
    });

    it("returns 400 when .svgz decompression or SVG sanitization rejects", async () => {
      const badSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "bad.svgz", content: NOT_SVG_SVGZ },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(badSvgzReply.statusCode).toBe(400);
      expect(badSvgzReply.payload).toEqual({
        error: "SVGZ file does not contain valid SVG content after decompression",
      });

      const corruptSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "corrupt.svgz", content: CORRUPT_SVGZ },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(corruptSvgzReply.statusCode).toBe(400);

      const nonGzipSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.svgz", content: NON_GZIP_SVGZ },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(nonGzipSvgzReply.statusCode).toBe(400);
      expect(nonGzipSvgzReply.payload).toEqual({
        error: "Invalid image: Unrecognized image format",
      });

      const overCapReply = await invokeRoute(handler, [
        { type: "file", filename: "too-many.svg", content: OVER_ELEMENT_SVG },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(overCapReply.statusCode).toBe(400);
      expect(overCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });

      const prevMaxSvgMb = env.MAX_SVG_SIZE_MB;
      (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = 1;
      try {
        const overSizeReply = await invokeRoute(handler, [
          { type: "file", filename: "too-large.svgz", content: OVER_SIZE_SVGZ },
          { type: "field", fieldname: "settings", value: "{}" },
        ]);
        expect(overSizeReply.statusCode).toBe(400);
        expect(overSizeReply.payload).toEqual({
          error: "SVG exceeds maximum size of 1MB",
        });
      } finally {
        (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = prevMaxSvgMb;
      }

      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw new RangeError("Cannot create a Buffer larger than 52428800");
      });
      const bombReply = await invokeRoute(handler, [
        { type: "file", filename: "bomb.svgz", content: DIRTY_SVGZ },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(bombReply.statusCode).toBe(400);
      expect(bombReply.payload).toEqual({
        error: "Cannot create a Buffer larger than 52428800",
      });

      expect(mocks.writeMetadata).not.toHaveBeenCalled();
      expect(mocks.putObject).not.toHaveBeenCalled();
    });

    it("rethrows unexpected faults from decompressSvgz or sanitizeSvg instead of returning 400 (#3530)", async () => {
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokeRoute(handler, [
          { type: "file", filename: "dirty.svg", content: DIRTY_SVG },
          { type: "field", fieldname: "settings", value: "{}" },
        ]),
      ).rejects.toThrow(sanitizeFault);

      const decompressFault = new TypeError("unexpected gunzip fault");
      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokeRoute(handler, [
          { type: "file", filename: "icon.svgz", content: DIRTY_SVGZ },
          { type: "field", fieldname: "settings", value: "{}" },
        ]),
      ).rejects.toThrow(decompressFault);

      expect(mocks.writeMetadata).not.toHaveBeenCalled();
      expect(mocks.putObject).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/tools/image/strip-metadata/inspect", () => {
    const handler = routes.get("/api/v1/tools/image/strip-metadata/inspect");

    it("decompresses and sanitizes .svgz and .svg inputs before reading metadata without corrupting misnamed raster files", async () => {
      const svgzReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svgz", content: SCRIPT_LT_SVGZ },
      ]);
      expect(svgzReply.statusCode).toBe(200);
      expect(svgzReply.payload).toEqual({
        filename: "icon.svgz",
        fileSize: SCRIPT_LT_SVGZ.length,
      });

      const svgReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svg", content: SCRIPT_LT_SVG },
      ]);
      expect(svgReply.statusCode).toBe(200);
      expect(svgReply.payload).toEqual({
        filename: "icon.svg",
        fileSize: SCRIPT_LT_SVG.length,
      });

      const plainSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "plain.svgz", content: SCRIPT_LT_SVG },
      ]);
      expect(plainSvgzReply.statusCode).toBe(200);
      expect(plainSvgzReply.payload).toEqual({
        filename: "plain.svgz",
        fileSize: SCRIPT_LT_SVG.length,
      });

      const exifJpg = readFixture(fixtures.image.exifGps);
      const misnamedJpgReply = await invokeRoute(handler, [
        { type: "file", filename: "misnamed.svgz", content: exifJpg },
      ]);
      expect(misnamedJpgReply.statusCode).toBe(200);
      expect(misnamedJpgReply.payload).toMatchObject({
        filename: "misnamed.svgz",
        fileSize: exifJpg.length,
      });

      const dotfileReply = await invokeRoute(handler, [
        { type: "file", filename: ".svgz", content: NOT_SVG_SVGZ },
      ]);
      expect(dotfileReply.statusCode).toBe(422);
      expect(dotfileReply.payload).toMatchObject({
        error: "Failed to read image metadata",
      });
    });

    it("returns 400 when .svgz decompression or SVG sanitization rejects", async () => {
      const badSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "bad.svgz", content: NOT_SVG_SVGZ },
      ]);
      expect(badSvgzReply.statusCode).toBe(400);
      expect(badSvgzReply.payload).toEqual({
        error: "SVGZ file does not contain valid SVG content after decompression",
      });

      const corruptSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "corrupt.svgz", content: CORRUPT_SVGZ },
      ]);
      expect(corruptSvgzReply.statusCode).toBe(400);

      const nonGzipSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.svgz", content: NON_GZIP_SVGZ },
      ]);
      expect(nonGzipSvgzReply.statusCode).toBe(400);
      expect(nonGzipSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const truncated1bSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.SVGZ", content: TRUNCATED_1B_SVGZ },
      ]);
      expect(truncated1bSvgzReply.statusCode).toBe(400);
      expect(truncated1bSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const overCapReply = await invokeRoute(handler, [
        { type: "file", filename: "too-many.svg", content: OVER_ELEMENT_SVG },
      ]);
      expect(overCapReply.statusCode).toBe(400);
      expect(overCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });

      const prevMaxSvgMb = env.MAX_SVG_SIZE_MB;
      (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = 1;
      try {
        const overSizeReply = await invokeRoute(handler, [
          { type: "file", filename: "too-large.svgz", content: OVER_SIZE_SVGZ },
        ]);
        expect(overSizeReply.statusCode).toBe(400);
        expect(overSizeReply.payload).toEqual({
          error: "SVG exceeds maximum size of 1MB",
        });
      } finally {
        (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = prevMaxSvgMb;
      }

      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw new RangeError("Cannot create a Buffer larger than 52428800");
      });
      const bombReply = await invokeRoute(handler, [
        { type: "file", filename: "bomb.svgz", content: SCRIPT_LT_SVGZ },
      ]);
      expect(bombReply.statusCode).toBe(400);
      expect(bombReply.payload).toEqual({
        error: "Cannot create a Buffer larger than 52428800",
      });
    });

    it("rethrows unexpected faults from decompressSvgz or sanitizeSvg instead of returning 400 (#3530)", async () => {
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svg", content: SCRIPT_LT_SVG }]),
      ).rejects.toThrow(sanitizeFault);

      const decompressFault = new TypeError("unexpected gunzip fault");
      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svgz", content: SCRIPT_LT_SVGZ }]),
      ).rejects.toThrow(decompressFault);
    });
  });

  describe("POST /api/v1/tools/image/info", () => {
    const handler = routes.get("/api/v1/tools/image/info");

    it("decompresses and sanitizes .svgz and .svg inputs before reading image info", async () => {
      const svgzReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svgz", content: SCRIPT_LT_SVGZ },
      ]);
      expect(svgzReply.statusCode).toBe(200);
      expect(svgzReply.payload).toMatchObject({
        filename: "icon.svgz",
        fileSize: SCRIPT_LT_SVGZ.length,
        width: 100,
        height: 80,
        format: "svg",
      });

      const svgReply = await invokeRoute(handler, [
        { type: "file", filename: "icon.svg", content: SCRIPT_LT_SVG },
      ]);
      expect(svgReply.statusCode).toBe(200);
      expect(svgReply.payload).toMatchObject({
        filename: "icon.svg",
        fileSize: SCRIPT_LT_SVG.length,
        width: 100,
        height: 80,
        format: "svg",
      });

      const plainSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "plain.svgz", content: SCRIPT_LT_SVG },
      ]);
      expect(plainSvgzReply.statusCode).toBe(200);
      expect(plainSvgzReply.payload).toMatchObject({
        filename: "plain.svgz",
        fileSize: SCRIPT_LT_SVG.length,
        width: 100,
        height: 80,
        format: "svg",
      });

      const exifJpg = readFixture(fixtures.image.exifGps);
      const misnamedJpgReply = await invokeRoute(handler, [
        { type: "file", filename: "misnamed.svgz", content: exifJpg },
      ]);
      expect(misnamedJpgReply.statusCode).toBe(200);
      expect(misnamedJpgReply.payload).toMatchObject({
        filename: "misnamed.svgz",
        fileSize: exifJpg.length,
        format: "jpeg",
      });

      const brokenXmlSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><unclosed>');
      const brokenXmlReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.svg", content: brokenXmlSvg },
      ]);
      expect(brokenXmlReply.statusCode).toBe(422);
      expect(brokenXmlReply.payload).toMatchObject({
        error: "Failed to read image metadata",
      });
    });

    it("returns 400 when .svgz decompression or SVG sanitization rejects", async () => {
      const badSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "bad.svgz", content: NOT_SVG_SVGZ },
      ]);
      expect(badSvgzReply.statusCode).toBe(400);
      expect(badSvgzReply.payload).toEqual({
        error: "SVGZ file does not contain valid SVG content after decompression",
      });

      const corruptSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "corrupt.svgz", content: CORRUPT_SVGZ },
      ]);
      expect(corruptSvgzReply.statusCode).toBe(400);

      const nonGzipSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.svgz", content: NON_GZIP_SVGZ },
      ]);
      expect(nonGzipSvgzReply.statusCode).toBe(400);
      expect(nonGzipSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const truncated1bSvgzReply = await invokeRoute(handler, [
        { type: "file", filename: "broken.SVGZ", content: TRUNCATED_1B_SVGZ },
      ]);
      expect(truncated1bSvgzReply.statusCode).toBe(400);
      expect(truncated1bSvgzReply.payload).toEqual({
        error: "Invalid SVGZ file",
      });

      const overCapReply = await invokeRoute(handler, [
        { type: "file", filename: "too-many.svg", content: OVER_ELEMENT_SVG },
      ]);
      expect(overCapReply.statusCode).toBe(400);
      expect(overCapReply.payload).toEqual({
        error: "SVG exceeds maximum element count of 5000",
      });

      const prevMaxSvgMb = env.MAX_SVG_SIZE_MB;
      (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = 1;
      try {
        const overSizeReply = await invokeRoute(handler, [
          { type: "file", filename: "too-large.svgz", content: OVER_SIZE_SVGZ },
        ]);
        expect(overSizeReply.statusCode).toBe(400);
        expect(overSizeReply.payload).toEqual({
          error: "SVG exceeds maximum size of 1MB",
        });
      } finally {
        (env as { MAX_SVG_SIZE_MB: number }).MAX_SVG_SIZE_MB = prevMaxSvgMb;
      }

      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw new RangeError("Cannot create a Buffer larger than 52428800");
      });
      const bombReply = await invokeRoute(handler, [
        { type: "file", filename: "bomb.svgz", content: SCRIPT_LT_SVGZ },
      ]);
      expect(bombReply.statusCode).toBe(400);
      expect(bombReply.payload).toEqual({
        error: "Cannot create a Buffer larger than 52428800",
      });
    });

    it("rethrows unexpected faults from decompressSvgz or sanitizeSvg instead of returning 400 or 422 (#3530)", async () => {
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svg", content: SCRIPT_LT_SVG }]),
      ).rejects.toThrow(sanitizeFault);

      const decompressFault = new TypeError("unexpected gunzip fault");
      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokeRoute(handler, [{ type: "file", filename: "icon.svgz", content: SCRIPT_LT_SVGZ }]),
      ).rejects.toThrow(decompressFault);
    });

    it("propagates DecoderOutOfMemoryError when validateImageBuffer hits a V8 allocation RangeError (#3717)", async () => {
      const exifJpg = readFixture(fixtures.image.exifGps);
      const oom = () => new RangeError("Array buffer allocation failed");
      const metaSpy = vi
        .spyOn(sharp.prototype, "metadata")
        .mockRejectedValueOnce(oom())
        .mockRejectedValueOnce(oom())
        .mockRejectedValueOnce(oom())
        .mockRejectedValueOnce(oom())
        .mockRejectedValueOnce(oom());
      try {
        await expect(
          invokeRoute(routes.get("/api/v1/tools/image/edit-metadata"), [
            { type: "file", filename: "sample.jpg", content: exifJpg },
            { type: "field", fieldname: "settings", value: "{}" },
          ]),
        ).rejects.toBeInstanceOf(DecoderOutOfMemoryError);

        await expect(
          invokeRoute(routes.get("/api/v1/tools/image/edit-metadata/inspect"), [
            { type: "file", filename: "misnamed.svgz", content: exifJpg },
          ]),
        ).rejects.toBeInstanceOf(DecoderOutOfMemoryError);

        await expect(
          invokeRoute(routes.get("/api/v1/tools/image/strip-metadata/inspect"), [
            { type: "file", filename: "misnamed.svgz", content: exifJpg },
          ]),
        ).rejects.toBeInstanceOf(DecoderOutOfMemoryError);

        await expect(
          invokeRoute(handler, [{ type: "file", filename: "sample.jpg", content: exifJpg }]),
        ).rejects.toBeInstanceOf(DecoderOutOfMemoryError);
        expect(metaSpy).toHaveBeenCalledTimes(4);

        await expect(
          invokeRoute(handler, [{ type: "file", filename: "misnamed.svgz", content: exifJpg }]),
        ).rejects.toBeInstanceOf(DecoderOutOfMemoryError);
        expect(metaSpy).toHaveBeenCalledTimes(5);
      } finally {
        metaSpy.mockRestore();
      }
    });
  });

  describe("custom SVG tool routes rethrow unexpected sanitizer faults while returning 400/batch-skip on client SVG errors (#3580)", () => {
    it.each([
      {
        name: "POST /api/v1/tools/image/svg-to-raster",
        url: "/api/v1/tools/image/svg-to-raster",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/stitch",
        url: "/api/v1/tools/image/stitch",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "file" as const, filename: "second.svg", content: DIRTY_SVG },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/barcode-read",
        url: "/api/v1/tools/image/barcode-read",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/split",
        url: "/api/v1/tools/image/split",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/meme-generator",
        url: "/api/v1/tools/image/meme-generator",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/color-palette",
        url: "/api/v1/tools/image/color-palette",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/collage",
        url: "/api/v1/tools/image/collage",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "file" as const, filename: "second.svg", content: DIRTY_SVG },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
      {
        name: "POST /api/v1/tools/image/image-to-pdf",
        url: "/api/v1/tools/image/image-to-pdf",
        makeParts: (filename: string, content: Buffer) => [
          { type: "file" as const, filename, content },
          { type: "file" as const, filename: "second.svg", content: DIRTY_SVG },
          { type: "field" as const, fieldname: "settings", value: "{}" },
        ],
      },
    ])(
      "$name returns 400 on client SVG/SVGZ errors and rethrows unexpected TypeError faults (#3580)",
      async ({ url, makeParts }) => {
        const routeHandler = routes.get(url);

        const overCapReply = await invokeRoute(
          routeHandler,
          makeParts("too-many.svg", OVER_ELEMENT_SVG),
        );
        expect(overCapReply.statusCode).toBe(400);
        expect((overCapReply.payload as { error?: string })?.error).toContain(
          "SVG exceeds maximum element count of 5000",
        );

        const nonSvgReply = await invokeRoute(routeHandler, makeParts("bad.svgz", NOT_SVG_SVGZ));
        expect(nonSvgReply.statusCode).toBe(400);
        expect((nonSvgReply.payload as { error?: string })?.error).toContain(
          "SVGZ file does not contain valid SVG content after decompression",
        );

        const sanitizeFault = new TypeError("unexpected sanitizer fault");
        mocks.sanitizeSvg.mockImplementationOnce(() => {
          throw sanitizeFault;
        });
        await expect(invokeRoute(routeHandler, makeParts("icon.svg", DIRTY_SVG))).rejects.toThrow(
          sanitizeFault,
        );

        const decompressFault = new TypeError("unexpected gunzip fault");
        mocks.decompressSvgz.mockImplementationOnce(() => {
          throw decompressFault;
        });
        await expect(invokeRoute(routeHandler, makeParts("icon.svgz", DIRTY_SVGZ))).rejects.toThrow(
          decompressFault,
        );

        expect(mocks.putObject).not.toHaveBeenCalled();
      },
    );

    it("POST /api/v1/tools/image/svg-to-raster/batch records per-file errors on client SVG/SVGZ rejections and settles failBatchJob before rethrowing unexpected TypeError faults (#3580)", async () => {
      const batchHandler = routes.get("/api/v1/tools/image/svg-to-raster/batch");

      const clientFailReply = await invokeRoute(batchHandler, [
        { type: "file", filename: "bad.svgz", content: NOT_SVG_SVGZ },
        { type: "file", filename: "too-many.svg", content: OVER_ELEMENT_SVG },
        { type: "field", fieldname: "settings", value: "{}" },
      ]);
      expect(clientFailReply.statusCode).toBe(422);
      expect(clientFailReply.payload).toMatchObject({
        error: "All files failed processing",
        errors: [
          {
            filename: "bad.svgz",
            error: "SVGZ file does not contain valid SVG content after decompression",
          },
          {
            filename: "too-many.svg",
            error: "SVG exceeds maximum element count of 5000",
          },
        ],
      });

      mocks.failBatchJob.mockClear();
      const sanitizeFault = new TypeError("unexpected sanitizer fault");
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw sanitizeFault;
      });
      await expect(
        invokeRoute(batchHandler, [
          { type: "file", filename: "icon.svg", content: SCRIPT_LT_SVG },
          { type: "field", fieldname: "settings", value: "{}" },
        ]),
      ).rejects.toThrow(sanitizeFault);
      expect(mocks.failBatchJob).toHaveBeenCalledWith(
        expect.objectContaining({
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 1,
          message: "Internal server error",
          errors: [{ filename: "", error: "Internal server error" }],
        }),
      );

      mocks.failBatchJob.mockClear();
      const decompressFault = new TypeError("unexpected gunzip fault");
      mocks.decompressSvgz.mockImplementationOnce(() => {
        throw decompressFault;
      });
      await expect(
        invokeRoute(batchHandler, [
          { type: "file", filename: "icon.svgz", content: SCRIPT_LT_SVGZ },
          { type: "field", fieldname: "settings", value: "{}" },
        ]),
      ).rejects.toThrow(decompressFault);
      expect(mocks.failBatchJob).toHaveBeenCalledWith(
        expect.objectContaining({
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 1,
          message: "Internal server error",
          errors: [{ filename: "", error: "Internal server error" }],
        }),
      );
    });
  });
});
