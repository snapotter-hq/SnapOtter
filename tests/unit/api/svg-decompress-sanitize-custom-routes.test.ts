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
  inspectMetadata: vi.fn<(buf: Buffer, filename: string) => Promise<InspectResult>>(),
  writeMetadata: vi.fn<(buf: Buffer, filename: string, tags: string[]) => Promise<Buffer>>(
    async (buf: Buffer) => buf,
  ),
}));

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

import { env } from "../../../apps/api/src/config.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerInfo } from "../../../apps/api/src/routes/tools/info.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
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
    headers: {},
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
    mocks.inspectMetadata.mockClear();
    mocks.inspectMetadata.mockImplementation(async (buf: Buffer, filename: string) =>
      defaultInspectMetadata(buf, filename),
    );
    mocks.writeMetadata.mockClear();
    mocks.writeMetadata.mockImplementation(async (buf: Buffer) => buf);
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
    });
  });
});
