/**
 * Unit tests for pure utility functions exported from fetch-urls and meme-templates routes:
 * - filenameFromUrl: extract filename from URL path (apps/api/src/routes/fetch-urls.ts)
 * - getUniqueName: deduplicate filenames (apps/api/src/routes/fetch-urls.ts)
 * - hasPathTraversal: detect path traversal in filenames (apps/api/src/routes/meme-templates.ts)
 * - getContentType: extension to MIME mapping (apps/api/src/routes/meme-templates.ts)
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

const putObjectMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: putObjectMock,
  };
});

import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import {
  filenameFromUrl,
  getUniqueName,
  registerFetchUrlsRoute,
} from "../../../apps/api/src/routes/fetch-urls.js";
import { getContentType, hasPathTraversal } from "../../../apps/api/src/routes/meme-templates.js";

const FALLBACK_FILENAME_RE = /^file-[0-9a-f]{8}$/;

// ---------------------------------------------------------------------------
// filenameFromUrl
// ---------------------------------------------------------------------------
describe("filenameFromUrl", () => {
  it("extracts filename from simple URL", () => {
    expect(filenameFromUrl("https://example.com/images/photo.jpg")).toBe("photo.jpg");
  });

  it("extracts filename from URL with query string", () => {
    expect(filenameFromUrl("https://example.com/img/cat.png?size=large")).toBe("cat.png");
  });

  it("decodes percent-encoded characters", () => {
    expect(filenameFromUrl("https://example.com/my%20photo.jpg")).toBe("my photo.jpg");
  });

  it("returns file-<uuid8> fallback for URL without extension", () => {
    expect(filenameFromUrl("https://example.com/images/12345")).toMatch(FALLBACK_FILENAME_RE);
  });

  it("returns file-<uuid8> fallback for empty path", () => {
    expect(filenameFromUrl("https://example.com/")).toMatch(FALLBACK_FILENAME_RE);
  });

  it("returns file-<uuid8> fallback for root URL", () => {
    expect(filenameFromUrl("https://example.com")).toMatch(FALLBACK_FILENAME_RE);
  });

  it("returns file-<uuid8> fallback for invalid URL", () => {
    expect(filenameFromUrl("not a url")).toMatch(FALLBACK_FILENAME_RE);
  });

  it("handles deeply nested path", () => {
    expect(filenameFromUrl("https://cdn.example.com/a/b/c/d/e/image.webp")).toBe("image.webp");
  });

  it("handles filename with multiple dots", () => {
    expect(filenameFromUrl("https://example.com/my.photo.2024.png")).toBe("my.photo.2024.png");
  });

  it("returns file-<uuid8> fallback for filename over 255 characters", () => {
    const longName = `${"a".repeat(256)}.jpg`;
    const url = `https://example.com/${longName}`;
    expect(filenameFromUrl(url)).toMatch(FALLBACK_FILENAME_RE);
  });

  it("handles filename at exactly 255 characters", () => {
    const name = `${"a".repeat(251)}.jpg`; // 251 + 4 = 255
    const url = `https://example.com/${name}`;
    expect(filenameFromUrl(url)).toBe(name);
  });

  it("returns file-<uuid8> fallback for leading-dot dotfiles without an extension (#3263)", () => {
    expect(filenameFromUrl("https://example.com/.gitignore")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/.dng")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/.tga")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/.svgz")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/README.")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/..tga")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/.hidden..png")).toMatch(FALLBACK_FILENAME_RE);
    expect(filenameFromUrl("https://example.com/.hidden.png")).toBe(".hidden.png");
  });
});

// ---------------------------------------------------------------------------
// getUniqueName
// ---------------------------------------------------------------------------
describe("getUniqueName", () => {
  it("returns name unchanged if not in used set", () => {
    const used = new Set<string>();
    expect(getUniqueName("photo.jpg", used)).toBe("photo.jpg");
    expect(used.has("photo.jpg")).toBe(true);
  });

  it("appends _1 for first collision", () => {
    const used = new Set<string>(["photo.jpg"]);
    expect(getUniqueName("photo.jpg", used)).toBe("photo_1.jpg");
  });

  it("appends _2 when _1 is also taken", () => {
    const used = new Set<string>(["photo.jpg", "photo_1.jpg"]);
    expect(getUniqueName("photo.jpg", used)).toBe("photo_2.jpg");
  });

  it("handles multiple collisions", () => {
    const used = new Set<string>(["photo.jpg", "photo_1.jpg", "photo_2.jpg"]);
    expect(getUniqueName("photo.jpg", used)).toBe("photo_3.jpg");
  });

  it("handles filename without extension", () => {
    const used = new Set<string>(["readme"]);
    expect(getUniqueName("readme", used)).toBe("readme_1");
  });

  it("handles filename with multiple dots", () => {
    const used = new Set<string>(["my.photo.png"]);
    expect(getUniqueName("my.photo.png", used)).toBe("my.photo_1.png");
  });

  it("adds each unique name to the used set", () => {
    const used = new Set<string>();
    getUniqueName("a.jpg", used);
    getUniqueName("b.jpg", used);
    getUniqueName("a.jpg", used);
    expect(used.has("a.jpg")).toBe(true);
    expect(used.has("b.jpg")).toBe(true);
    expect(used.has("a_1.jpg")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasPathTraversal
// ---------------------------------------------------------------------------
describe("hasPathTraversal", () => {
  it("returns true for ..", () => {
    expect(hasPathTraversal("../secret.txt")).toBe(true);
  });

  it("returns true for embedded ..", () => {
    expect(hasPathTraversal("foo/../bar.jpg")).toBe(true);
  });

  it("returns true for forward slash", () => {
    expect(hasPathTraversal("path/to/file.jpg")).toBe(true);
  });

  it("returns true for backslash", () => {
    expect(hasPathTraversal("path\\to\\file.jpg")).toBe(true);
  });

  it("returns true for null byte", () => {
    expect(hasPathTraversal("file\0.jpg")).toBe(true);
  });

  it("returns false for safe filenames", () => {
    expect(hasPathTraversal("photo.jpg")).toBe(false);
    expect(hasPathTraversal("my-photo_2024.png")).toBe(false);
    expect(hasPathTraversal("image.webp")).toBe(false);
  });

  it("returns false for filename with dots that are not traversal", () => {
    expect(hasPathTraversal("my.photo.jpg")).toBe(false);
    expect(hasPathTraversal(".hidden")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getContentType
// ---------------------------------------------------------------------------
describe("getContentType", () => {
  it("maps .jpg to image/jpeg", () => {
    expect(getContentType("photo.jpg")).toBe("image/jpeg");
  });

  it("maps .jpeg to image/jpeg", () => {
    expect(getContentType("photo.jpeg")).toBe("image/jpeg");
  });

  it("maps .png to image/png", () => {
    expect(getContentType("icon.png")).toBe("image/png");
  });

  it("maps .webp to image/webp", () => {
    expect(getContentType("photo.webp")).toBe("image/webp");
  });

  it("maps .ttf to font/ttf", () => {
    expect(getContentType("arial.ttf")).toBe("font/ttf");
  });

  it("handles uppercase extensions via toLowerCase", () => {
    expect(getContentType("photo.JPG")).toBe("image/jpeg");
    expect(getContentType("photo.PNG")).toBe("image/png");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getContentType("doc.pdf")).toBeUndefined();
    expect(getContentType("file.txt")).toBeUndefined();
  });

  it("returns undefined for filename without extension", () => {
    expect(getContentType("noextension")).toBeUndefined();
  });

  it("uses the last dot for extension detection", () => {
    expect(getContentType("archive.tar.jpg")).toBe("image/jpeg");
  });
});

// ---------------------------------------------------------------------------
// registerFetchUrlsRoute nameOnly image validations (#3263)
// ---------------------------------------------------------------------------
describe("registerFetchUrlsRoute nameOnly image validations (#3263)", () => {
  type FetchUrlsHandler = (req: unknown, reply: unknown) => Promise<unknown>;

  async function getFetchUrlsHandler(): Promise<FetchUrlsHandler> {
    const routes = new Map<string, FetchUrlsHandler>();
    const fakeApp = {
      post: (path: string, _opts: unknown, handler: FetchUrlsHandler) => {
        routes.set(path, handler);
      },
    } as unknown as Parameters<typeof registerFetchUrlsRoute>[0];
    await registerFetchUrlsRoute(fakeApp);
    const handler = routes.get("/api/v1/fetch-urls");
    if (!handler) throw new Error("fetch-urls route not registered");
    return handler;
  }

  function makeReply() {
    let statusCode = 200;
    let payload: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(body: unknown) {
        payload = body;
        return reply;
      },
      get statusCode() {
        return statusCode;
      },
      get payload() {
        return payload;
      },
    };
    return reply;
  }

  it("treats nameOnly validations (.dng, .cr2, .nef, .tga, .svgz with non-image bytes) as non-images (#3263)", async () => {
    const handler = await getFetchUrlsHandler();
    const nonSvgGzip = gzipSync(Buffer.from("hello"));
    const decodeSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith(".svgz")) {
          return new Response(new Uint8Array(nonSvgGzip), {
            status: 200,
            headers: { "Content-Type": "application/gzip" },
          });
        }
        if (href.endsWith(".nef")) {
          return new Response(new Uint8Array(Buffer.from("hello")), { status: 200 });
        }
        return new Response("hello", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
    );

    try {
      putObjectMock.mockClear();
      const reply = makeReply();
      await handler(
        {
          body: {
            urls: [
              "http://1.2.3.4:9999/notes.dng",
              "http://1.2.3.4:9999/notes.cr2",
              "http://1.2.3.4:9999/notes.nef",
              "http://1.2.3.4:9999/notes.tga",
              "http://1.2.3.4:9999/archive.svgz",
              "http://1.2.3.4:9999/.gitignore",
            ],
          },
          log: { warn: vi.fn() },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as {
        results: Array<{
          success: boolean;
          filename?: string;
          contentType?: string;
          width?: number;
          height?: number;
          previewUrl?: string | null;
        }>;
      };
      expect(body.results).toHaveLength(6);
      expect(body.results[0]).toMatchObject({
        success: true,
        filename: "notes.dng",
        contentType: "text/plain",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(body.results[1]).toMatchObject({
        success: true,
        filename: "notes.cr2",
        contentType: "text/plain",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(body.results[2]).toMatchObject({
        success: true,
        filename: "notes.nef",
        contentType: "application/octet-stream",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(body.results[3]).toMatchObject({
        success: true,
        filename: "notes.tga",
        contentType: "text/plain",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(body.results[4]).toMatchObject({
        success: true,
        filename: "archive.svgz",
        contentType: "application/gzip",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(body.results[5]).toMatchObject({
        success: true,
        filename: expect.stringMatching(FALLBACK_FILENAME_RE),
        contentType: "text/plain",
        width: undefined,
        height: undefined,
        previewUrl: null,
      });
      expect(decodeSpy).not.toHaveBeenCalled();
      // Only the 6 raw uploads should be written, with no preview-*.webp objects.
      expect(putObjectMock).toHaveBeenCalledTimes(6);
    } finally {
      decodeSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("still treats byte-proven .svgz, .raf, .dng, and .tga images as valid images (#3263)", async () => {
    const handler = await getFetchUrlsHandler();
    const validSvgz = gzipSync(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    );
    const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
    const tiffMagic = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const validTga = Buffer.from([
      0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 24, 0, 0xff, 0x00, 0x00,
    ]);
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValue(new Error("mock decode failure"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith(".svgz")) {
          return new Response(new Uint8Array(validSvgz), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        if (href.endsWith(".dng")) {
          return new Response(new Uint8Array(tiffMagic), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        if (href.endsWith(".tga")) {
          return new Response(new Uint8Array(validTga), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        return new Response(new Uint8Array(rafMagic), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }),
    );

    try {
      const reply = makeReply();
      await handler(
        {
          body: {
            urls: [
              "http://1.2.3.4:9999/icon.svgz",
              "http://1.2.3.4:9999/photo.raf",
              "http://1.2.3.4:9999/shot.dng",
              "http://1.2.3.4:9999/sprite.tga",
            ],
          },
          log: { warn: vi.fn() },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as {
        results: Array<{
          success: boolean;
          filename?: string;
          contentType?: string;
          width?: number;
          height?: number;
        }>;
      };
      expect(body.results).toHaveLength(4);
      expect(body.results[0]).toMatchObject({
        success: true,
        filename: "icon.svgz",
        contentType: "image/svg+xml",
        width: 0,
        height: 0,
      });
      expect(body.results[1]).toMatchObject({
        success: true,
        filename: "photo.raf",
        contentType: "image/x-dcraw",
        width: 0,
        height: 0,
      });
      expect(body.results[2]).toMatchObject({
        success: true,
        filename: "shot.dng",
        contentType: "image/x-dcraw",
        width: 0,
        height: 0,
      });
      expect(body.results[3]).toMatchObject({
        success: true,
        filename: "sprite.tga",
        contentType: "image/x-tga",
        width: 0,
        height: 0,
      });
      expect(decodeSpy).toHaveBeenCalledTimes(3);
    } finally {
      decodeSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
