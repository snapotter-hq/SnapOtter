/**
 * #2800: When writing the decoder temp file in decodeHeic or decodeToSharpCompat
 * fails with ENOSPC, EDQUOT, EACCES, EPERM, or EROFS, inline decode routes must
 * normalize the write error and surface 503 ("storage-full" or
 * "storage-not-writable") instead of answering 422/400 or falling back to
 * Sharp's native TIFF header read on DNG inputs.
 */

import {
  chmodSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
const realDecoders = vi.hoisted(() => ({
  decodeHeic: null as
    | typeof import("../../../apps/api/src/lib/heic-converter.js").decodeHeic
    | null,
  decodeToSharpCompat: null as
    | typeof import("../../../apps/api/src/lib/format-decoders.js").decodeToSharpCompat
    | null,
}));
const writeFileFailure = { next: null as Error | null };
const handleWriteFailure = { next: null as Error | null };
const handleCloseFailure = { next: null as Error | null };
const readFileFailure = { next: null as Error | null };
const infoExifPaths: string[] = [];
const infoExifOpenFlags: Array<number | string | undefined> = [];
const exiftoolPaths: string[] = [];
const exiftoolOpenFlags: Array<number | string | undefined> = [];
const decoderPaths: string[] = [];
const decoderOpenFlags: Array<number | string | undefined> = [];
const uploadedBuffers = new Map<string, Buffer>();

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (async (path: unknown, flags?: unknown, ...rest: unknown[]) => {
      if (
        /(?:info-exif|exif-inspect|exif-write|exif-dim|heic-in|psd-in|raw-in|dimensions)-/.test(
          String(path),
        )
      ) {
        if (/info-exif-/.test(String(path))) {
          infoExifPaths.push(String(path));
          infoExifOpenFlags.push(flags as number | string | undefined);
        } else if (/(?:exif-inspect|exif-write|exif-dim)-/.test(String(path))) {
          exiftoolPaths.push(String(path));
          exiftoolOpenFlags.push(flags as number | string | undefined);
        } else {
          decoderPaths.push(String(path));
          decoderOpenFlags.push(flags as number | string | undefined);
        }
        if (writeFileFailure.next) {
          const err = writeFileFailure.next;
          writeFileFailure.next = null;
          throw err;
        }
        const fh = await (
          actual.open as (
            ...args: unknown[]
          ) => Promise<typeof actual.open extends (...a: never[]) => Promise<infer R> ? R : never>
        )(path, flags, ...rest);
        if (handleWriteFailure.next) {
          const err = handleWriteFailure.next;
          handleWriteFailure.next = null;
          fh.writeFile = async () => {
            throw err;
          };
        }
        if (handleCloseFailure.next) {
          const closeErr = handleCloseFailure.next;
          handleCloseFailure.next = null;
          const origClose = fh.close.bind(fh);
          fh.close = async () => {
            await origClose().catch(() => {});
            throw closeErr;
          };
        }
        return fh;
      }
      return (actual.open as (...args: unknown[]) => unknown)(path, flags, ...rest);
    }) as typeof actual.open,
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
  realDecoders.decodeHeic = actual.decodeHeic;
  return {
    ...actual,
    decodeHeic: (...args: unknown[]) => decodeHeic(...args),
  };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  realDecoders.decodeToSharpCompat = actual.decodeToSharpCompat;
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
    handleWriteFailure.next = null;
    handleCloseFailure.next = null;
    readFileFailure.next = null;
    infoExifPaths.length = 0;
    infoExifOpenFlags.length = 0;
    exiftoolPaths.length = 0;
    exiftoolOpenFlags.length = 0;
    decoderPaths.length = 0;
    decoderOpenFlags.length = 0;
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
        expect(infoExifPaths[0]).toMatch(
          new RegExp(
            `info-exif-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\${expectedSuffix}$`,
          ),
        );
        expect(infoExifOpenFlags).toEqual([
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        ]);
      },
    );

    it.each([
      ["SIGKILL (kernel OOM killer)", "kill -9 $$\n"],
      [
        "libgomp thread creation failure",
        'printf "%s\\n" "libgomp: Thread creation failed: Resource temporarily unavailable" >&2\nexit 1\n',
      ],
      [
        "std::system_error thread abort (SIGABRT)",
        'printf "%s\\n" "terminate called after throwing an instance of \'std::system_error\'  what():  Resource temporarily unavailable" >&2\nkill -6 $$\n',
      ],
    ] as const)(
      "answers 503 ENGINE_UNAVAILABLE on DNG when exiftool fails in readExifToolMeta with %s (#3458)",
      async (_label, scriptBody) => {
        const originalPath = process.env.PATH;
        const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-oom-"));
        try {
          const shimPath = join(shimDir, "exiftool");
          writeFileSync(shimPath, `#!/bin/sh\n${scriptBody}`);
          chmodSync(shimPath, 0o755);
          process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

          const res = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
            ]),
          });

          expect(res.statusCode, res.body).toBe(503);
          expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(infoExifPaths).toHaveLength(1);
          expect(existsSync(infoExifPaths[0])).toBe(false);
        } finally {
          process.env.PATH = originalPath;
          rmSync(shimDir, { recursive: true, force: true });
        }
      },
    );

    it("writes distinct O_EXCL UUID temp files when two RAW uploads arrive in the same millisecond (#3458)", async () => {
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      const originalPath = process.env.PATH;
      const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-race-"));
      try {
        const shimPath = join(shimDir, "exiftool");
        writeFileSync(
          shimPath,
          '#!/bin/sh\nfor last; do :; done\nw=$(wc -c < "$last" | tr -d " ")\nprintf \'[{"FileType":"RAF","ImageWidth":%s,"ImageHeight":300}]\\n\' "$w"\n',
        );
        chmodSync(shimPath, 0o755);
        process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

        const rafA = Buffer.concat([
          Buffer.from("FUJIFILMCCD-RAW 0201", "ascii"),
          Buffer.alloc(100, 0x41),
        ]);
        const rafB = Buffer.concat([
          Buffer.from("FUJIFILMCCD-RAW 0201", "ascii"),
          Buffer.alloc(250, 0x42),
        ]);

        const [resA, resB] = await Promise.all([
          app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "a.raf", contentType: "application/octet-stream", content: rafA },
            ]),
          }),
          app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "b.raf", contentType: "application/octet-stream", content: rafB },
            ]),
          }),
        ]);

        expect(resA.statusCode, resA.body).toBe(200);
        expect(resB.statusCode, resB.body).toBe(200);
        expect(resA.json().width).toBe(rafA.length);
        expect(resB.json().width).toBe(rafB.length);
        expect(infoExifPaths).toHaveLength(2);
        expect(new Set(infoExifPaths).size).toBe(2);
        const expectedFlags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY;
        expect(infoExifOpenFlags).toEqual([expectedFlags, expectedFlags]);
        for (const p of infoExifPaths) {
          expect(existsSync(p)).toBe(false);
        }
      } finally {
        dateSpy.mockRestore();
        process.env.PATH = originalPath;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) and removes the created temp file when fh.writeFile fails after open in readExifToolMeta (#3458)",
      async (errno, expectedCode) => {
        handleWriteFailure.next = errnoError(errno, "write");
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
          ]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toMatchObject({ code: expectedCode });
        expect(infoExifPaths).toHaveLength(1);
        expect(existsSync(infoExifPaths[0])).toBe(false);
      },
    );

    it("preserves a primary fh.writeFile ENOSPC fault when fh.close also rejects, and surfaces 503 on V8 RangeError in readExifToolMeta (#3458)", async () => {
      handleWriteFailure.next = errnoError("ENOSPC", "write");
      handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
        code: "EIO",
        syscall: "close",
      });
      const closeRes = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        ...multipartBody([
          { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
        ]),
      });
      expect(closeRes.statusCode, closeRes.body).toBe(503);
      expect(closeRes.json()).toMatchObject({ code: "storage-full" });

      handleWriteFailure.next = new RangeError("Array buffer allocation failed");
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

    it("preserves a primary fh.writeFile ENOSPC fault when fh.close also rejects in decodeHeic and decodeToSharpCompat (#3649)", async () => {
      const originalPath = process.env.PATH;
      const shimDir = mkdtempSync(join(tmpdir(), "decoder-close-fault-"));
      try {
        for (const bin of ["heif-convert", "magick"]) {
          const shimPath = join(shimDir, bin);
          writeFileSync(
            shimPath,
            '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "1.0.0"; exit 0; fi\nexit 1\n',
          );
          chmodSync(shimPath, 0o755);
        }
        process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

        if (!realDecoders.decodeHeic || !realDecoders.decodeToSharpCompat) {
          throw new Error("realDecoders not initialized");
        }
        const actualDecodeHeic = realDecoders.decodeHeic;
        const actualDecodeToSharpCompat = realDecoders.decodeToSharpCompat;

        decodeHeic.mockImplementation((...args: Parameters<typeof actualDecodeHeic>) =>
          actualDecodeHeic(...args),
        );
        decodeToSharpCompat.mockImplementation(
          (...args: Parameters<typeof actualDecodeToSharpCompat>) =>
            actualDecodeToSharpCompat(...args),
        );

        handleWriteFailure.next = errnoError("ENOSPC", "write");
        handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
          code: "EIO",
          syscall: "close",
        });
        await expect(actualDecodeHeic(HEIC)).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          statusCode: 503,
          code: "storage-full",
        });

        handleWriteFailure.next = errnoError("ENOSPC", "write");
        handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
          code: "EIO",
          syscall: "close",
        });
        await expect(actualDecodeToSharpCompat(PSD, "psd", "psd")).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          statusCode: 503,
          code: "storage-full",
        });

        handleWriteFailure.next = errnoError("ENOSPC", "write");
        handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
          code: "EIO",
          syscall: "close",
        });
        const heicInfoRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([{ filename: "photo.heic", contentType: "image/heic", content: HEIC }]),
        });
        expect(heicInfoRes.statusCode, heicInfoRes.body).toBe(503);
        expect(heicInfoRes.json()).toMatchObject({ code: "storage-full" });

        handleWriteFailure.next = errnoError("ENOSPC", "write");
        handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
          code: "EIO",
          syscall: "close",
        });
        const psdInfoRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "layer.psd", contentType: "image/vnd.adobe.photoshop", content: PSD },
          ]),
        });
        expect(psdInfoRes.statusCode, psdInfoRes.body).toBe(503);
        expect(psdInfoRes.json()).toMatchObject({ code: "storage-full" });

        handleWriteFailure.next = errnoError("ENOSPC", "write");
        handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
          code: "EIO",
          syscall: "close",
        });
        const dngInfoRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
          ]),
        });
        expect(dngInfoRes.statusCode, dngInfoRes.body).toBe(503);
        expect(dngInfoRes.json()).toMatchObject({ code: "storage-full" });

        const expectedFlags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY;
        expect(decoderPaths).toHaveLength(5);
        expect(decoderOpenFlags).toEqual([
          expectedFlags,
          expectedFlags,
          expectedFlags,
          expectedFlags,
          expectedFlags,
        ]);
        for (const p of decoderPaths) {
          expect(existsSync(p)).toBe(false);
        }
      } finally {
        process.env.PATH = originalPath;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it.each([
      ["non-zero exit", "exit 1\n"],
      ["empty JSON array", "printf '[]\\n'\n"],
    ] as const)(
      "falls back to Sharp metadata on DNG when exiftool in readExifToolMeta ends with %s (#3458)",
      async (_label, scriptBody) => {
        const originalPath = process.env.PATH;
        const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-fallback-"));
        try {
          const shimPath = join(shimDir, "exiftool");
          writeFileSync(shimPath, `#!/bin/sh\n${scriptBody}`);
          chmodSync(shimPath, 0o755);
          process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

          const res = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
            ]),
          });

          expect(res.statusCode, res.body).toBe(200);
          expect(res.json()).toMatchObject({
            filename: "photo.dng",
            width: 200,
            height: 150,
          });
          expect(infoExifPaths).toHaveLength(1);
          expect(existsSync(infoExifPaths[0])).toBe(false);
        } finally {
          process.env.PATH = originalPath;
          rmSync(shimDir, { recursive: true, force: true });
        }
      },
    );

    it.each([
      ["missing dimensions", '[{"FileType":"DNG"}]', 200, 150],
      ["zero dimensions", '[{"FileType":"DNG","ImageWidth":0,"ImageHeight":0}]', 200, 150],
      [
        "negative and non-numeric dimensions",
        '[{"FileType":"DNG","ImageWidth":-10,"ImageHeight":"100x200"}]',
        200,
        150,
      ],
      [
        "Infinity and string-zero dimensions",
        '[{"FileType":"DNG","ImageWidth":1e309,"ImageHeight":"0"}]',
        200,
        150,
      ],
      [
        "valid ImageWidth with invalid ImageHeight",
        '[{"FileType":"DNG","ImageWidth":4032,"ImageHeight":-1}]',
        4032,
        150,
      ],
      [
        "invalid ImageWidth with valid ImageHeight",
        '[{"FileType":"DNG","ImageWidth":"bad","ImageHeight":3024}]',
        200,
        3024,
      ],
      ["1x1 boundary dimensions", '[{"FileType":"DNG","ImageWidth":1,"ImageHeight":1}]', 1, 1],
      [
        "valid positive finite dimensions",
        '[{"FileType":"DNG","ImageWidth":4032,"ImageHeight":3024}]',
        4032,
        3024,
      ],
      [
        "grouped invalid dimensions across Composite, EXIF, and File",
        '[{"File:FileType":"DNG","Composite:ImageWidth":0,"EXIF:ImageWidth":-1,"File:ImageHeight":"bad"}]',
        200,
        150,
      ],
      [
        "File:ImageWidth and File:ImageHeight fallback when Composite is zero",
        '[{"File:FileType":"DNG","Composite:ImageWidth":0,"File:ImageWidth":1920,"File:ImageHeight":1280}]',
        1920,
        1280,
      ],
    ] as const)(
      "falls back to Sharp dimensions when exiftool emits %s (#3600)",
      async (_label, jsonOutput, expectedWidth, expectedHeight) => {
        const originalPath = process.env.PATH;
        const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-shim-"));
        try {
          const shimPath = join(shimDir, "exiftool");
          writeFileSync(shimPath, `#!/bin/sh\nprintf '%s\\n' '${jsonOutput}'\n`);
          chmodSync(shimPath, 0o755);
          process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

          const res = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
            ]),
          });

          expect(res.statusCode, res.body).toBe(200);
          expect(res.json()).toMatchObject({
            filename: "photo.dng",
            format: "dng",
            width: expectedWidth,
            height: expectedHeight,
          });
        } finally {
          process.env.PATH = originalPath;
          rmSync(shimDir, { recursive: true, force: true });
        }
      },
    );

    it("passes -G to exiftool and detects EXIF tags without ExifVersion on RAW uploads (#3634)", async () => {
      const originalPath = process.env.PATH;
      const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-grouped-"));
      try {
        const shimPath = join(shimDir, "exiftool");
        writeFileSync(
          shimPath,
          [
            "#!/bin/sh",
            'has_g=0; for arg in "$@"; do if [ "$arg" = "-G" ]; then has_g=1; fi; done',
            'if [ "$has_g" = "1" ]; then',
            '  printf \'[{"File:FileType":"RAF","Composite:ImageWidth":0,"SubIFD:ImageWidth":6000,"File:ImageWidth":1920,"Composite:ImageHeight":4000,"File:ImageHeight":1280,"EXIF:BitsPerSample":14,"File:BitsPerSample":8,"EXIF:ColorSpace":"sRGB","EXIF:XResolution":300,"ICC_Profile:ICCProfileName":"Display P3","XMP:XMPToolkit":"Adobe XMP","EXIF:Make":"FUJIFILM","EXIF:Model":"X-T5"}]\\n\'',
            "else",
            '  printf \'[{"FileType":"RAF","ImageWidth":6000,"ImageHeight":4000,"BitsPerSample":14,"ColorSpace":"sRGB","XResolution":300,"ICCProfileName":"Display P3","XMPToolkit":"Adobe XMP","Make":"FUJIFILM","Model":"X-T5"}]\\n\'',
            "fi",
            "",
          ].join("\n"),
        );
        chmodSync(shimPath, 0o755);
        process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

        const rafBytes = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "shoot.raf", contentType: "application/octet-stream", content: rafBytes },
          ]),
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({
          filename: "shoot.raf",
          format: "raf",
          width: 6000,
          height: 4000,
          bitDepth: "14",
          colorSpace: "sRGB",
          density: 300,
          hasExif: true,
          hasIcc: true,
          hasXmp: true,
        });
      } finally {
        process.env.PATH = originalPath;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it("skips empty or zero grouped values in higher-priority groups and reports false flags when EXIF/ICC/XMP tags are absent (#3634)", async () => {
      const originalPath = process.env.PATH;
      const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-stripped-"));
      try {
        const shimPath = join(shimDir, "exiftool");
        writeFileSync(
          shimPath,
          [
            "#!/bin/sh",
            'printf \'[{"File:FileType":"RAF","RAF:ImageWidth":4896,"RAF:ImageHeight":3264,"Composite:ColorSpace":"","MakerNotes:ColorSpace":"Adobe RGB","Composite:BitsPerSample":0,"File:BitsPerSample":"12 12 12","Composite:XResolution":0,"File:XResolution":240}]\\n\'',
            "",
          ].join("\n"),
        );
        chmodSync(shimPath, 0o755);
        process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

        const rafBytes = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            {
              filename: "stripped.raf",
              contentType: "application/octet-stream",
              content: rafBytes,
            },
          ]),
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({
          filename: "stripped.raf",
          format: "raf",
          width: 4896,
          height: 3264,
          bitDepth: "12 12 12",
          colorSpace: "Adobe RGB",
          hasExif: false,
          hasIcc: false,
          hasXmp: false,
        });
      } finally {
        process.env.PATH = originalPath;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it("reads RAW metadata when exiftool -EXIF:all JSON exceeds 1 MiB default maxBuffer (#3634)", async () => {
      const originalPath = process.env.PATH;
      const shimDir = mkdtempSync(join(tmpdir(), "info-exiftool-large-"));
      try {
        const shimPath = join(shimDir, "exiftool");
        writeFileSync(
          shimPath,
          [
            "#!/bin/sh",
            'has_g=0; for arg in "$@"; do if [ "$arg" = "-G" ]; then has_g=1; fi; done',
            'if [ "$has_g" = "1" ]; then',
            '  pad=$(head -c 1500000 /dev/zero | tr "\\0" "A")',
            '  printf \'[{"File:FileType":"DNG","EXIF:ImageWidth":5472,"EXIF:ImageHeight":3648,"EXIF:BitsPerSample":16,"EXIF:ColorSpace":"Adobe RGB","EXIF:Make":"Canon","EXIF:Padding":"%s"}]\\n\' "$pad"',
            "else",
            '  printf \'[{"FileType":"DNG"}]\'',
            "fi",
            "",
          ].join("\n"),
        );
        chmodSync(shimPath, 0o755);
        process.env.PATH = `${shimDir}:${originalPath ?? ""}`;

        const res = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "large-exif.dng", contentType: "image/x-adobe-dng", content: DNG },
          ]),
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({
          filename: "large-exif.dng",
          format: "dng",
          width: 5472,
          height: 3648,
          bitDepth: "16",
          colorSpace: "Adobe RGB",
          hasExif: true,
        });
      } finally {
        process.env.PATH = originalPath;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it("surfaces 503 DecoderOutOfMemoryError when Sharp stats/metadata, the DNG fallback probe, or CLI/HEIC decode hits V8 buffer allocation OOM or SIGKILL (#3633)", async () => {
      const sharpMod = (await import("sharp")).default;
      const oomMessage =
        "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";

      // 1. sharp(metaBuffer).stats() rejects with V8 RangeError("Array buffer allocation failed") vs non-OOM RangeError
      const statsSpy = vi
        .spyOn(sharpMod.prototype, "stats")
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(new RangeError("Invalid stats parameter"));
      try {
        const statsOomRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
        });
        expect(statsOomRes.statusCode, statsOomRes.body).toBe(503);
        expect(statsOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        const statsNonOomRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
        });
        expect(statsNonOomRes.statusCode, statsNonOomRes.body).toBe(422);
        expect(statsNonOomRes.json()).toMatchObject({
          error: "Failed to read image metadata",
        });
      } finally {
        statsSpy.mockRestore();
      }

      // 2. sharp.prototype.metadata rejecting with V8 RangeError on call 1+ (validateImageBuffer + direct probe), call 2 (direct probe), or call 3 (final metadata read)
      for (const failOnCall of [1, 2, 3] as const) {
        const origMetadata = sharpMod.prototype.metadata;
        let callCount = 0;
        const metaSpy = vi.spyOn(sharpMod.prototype, "metadata").mockImplementation(function (
          this: InstanceType<typeof sharpMod>,
        ) {
          callCount += 1;
          if (failOnCall === 1 || callCount === failOnCall) {
            return Promise.reject(new RangeError("Array buffer allocation failed"));
          }
          return origMetadata.call(this);
        });
        decodeHeic.mockClear();
        decodeHeic.mockRejectedValueOnce(new DecoderUnavailableError("No HEIF decoder found."));
        try {
          const metaOomRes = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
          });
          expect(metaOomRes.statusCode, metaOomRes.body).toBe(503);
          expect(metaOomRes.json()).toEqual({
            error: oomMessage,
            code: "ENGINE_UNAVAILABLE",
          });
          expect(decodeHeic).not.toHaveBeenCalled();
        } finally {
          metaSpy.mockRestore();
          decodeHeic.mockReset().mockResolvedValue(PNG);
        }
      }

      // 3. DNG Sharp fallback probe rejecting with V8 RangeError surfaces DecoderOutOfMemoryError over DecoderUnavailableError or a plain decode Error
      for (const initialDecodeErr of [
        new DecoderUnavailableError("No dcraw_emu found."),
        new Error("corrupt dng"),
      ]) {
        decodeToSharpCompat.mockRejectedValueOnce(initialDecodeErr);
        const rawSpy = vi.spyOn(sharpMod.prototype, "raw").mockImplementationOnce(function (
          this: InstanceType<typeof sharpMod>,
        ) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
          } as unknown as InstanceType<typeof sharpMod>;
        });
        try {
          const dngProbeRes = await app.inject({
            method: "POST",
            url: apiToolPath("info"),
            ...multipartBody([
              { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
            ]),
          });
          expect(dngProbeRes.statusCode, dngProbeRes.body).toBe(503);
          expect(dngProbeRes.json()).toEqual({
            error: oomMessage,
            code: "ENGINE_UNAVAILABLE",
          });
        } finally {
          rawSpy.mockRestore();
        }
      }

      // 4. Raw SIGKILL and V8 RangeError at decodeToSharpCompat, decodeHeic, and speculative decodeHeic fallback
      for (const makeRawOom of [
        () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
        () => new RangeError("Array buffer allocation failed"),
      ]) {
        decodeToSharpCompat.mockRejectedValueOnce(makeRawOom());
        const dngRawOomRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG },
          ]),
        });
        expect(dngRawOomRes.statusCode, dngRawOomRes.body).toBe(503);
        expect(dngRawOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        decodeHeic.mockRejectedValueOnce(makeRawOom());
        const heicRawOomRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([{ filename: "photo.heic", contentType: "image/heic", content: HEIC }]),
        });
        expect(heicRawOomRes.statusCode, heicRawOomRes.body).toBe(503);
        expect(heicRawOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });

        decodeHeic.mockRejectedValueOnce(makeRawOom());
        const fallbackHeicOomRes = await app.inject({
          method: "POST",
          url: apiToolPath("info"),
          ...multipartBody([
            { filename: "mystery.jpg", contentType: "image/jpeg", content: UNREADABLE },
          ]),
        });
        expect(fallbackHeicOomRes.statusCode, fallbackHeicOomRes.body).toBe(503);
        expect(fallbackHeicOomRes.json()).toEqual({
          error: oomMessage,
          code: "ENGINE_UNAVAILABLE",
        });
      }
    });
  });

  describe("edit-metadata and edit-metadata/inspect exiftool tmpdir faults (#3548, #3630)", () => {
    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) on POST /api/v1/tools/image/edit-metadata/inspect when inspectMetadata fails opening or writing to tmpdir",
      async (errno, expectedCode) => {
        writeFileFailure.next = errnoError(errno);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/edit-metadata/inspect",
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
        });
        expect(res.statusCode, res.body).toBe(503);
        expect(res.json()).toMatchObject({ code: expectedCode });

        handleWriteFailure.next = errnoError(errno, "write");
        const handleRes = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/edit-metadata/inspect",
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
        });
        expect(handleRes.statusCode, handleRes.body).toBe(503);
        expect(handleRes.json()).toMatchObject({ code: expectedCode });
        const expectedFlags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY;
        expect(exiftoolOpenFlags).toEqual([expectedFlags, expectedFlags]);
        for (const p of exiftoolPaths) {
          expect(existsSync(p)).toBe(false);
        }
        exiftoolPaths.length = 0;
        exiftoolOpenFlags.length = 0;
      },
    );

    it.each(WRITE_ERRNOS)(
      "answers 503 %s (%s) on POST /api/v1/tools/image/edit-metadata when writeMetadata fails opening, writing, or reading tmpdir",
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

        handleWriteFailure.next = errnoError(errno, "write");
        const handleWriteRes = await app.inject({
          method: "POST",
          url: apiToolPath("edit-metadata"),
          ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }], {
            artist: "Ada",
          }),
        });
        expect(handleWriteRes.statusCode, handleWriteRes.body).toBe(503);
        expect(handleWriteRes.json()).toMatchObject({ code: expectedCode });

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
        const expectedFlags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY;
        expect(exiftoolOpenFlags).toEqual([expectedFlags, expectedFlags, expectedFlags]);
        for (const p of exiftoolPaths) {
          expect(existsSync(p)).toBe(false);
        }
        exiftoolPaths.length = 0;
        exiftoolOpenFlags.length = 0;
      },
    );

    it("preserves a primary fh.writeFile ENOSPC fault when fh.close also rejects on edit-metadata and edit-metadata/inspect (#3630)", async () => {
      handleWriteFailure.next = errnoError("ENOSPC", "write");
      handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
        code: "EIO",
        syscall: "close",
      });
      const inspectRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/edit-metadata/inspect",
        ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }]),
      });
      expect(inspectRes.statusCode, inspectRes.body).toBe(503);
      expect(inspectRes.json()).toMatchObject({ code: "storage-full" });

      handleWriteFailure.next = errnoError("ENOSPC", "write");
      handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
        code: "EIO",
        syscall: "close",
      });
      const editRes = await app.inject({
        method: "POST",
        url: apiToolPath("edit-metadata"),
        ...multipartBody([{ filename: "photo.png", contentType: "image/png", content: PNG }], {
          artist: "Ada",
        }),
      });
      expect(editRes.statusCode, editRes.body).toBe(503);
      expect(editRes.json()).toMatchObject({ code: "storage-full" });
    });

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
      "surfaces 503 %s (%s) from the edit-metadata registered process function when writeMetadata hits a tmpdir open, write, or read fault",
      async (errno, expectedCode) => {
        const cfg = getToolConfig("edit-metadata");
        expect(cfg).toBeDefined();

        writeFileFailure.next = errnoError(errno);
        await expect(cfg?.process(PNG, { artist: "Ada" }, "photo.png")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });

        handleWriteFailure.next = errnoError(errno, "write");
        await expect(cfg?.process(PNG, { artist: "Ada" }, "photo.png")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });

        readFileFailure.next = errnoError(errno, "read");
        await expect(cfg?.process(PNG, { artist: "Ada" }, "photo.png")).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
        const expectedFlags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY;
        expect(exiftoolOpenFlags).toEqual([expectedFlags, expectedFlags, expectedFlags]);
        for (const p of exiftoolPaths) {
          expect(existsSync(p)).toBe(false);
        }
        exiftoolPaths.length = 0;
        exiftoolOpenFlags.length = 0;
      },
    );
  });
});
