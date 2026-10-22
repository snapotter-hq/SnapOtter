/**
 * #2800: When writing the decoder temp file in decodeHeic or decodeToSharpCompat
 * fails with ENOSPC, EDQUOT, EACCES, EPERM, or EROFS, inline decode routes must
 * normalize the write error and surface 503 ("storage-full" or
 * "storage-not-writable") instead of answering 422/400 or falling back to
 * Sharp's native TIFF header read on DNG inputs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath } from "@snapotter/shared";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const deletePrefix = vi.fn();
const decodeHeic = vi.fn();
const decodeToSharpCompat = vi.fn();
const writeFileFailure = { next: null as Error | null };
const readFileFailure = { next: null as Error | null };
const infoExifPaths: string[] = [];
const uploadedBuffers = new Map<string, Buffer>();

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: (async (path: unknown, ...rest: unknown[]) => {
      if (/(?:info-exif|exif-inspect|exif-write)-/.test(String(path))) {
        if (/info-exif-/.test(String(path))) {
          infoExifPaths.push(String(path));
        }
        if (writeFileFailure.next) {
          const err = writeFileFailure.next;
          writeFileFailure.next = null;
          throw err;
        }
      }
      return (actual.writeFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.writeFile,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      if (/exif-write-/.test(String(path)) && readFileFailure.next) {
        const err = readFileFailure.next;
        readFileFailure.next = null;
        throw err;
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFile,
  };
});

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return {
    ...actual,
    requireToolAccess: vi.fn(async () => ({ id: "user-1", role: "admin" })),
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    putObjectStream: async (key: string, source: AsyncIterable<Buffer>) => {
      const chunks: Buffer[] = [];
      for await (const chunk of source) chunks.push(Buffer.from(chunk));
      const buf = Buffer.concat(chunks);
      uploadedBuffers.set(key, buf);
      return buf.length;
    },
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: (...args: unknown[]) => decodeHeic(...args),
  };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: (...args: unknown[]) => decodeToSharpCompat(...args),
  };
});

import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
import { normalizeOperationalWriteError } from "../../../apps/api/src/lib/object-storage.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerBarcodeRead } from "../../../apps/api/src/routes/tools/barcode-read.js";
import { registerBeautify } from "../../../apps/api/src/routes/tools/beautify.js";
import { registerCollage } from "../../../apps/api/src/routes/tools/collage.js";
import { registerColorPalette } from "../../../apps/api/src/routes/tools/color-palette.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerFavicon } from "../../../apps/api/src/routes/tools/favicon.js";
import { registerFindDuplicates } from "../../../apps/api/src/routes/tools/find-duplicates.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImageToBase64 } from "../../../apps/api/src/routes/tools/image-to-base64.js";
import { registerInfo } from "../../../apps/api/src/routes/tools/info.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerStitch } from "../../../apps/api/src/routes/tools/stitch.js";

const PNG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.png"));
const HEIC = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.heic"));
const PSD = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.psd"));
const DNG = readFileSync(join(__dirname, "../../fixtures/image/formats/sample.dng"));

function errnoError(code: string, syscall = "open"): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: temp write failed, ${syscall} '/tmp/in-${code}'`), {
    code,
    syscall,
  });
}

function multipartBody(
  files: Array<{ filename: string; contentType: string; content: Buffer; fieldname?: string }>,
  settings?: Record<string, unknown>,
) {
  const boundary = "----unit";
  const parts: Buffer[] = [];
  for (const file of files) {
    const field = file.fieldname ?? "file";
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    );
  }
  if (settings !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  registerErrorHandler(app);
  registerResize(app);
  registerStitch(app);
  registerCollage(app);
  registerSplit(app);
  registerColorPalette(app);
  registerBarcodeRead(app);
  registerMemeGenerator(app);
  registerImageEnhancement(app);
  registerOptimizeForWeb(app);
  registerFindDuplicates(app);
  registerFavicon(app);
  registerImageToBase64(app);
  registerBeautify(app);
  registerEditMetadata(app);
  registerInfo(app);
  await app.ready();
  return app;
}

const WRITE_ERRNOS: ReadonlyArray<readonly [string, string]> = [
  ["ENOSPC", "storage-full"],
  ["EDQUOT", "storage-full"],
  ["EACCES", "storage-not-writable"],
  ["EPERM", "storage-not-writable"],
  ["EROFS", "storage-not-writable"],
];

interface RouteSpec {
  name: string;
  url: string;
  heicFiles: Array<{ filename: string; contentType: string; content: Buffer; fieldname?: string }>;
  psdFiles: Array<{ filename: string; contentType: string; content: Buffer; fieldname?: string }>;
  dngFiles: Array<{ filename: string; contentType: string; content: Buffer; fieldname?: string }>;
  settings?: Record<string, unknown>;
}

const ROUTES: RouteSpec[] = [
  {
    name: "resize (factory ImageInputHandler)",
    url: apiToolPath("resize"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
    settings: { width: 100 },
  },
  {
    name: "stitch",
    url: apiToolPath("stitch"),
    heicFiles: [
      { filename: "a.heic", contentType: "image/heic", content: HEIC },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    psdFiles: [
      { filename: "a.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    dngFiles: [
      { filename: "a.dng", contentType: "image/x-adobe-dng", content: DNG },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
  },
  {
    name: "collage",
    url: apiToolPath("collage"),
    heicFiles: [
      { filename: "a.heic", contentType: "image/heic", content: HEIC },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    psdFiles: [
      { filename: "a.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    dngFiles: [
      { filename: "a.dng", contentType: "image/x-adobe-dng", content: DNG },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
  },
  {
    name: "split",
    url: apiToolPath("split"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "color-palette",
    url: apiToolPath("color-palette"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "info",
    url: apiToolPath("info"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "barcode-read",
    url: apiToolPath("barcode-read"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "meme-generator",
    url: apiToolPath("meme-generator"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
    settings: { topText: "TOP", bottomText: "BOTTOM" },
  },
  {
    name: "image-enhancement/analyze",
    url: "/api/v1/tools/image/image-enhancement/analyze",
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "optimize-for-web/preview",
    url: "/api/v1/tools/image/optimize-for-web/preview",
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "find-duplicates",
    url: apiToolPath("find-duplicates"),
    heicFiles: [
      { filename: "a.heic", contentType: "image/heic", content: HEIC },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    psdFiles: [
      { filename: "a.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
    dngFiles: [
      { filename: "a.dng", contentType: "image/x-adobe-dng", content: DNG },
      { filename: "b.png", contentType: "image/png", content: PNG },
    ],
  },
  {
    name: "favicon",
    url: apiToolPath("favicon"),
    heicFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "photo.heic", contentType: "image/heic", content: HEIC },
    ],
    psdFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
    ],
    dngFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
    ],
  },
  {
    name: "image-to-base64",
    url: apiToolPath("image-to-base64"),
    heicFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "photo.heic", contentType: "image/heic", content: HEIC },
    ],
    psdFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
    ],
    dngFiles: [
      { filename: "b.png", contentType: "image/png", content: PNG },
      { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
    ],
  },
  {
    name: "beautify",
    url: apiToolPath("beautify"),
    heicFiles: [{ filename: "photo.heic", contentType: "image/heic", content: HEIC }],
    psdFiles: [{ filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD }],
    dngFiles: [{ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }],
  },
  {
    name: "beautify (backgroundImage)",
    url: apiToolPath("beautify"),
    heicFiles: [
      { filename: "main.png", contentType: "image/png", content: PNG },
      {
        filename: "bg.heic",
        contentType: "image/heic",
        content: HEIC,
        fieldname: "backgroundImage",
      },
    ],
    psdFiles: [
      { filename: "main.png", contentType: "image/png", content: PNG },
      {
        filename: "bg.psd",
        contentType: "image/vnd.adobe.photoshop",
        content: PSD,
        fieldname: "backgroundImage",
      },
    ],
    dngFiles: [
      { filename: "main.png", contentType: "image/png", content: PNG },
      {
        filename: "bg.dng",
        contentType: "image/x-adobe-dng",
        content: DNG,
        fieldname: "backgroundImage",
      },
    ],
    settings: { backgroundType: "image" },
  },
];

describe("inline decode routes surface operational tmpdir write faults as 503 (#2800)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    uploadedBuffers.clear();
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer
      .mockReset()
      .mockImplementation(async (key: unknown) => uploadedBuffers.get(String(key)) ?? PNG);
    deletePrefix.mockReset().mockResolvedValue(undefined);
    decodeHeic.mockReset().mockResolvedValue(PNG);
    decodeToSharpCompat.mockReset().mockResolvedValue(PNG);
    writeFileFailure.next = null;
    readFileFailure.next = null;
    infoExifPaths.length = 0;
  });

  describe.each(ROUTES)("$name", (route) => {
    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) when decodeHeic fails writing to tmpdir",
      async (errno, expectedCode) => {
        for (const err of [errnoError(errno), normalizeOperationalWriteError(errnoError(errno))]) {
          decodeHeic.mockRejectedValue(err);
          const res = await app.inject({
            method: "POST",
            url: route.url,
            ...multipartBody(route.heicFiles, route.settings),
          });
          expect(res.statusCode, res.body).toBe(503);
          expect(res.json()).toMatchObject({ code: expectedCode });
        }
      },
    );

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) when decodeToSharpCompat fails writing to tmpdir on PSD",
      async (errno, expectedCode) => {
        for (const err of [errnoError(errno), normalizeOperationalWriteError(errnoError(errno))]) {
          decodeToSharpCompat.mockRejectedValue(err);
          const res = await app.inject({
            method: "POST",
            url: route.url,
            ...multipartBody(route.psdFiles, route.settings),
          });
          expect(res.statusCode, res.body).toBe(503);
          expect(res.json()).toMatchObject({ code: expectedCode });
        }
      },
    );

    it("answers 503 storage-full when decodeToSharpCompat hits ENOSPC even on a DNG that Sharp can read", async () => {
      for (const err of [
        errnoError("ENOSPC"),
        normalizeOperationalWriteError(errnoError("ENOSPC")),
      ]) {
        decodeToSharpCompat.mockRejectedValue(err);
        const res = await app.inject({
          method: "POST",
          url: route.url,
          ...multipartBody(route.dngFiles, route.settings),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toMatchObject({ code: "storage-full" });
      }
    });
  });

  describe.each([
    ["meme-generator", { topText: "A", bottomText: "B" }],
    ["beautify", { outputFormat: "png" }],
  ] as const)("%s registered process function", (toolId, defaultSettings) => {
    it.each(WRITE_ERRNOS)(
      "surfaces 503 %s (%s) when decodeHeic or decodeToSharpCompat fails writing to tmpdir",
      async (errno, expectedCode) => {
        const cfg = getToolConfig(toolId);
        expect(cfg).toBeDefined();

        decodeHeic.mockRejectedValueOnce(errnoError(errno));
        await expect(cfg?.process(HEIC, defaultSettings, "photo.heic")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });

        decodeToSharpCompat.mockRejectedValueOnce(errnoError(errno));
        await expect(cfg?.process(DNG, defaultSettings, "photo.dng")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
      },
    );
  });

  describe("info HEIC fallback guess and readExifToolMeta (#3451)", () => {
    const UNREADABLE = Buffer.from("not an image header at all, forces HEIC fallback guess");

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) when the fallback HEIC guess fails writing to tmpdir",
      async (errno, expectedCode) => {
        for (const err of [errnoError(errno), normalizeOperationalWriteError(errnoError(errno))]) {
          decodeHeic.mockRejectedValue(err);
          const res = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "mystery.jpg", contentType: "image/jpeg", content: UNREADABLE },
            ]),
          });
          expect(res.statusCode, res.body).toBe(503);
          expect(res.json()).toMatchObject({ code: expectedCode });
        }
      },
    );

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) when readExifToolMeta fails writing its temp file",
      async (errno, expectedCode) => {
        writeFileFailure.next = errnoError(errno);
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
          ]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toMatchObject({ code: expectedCode });
      },
    );

    it("falls back to Sharp on a TIFF-headed DNG when decodeToSharpCompat throws DecoderUnavailableError, but surfaces 503 on DecoderOutOfMemoryError", async () => {
      decodeToSharpCompat.mockRejectedValueOnce(
        new DecoderUnavailableError("No RAW decoder found."),
      );
      const okRes = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
        ]),
      });
      expect(okRes.statusCode, okRes.body).toBe(200);
      expect(okRes.json()).toMatchObject({ filename: "photo.dng" });

      decodeToSharpCompat.mockRejectedValueOnce(
        new DecoderOutOfMemoryError("The RAW decoder ran out of memory."),
      );
      const oomRes = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
        ]),
      });
      expect(oomRes.statusCode, oomRes.body).toBe(503);
      expect(oomRes.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    });

    it("surfaces 503 ENGINE_UNAVAILABLE on PSD when decodeToSharpCompat throws DecoderUnavailableError and 422 on corrupt PSD", async () => {
      decodeToSharpCompat.mockRejectedValueOnce(
        new DecoderUnavailableError("No PSD decoder found."),
      );
      const unavailableRes = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
        ]),
      });
      expect(unavailableRes.statusCode, unavailableRes.body).toBe(503);
      expect(unavailableRes.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });

      decodeToSharpCompat.mockRejectedValueOnce(new Error("corrupt PSD layer"));
      const corruptRes = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
        ]),
      });
      expect(corruptRes.statusCode, corruptRes.body).toBe(422);
      expect(corruptRes.json()).toMatchObject({ error: "Failed to read image metadata" });
    });

    it("falls back to Sharp metadata on DNG when readExifToolMeta encounters a non-operational error", async () => {
      writeFileFailure.next = errnoError("ENOENT");
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
        ]),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ filename: "photo.dng" });
    });

    it.each([
      ["", undefined, ".dng"],
      ["DSCF0001", undefined, ".dng"],
      [".raf", undefined, ".dng"],
      ["DSCF0001.", undefined, ".dng"],
      ["DSCF0001.RAF", "raf", ".raf"],
      ["shoot.2026.RAF", "raf", ".raf"],
      ["DSCF0001.r-a_f", "r-a_f", ".raf"],
      ["DSCF0001.---", "---", ".dng"],
      ["DSCF0001.notaraw", "notaraw", ".dng"],
    ] as const)(
      "extracts ext=%s -> %s with extname and writes readExifToolMeta temp file with %s suffix (#3278)",
      async (filename, expectedExt, expectedSuffix) => {
        const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename, contentType: "application/octet-stream", content: rafMagic },
          ]),
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(decodeToSharpCompat).toHaveBeenCalledWith(rafMagic, "raw", expectedExt);
        expect(infoExifPaths).toHaveLength(1);
        expect(infoExifPaths[0]).toMatch(new RegExp(`info-exif-\\d+\\${expectedSuffix}$`));
      },
    );
  });

  describe("edit-metadata and edit-metadata/inspect exiftool tmpdir faults (#3548)", () => {
    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) on POST /api/v1/tools/image/edit-metadata/inspect when inspectMetadata fails writing to tmpdir",
      async (errno, expectedCode) => {
        writeFileFailure.next = errnoError(errno);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/edit-metadata/inspect",
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toMatchObject({ code: expectedCode });
      },
    );

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) on POST /api/v1/tools/image/edit-metadata when writeMetadata fails writing or reading tmpdir",
      async (errno, expectedCode) => {
        writeFileFailure.next = errnoError(errno);
        const writeRes = await app.inject({
          method: "POST",
          url: apiToolPath("edit-metadata"),
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }], {
            artist: "Ada",
          }),
        });
        expect(writeRes.statusCode, writeRes.body).toBe(503);
        expect(writeRes.json()).toMatchObject({ code: expectedCode });

        readFileFailure.next = errnoError(errno, "read");
        const readRes = await app.inject({
          method: "POST",
          url: apiToolPath("edit-metadata"),
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }], {
            artist: "Ada",
          }),
        });
        expect(readRes.statusCode, readRes.body).toBe(503);
        expect(readRes.json()).toMatchObject({ code: expectedCode });
      },
    );

    it("answers 503 ENGINE_UNAVAILABLE on POST /api/v1/tools/image/edit-metadata and /inspect when exiftool or readFile hits an ENGINE_UNAVAILABLE fault", async () => {
      readFileFailure.next = new RangeError("Array buffer allocation failed");
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("edit-metadata"),
        ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }], {
          artist: "Ada",
        }),
      });
      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });

      writeFileFailure.next = new DecoderOutOfMemoryError("The image decoder ran out of memory.");
      const inspectOomRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/edit-metadata/inspect",
        ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
      });
      expect(inspectOomRes.statusCode, inspectOomRes.body).toBe(503);
      expect(inspectOomRes.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    });

    it.each(WRITE_ERRNOS)(
      "surfaces 503 %s (%s) from the edit-metadata registered process function when writeMetadata hits a tmpdir write or read fault",
      async (errno, expectedCode) => {
        const cfg = getToolConfig("edit-metadata");
        expect(cfg).toBeDefined();

        writeFileFailure.next = errnoError(errno);
        await expect(cfg?.process(PNG, { artist: "Ada" }, "photo.png")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });

        readFileFailure.next = errnoError(errno, "read");
        await expect(cfg?.process(PNG, { artist: "Ada" }, "photo.png")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
      },
    );
  });
});
