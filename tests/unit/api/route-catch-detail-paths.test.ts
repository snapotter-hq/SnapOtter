/**
 * #1464: Route catches that reply inline with `details: err.message` must pass
 * the message through `stripInternalPaths` so server temp/workspace paths never
 * reach the client, and log the raw error first when the catch didn't already
 * log it.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath, ToolInputError } from "@snapotter/shared";
import AdmZip from "adm-zip";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const deletePrefix = vi.fn();
const dbInsertValues = vi.fn();
const validateFetchUrlMock = vi.fn();

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => dbInsertValues(...args),
    }),
  },
  schema: {
    jobs: {},
  },
}));

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return {
    ...actual,
    requireToolAccess: vi.fn(async () => ({ id: "user-1", role: "admin" })),
    requirePermission: vi.fn(() => async () => ({ id: "user-1", role: "admin" })),
  };
});

vi.mock("../../../apps/api/src/lib/enterprise-feature.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/enterprise-feature.js")>();
  return {
    ...actual,
    isEnterpriseFeatureEnabled: vi.fn(async () => true),
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/lib/browser-service.js", () => ({
  isBrowserAvailable: () => true,
  captureHtml: async () => Buffer.from("png"),
  capturePage: async () => Buffer.from("png"),
}));

vi.mock("../../../apps/api/src/lib/ssrf.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/ssrf.js")>();
  return {
    ...actual,
    validateFetchUrl: (...args: unknown[]) => validateFetchUrlMock(...args),
  };
});

import * as exiftoolMod from "../../../apps/api/src/lib/exiftool.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import * as imageErrorMod from "../../../apps/api/src/lib/image-error.js";
import * as svgSanitize from "../../../apps/api/src/lib/svg-sanitize.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerSiemRoutes } from "../../../apps/api/src/routes/enterprise/siem.js";
import { registerWebhookRoutes } from "../../../apps/api/src/routes/enterprise/webhooks.js";
import { fileRoutes } from "../../../apps/api/src/routes/files.js";
import { registerBarcodeRead } from "../../../apps/api/src/routes/tools/barcode-read.js";
import { registerBulkRename } from "../../../apps/api/src/routes/tools/bulk-rename.js";
import { registerCollage } from "../../../apps/api/src/routes/tools/collage.js";
import { registerColorPalette } from "../../../apps/api/src/routes/tools/color-palette.js";
import { registerCompare } from "../../../apps/api/src/routes/tools/compare.js";
import { registerCompose } from "../../../apps/api/src/routes/tools/compose.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerFavicon } from "../../../apps/api/src/routes/tools/favicon.js";
import { registerFindDuplicates } from "../../../apps/api/src/routes/tools/find-duplicates.js";
import { registerHtmlToImage } from "../../../apps/api/src/routes/tools/html-to-image.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImageToBase64 } from "../../../apps/api/src/routes/tools/image-to-base64.js";
import { registerImageToPdf } from "../../../apps/api/src/routes/tools/image-to-pdf.js";
import { registerInfo } from "../../../apps/api/src/routes/tools/info.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerPdfToImage } from "../../../apps/api/src/routes/tools/pdf-to-image.js";
import { registerQrGenerate } from "../../../apps/api/src/routes/tools/qr-generate.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerStitch } from "../../../apps/api/src/routes/tools/stitch.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";
import { registerVectorize } from "../../../apps/api/src/routes/tools/vectorize.js";
import { registerWatermarkImage } from "../../../apps/api/src/routes/tools/watermark-image.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
);
const HEIC = readFixture(fixtures.image.base.heic200);
const ICO = readFixture(fixtures.image.formats("ico"));
const PDF = readFixture(fixtures.document.pdf2);

function multipartBody(
  files: { field?: string; name: string; type: string; data: Buffer }[],
  settings?: Record<string, unknown> | string,
) {
  const boundary = "----unit1464";
  const chunks: Buffer[] = [];
  for (const f of files) {
    const fieldName = f.field ?? "file";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.data,
      Buffer.from("\r\n"),
    );
  }
  if (settings !== undefined) {
    const raw = typeof settings === "string" ? settings : JSON.stringify(settings);
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${raw}\r\n`,
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function buildLoggedApp(register: (app: ReturnType<typeof Fastify>) => void | Promise<void>) {
  const logLines: string[] = [];
  const app = Fastify({
    logger: { level: "warn", stream: { write: (line: string) => void logLines.push(line) } },
  });
  await app.register(multipart);
  registerErrorHandler(app);
  await register(app);
  await app.ready();
  return { app, logLines };
}

describe("route catches strip internal paths from details and log raw errors (#1464)", () => {
  const sampleTempPath = join(tmpdir(), "snapotter-scratch", "work-1464.tmp");
  let png: Buffer;

  beforeEach(async () => {
    png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset();
    deletePrefix.mockReset().mockResolvedValue(undefined);
    dbInsertValues.mockReset().mockResolvedValue(undefined);
    validateFetchUrlMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "compare",
      register: registerCompare,
      url: "/api/v1/tools/image/compare",
      files: () => [
        { name: "a.png", type: "image/png", data: png },
        { name: "b.png", type: "image/png", data: png },
      ],
      settings: undefined,
      expectedError: "Comparison failed",
    },
    {
      name: "compose",
      register: registerCompose,
      url: "/api/v1/tools/image/compose",
      files: () => [
        { field: "file", name: "base.png", type: "image/png", data: png },
        { field: "overlay", name: "over.png", type: "image/png", data: png },
      ],
      settings: undefined,
      expectedError: "Processing failed",
    },
    {
      name: "watermark-image",
      register: registerWatermarkImage,
      url: "/api/v1/tools/image/watermark-image",
      files: () => [
        { field: "file", name: "main.png", type: "image/png", data: png },
        { field: "watermark", name: "wm.png", type: "image/png", data: png },
      ],
      settings: undefined,
      expectedError: "Processing failed",
    },
    {
      name: "vectorize",
      register: registerVectorize,
      url: "/api/v1/tools/image/vectorize",
      files: () => [{ name: "a.png", type: "image/png", data: png }],
      settings: undefined,
      expectedError: "Vectorization failed",
    },
    {
      name: "svg-to-raster",
      register: registerSvgToRaster,
      url: apiToolPath("svg-to-raster"),
      files: () => [{ name: "a.svg", type: "image/svg+xml", data: SVG }],
      settings: undefined,
      expectedError: "SVG conversion failed",
    },
    {
      name: "image-to-pdf outer catch",
      register: registerImageToPdf,
      url: apiToolPath("image-to-pdf"),
      files: () => [{ name: "a.png", type: "image/png", data: png }],
      settings: undefined,
      expectedError: "PDF creation failed",
    },
    {
      name: "pdf-to-image outer catch",
      register: registerPdfToImage,
      url: apiToolPath("pdf-to-image"),
      files: () => [{ name: "a.pdf", type: "application/pdf", data: PDF }],
      settings: undefined,
      expectedError: "PDF conversion failed",
    },
  ])("$name masks server paths in 422 details and logs the error", async (c) => {
    putObject.mockRejectedValueOnce(new Error(`write failed at ${sampleTempPath} and /data/out`));
    const { app, logLines } = await buildLoggedApp(c.register);
    try {
      const res = await app.inject({
        method: "POST",
        url: c.url,
        ...multipartBody(c.files(), c.settings),
      });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.body).not.toContain(tmpdir());
      expect(res.body).not.toContain("/data/out");
      expect(res.json()).toEqual({
        error: c.expectedError,
        details: "write failed at [internal] and [internal]",
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("color-palette masks server paths in 422 outer catch and 400 settings catch and logs 422", async () => {
    const rawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw new Error(`vips raw failed at ${sampleTempPath}`);
        },
      } as unknown as sharp.Sharp;
    });
    const { app, logLines } = await buildLoggedApp(registerColorPalette);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("color-palette"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json()).toEqual({
        error: "Color extraction failed",
        details: "vips raw failed at [internal]",
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);

      const parseSpy = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
        throw new SyntaxError(`bad JSON in ${sampleTempPath}`);
      });
      try {
        const badSettingsRes = await app.inject({
          method: "POST",
          url: apiToolPath("color-palette"),
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }], "{}"),
        });
        expect(badSettingsRes.statusCode).toBe(400);
        expect(badSettingsRes.json()).toEqual({
          error: "Invalid settings",
          details: "bad JSON in [internal]",
        });
      } finally {
        parseSpy.mockRestore();
      }
    } finally {
      rawSpy.mockRestore();
      await app.close();
    }
  });

  it("find-duplicates masks server paths in 422 outer catch and logs the error", async () => {
    const classifySpy = vi
      .spyOn(imageErrorMod, "asInputErrorIfUndecodable")
      .mockRejectedValueOnce(new Error(`hash probe failed at ${sampleTempPath}`));
    const rawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw new Error("hash step failed");
        },
      } as unknown as sharp.Sharp;
    });
    const { app, logLines } = await buildLoggedApp(registerFindDuplicates);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/find-duplicates",
        ...multipartBody([
          { name: "a.png", type: "image/png", data: png },
          { name: "b.png", type: "image/png", data: png },
        ]),
      });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json()).toEqual({
        error: "Duplicate detection failed",
        details: "hash probe failed at [internal]",
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
    } finally {
      rawSpy.mockRestore();
      classifySpy.mockRestore();
      await app.close();
    }
  });

  it("favicon and bulk-rename mask server paths in 422 details and log when failing before headers are sent", async () => {
    for (const route of [
      {
        name: "favicon",
        register: registerFavicon,
        url: "/api/v1/tools/image/favicon",
        expectedError: "Favicon generation failed",
      },
      {
        name: "bulk-rename",
        register: registerBulkRename,
        url: "/api/v1/tools/image/bulk-rename",
        expectedError: "Rename failed",
      },
    ]) {
      const { app, logLines } = await buildLoggedApp((instance) => {
        instance.addHook("preHandler", async (_req: FastifyRequest, reply: FastifyReply) => {
          reply.hijack = () => {
            throw new Error(`stream hijack failed at ${sampleTempPath}`);
          };
        });
        route.register(instance);
      });
      try {
        const res = await app.inject({
          method: "POST",
          url: route.url,
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(res.statusCode, `${route.name}: ${res.body}`).toBe(422);
        expect(res.json()).toEqual({
          error: route.expectedError,
          details: "stream hijack failed at [internal]",
        });
        expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
      } finally {
        await app.close();
      }
    }
  });

  it("qr-generate and passport-photo generate mask server paths in 422 details and log the error", async () => {
    const bgRemoved = await sharp({
      create: { width: 200, height: 200, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    getObjectBuffer.mockResolvedValue(bgRemoved);

    const { app, logLines } = await buildLoggedApp((instance) => {
      registerQrGenerate(instance);
      registerPassportPhoto(instance);
    });
    try {
      putObject.mockRejectedValueOnce(new Error(`qr write failed at ${sampleTempPath}`));
      const qrRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload: { text: "hello" },
      });
      expect(qrRes.statusCode, qrRes.body).toBe(422);
      expect(qrRes.json()).toEqual({
        error: "QR code generation failed",
        details: "qr write failed at [internal]",
      });
      expect(logLines.some((l) => l.includes("qr write failed"))).toBe(true);

      putObject.mockRejectedValueOnce(new Error(`passport write failed at ${sampleTempPath}`));
      const passRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/passport-photo/generate",
        payload: {
          jobId: "job",
          filename: "face.png",
          countryCode: "US",
          landmarks: {
            leftEye: { x: 0.42, y: 0.45 },
            rightEye: { x: 0.58, y: 0.45 },
            eyeCenter: { x: 0.5, y: 0.45 },
            chin: { x: 0.5, y: 0.7 },
            forehead: { x: 0.5, y: 0.32 },
            crown: { x: 0.5, y: 0.25 },
            nose: { x: 0.5, y: 0.55 },
            faceCenterX: 0.5,
          },
          imageWidth: 200,
          imageHeight: 200,
        },
      });
      expect(passRes.statusCode, passRes.body).toBe(422);
      expect(passRes.json()).toEqual({
        error: "Passport photo generation failed",
        details: "passport write failed at [internal]",
      });
      expect(logLines.some((l) => l.includes("passport write failed"))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("image-to-pdf HEIC and CLI decode catches mask server paths in 422 details and log the error", async () => {
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error(`Command failed: heif-convert ${sampleTempPath}`));
    const cliSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new Error(`Command failed: magick ${sampleTempPath}`));
    const origMeta = sharp.prototype.metadata;
    let icoMetaCalls = 0;
    const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(function (
      this: sharp.Sharp,
    ) {
      icoMetaCalls += 1;
      if (icoMetaCalls >= 1) {
        return Promise.reject(new Error(`vips probe failed at ${sampleTempPath}`));
      }
      return origMeta.call(this);
    });

    const { app, logLines } = await buildLoggedApp(registerImageToPdf);
    try {
      const heicRes = await app.inject({
        method: "POST",
        url: apiToolPath("image-to-pdf"),
        ...multipartBody([{ name: "photo.heic", type: "image/heic", data: HEIC }]),
      });
      expect(heicRes.statusCode, heicRes.body).toBe(422);
      expect(heicRes.json()).toEqual({
        error: 'Failed to decode HEIC file "photo.heic"',
        details: "Command failed: heif-convert [internal]",
      });
      expect(logLines.some((l) => l.includes("heif-convert"))).toBe(true);

      const icoRes = await app.inject({
        method: "POST",
        url: apiToolPath("image-to-pdf"),
        ...multipartBody([{ name: "icon.ico", type: "image/x-icon", data: ICO }]),
      });
      expect(icoRes.statusCode, icoRes.body).toBe(422);
      expect(icoRes.json()).toEqual({
        error: 'Failed to decode ICO file "icon.ico"',
        details: "Command failed: magick [internal]",
      });
      expect(logLines.some((l) => l.includes("Command failed: magick"))).toBe(true);
    } finally {
      metaSpy.mockRestore();
      cliSpy.mockRestore();
      heicSpy.mockRestore();
      await app.close();
    }
  });

  it("routes that retry a failed CLI decode with Sharp report the decoder's stripped error and log it (#1465)", async () => {
    const cliSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValue(
        new Error(`magick: improper image header \`${sampleTempPath}' @ error/icon.c`),
      );
    const corruptIco = Buffer.concat([ICO.subarray(0, 22), Buffer.alloc(2048, 0x5a)]);

    const cases: {
      name: string;
      register: (app: ReturnType<typeof Fastify>) => void | Promise<void>;
      url: string;
      files: () => { field?: string; name: string; type: string; data: Buffer }[];
      settings?: Record<string, unknown>;
    }[] = [
      {
        name: "collage",
        register: registerCollage,
        url: "/api/v1/tools/image/collage",
        files: () => [
          { field: "f1", name: "broken.ico", type: "image/x-icon", data: corruptIco },
          { field: "f2", name: "b.png", type: "image/png", data: png },
        ],
        settings: { templateId: "2-h-equal" },
      },
      {
        name: "stitch",
        register: registerStitch,
        url: "/api/v1/tools/image/stitch",
        files: () => [
          { field: "file1", name: "broken.ico", type: "image/x-icon", data: corruptIco },
          { field: "file2", name: "b.png", type: "image/png", data: png },
        ],
        settings: { direction: "horizontal", resizeMode: "fit" },
      },
      {
        name: "split",
        register: registerSplit,
        url: "/api/v1/tools/image/split",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
        settings: { columns: 2, rows: 2 },
      },
      {
        name: "color-palette",
        register: registerColorPalette,
        url: "/api/v1/tools/image/color-palette",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
      },
      {
        name: "barcode-read",
        register: registerBarcodeRead,
        url: "/api/v1/tools/image/barcode-read",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
      },
      {
        name: "meme-generator",
        register: registerMemeGenerator,
        url: "/api/v1/tools/image/meme-generator",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
        settings: { textLayout: "top-bottom", textBoxes: [{ id: "top", text: "HI" }] },
      },
      {
        name: "image-enhancement analyze",
        register: registerImageEnhancement,
        url: "/api/v1/tools/image/image-enhancement/analyze",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
        settings: {},
      },
      {
        name: "optimize-for-web preview",
        register: registerOptimizeForWeb,
        url: "/api/v1/tools/image/optimize-for-web/preview",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
        settings: { format: "webp", quality: 60 },
      },
      {
        name: "image-to-pdf",
        register: registerImageToPdf,
        url: apiToolPath("image-to-pdf"),
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
      },
      {
        name: "file-preview",
        register: fileRoutes,
        url: "/api/v1/preview",
        files: () => [{ name: "broken.ico", type: "image/x-icon", data: corruptIco }],
      },
    ];

    try {
      for (const c of cases) {
        const { app, logLines } = await buildLoggedApp(c.register);
        try {
          const res = await app.inject({
            method: "POST",
            url: c.url,
            ...multipartBody(c.files(), c.settings),
          });
          expect(res.statusCode, `${c.name}: ${res.body}`).toBe(422);
          expect(res.body, c.name).not.toContain(tmpdir());
          expect(res.json().details, c.name).toBe(
            "magick: improper image header `[internal]' @ error/icon.c",
          );
          expect(
            logLines.some((l) => l.includes(sampleTempPath) && l.includes("improper image header")),
            `${c.name} should log the unstripped decoder error`,
          ).toBe(true);
        } finally {
          await app.close();
        }
      }
    } finally {
      cliSpy.mockRestore();
    }
  });

  it("collage, edit-metadata, strip-metadata, and svg-to-raster batch mask server paths in 422 details and log", async () => {
    const jxlSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockRejectedValueOnce(new ToolInputError(`cjxl rejected ${sampleTempPath}`))
      .mockRejectedValueOnce(new Error(`cjxl batch failed on ${sampleTempPath}`));
    const inspectSpy = vi
      .spyOn(exiftoolMod, "inspectMetadata")
      .mockRejectedValueOnce(new Error(`exiftool inspect failed on ${sampleTempPath}`));
    const writeSpy = vi
      .spyOn(exiftoolMod, "writeMetadata")
      .mockRejectedValueOnce(new Error(`exiftool write failed on ${sampleTempPath}`));

    const { app, logLines } = await buildLoggedApp((instance) => {
      registerCollage(instance);
      registerEditMetadata(instance);
      registerStripMetadata(instance);
      registerSvgToRaster(instance);
    });

    try {
      const collageRes = await app.inject({
        method: "POST",
        url: apiToolPath("collage"),
        ...multipartBody(
          [
            { name: "a.png", type: "image/png", data: png },
            { name: "b.png", type: "image/png", data: png },
          ],
          { templateId: "2-h-equal", outputFormat: "jxl" },
        ),
      });
      expect(collageRes.statusCode, collageRes.body).toBe(422);
      expect(collageRes.json()).toEqual({
        error: "Collage creation failed",
        details: "cjxl rejected [internal]",
      });
      expect(logLines.some((l) => l.includes("cjxl rejected"))).toBe(true);

      const svgBatchRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("svg-to-raster")}/batch`,
        ...multipartBody([{ name: "a.svg", type: "image/svg+xml", data: SVG }], {
          outputFormat: "jxl",
        }),
      });
      expect(svgBatchRes.statusCode, svgBatchRes.body).toBe(422);
      expect(svgBatchRes.body).not.toContain(tmpdir());
      expect(svgBatchRes.json()).toEqual({
        error: "All files failed processing",
        errors: [{ filename: "a.svg", error: "cjxl batch failed on [internal]" }],
      });
      expect(logLines.some((l) => l.includes("cjxl batch failed"))).toBe(true);

      const editInspectRes = await app.inject({
        method: "POST",
        url: `${apiToolPath("edit-metadata")}/inspect`,
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });
      expect(editInspectRes.statusCode, editInspectRes.body).toBe(422);
      expect(editInspectRes.json()).toEqual({
        error: "Failed to read image metadata",
        details: "exiftool inspect failed on [internal]",
      });
      expect(logLines.some((l) => l.includes("exiftool inspect failed"))).toBe(true);

      const editRes = await app.inject({
        method: "POST",
        url: apiToolPath("edit-metadata"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }], { artist: "Test" }),
      });
      expect(editRes.statusCode, editRes.body).toBe(422);
      expect(editRes.json()).toEqual({
        error: "Metadata edit failed",
        details: "exiftool write failed on [internal]",
      });
      expect(logLines.some((l) => l.includes("exiftool write failed"))).toBe(true);

      const origMeta = sharp.prototype.metadata;
      const metaSpy = vi
        .spyOn(sharp.prototype, "metadata")
        .mockRejectedValueOnce(new Error(`strip metadata failed on ${sampleTempPath}`))
        .mockResolvedValueOnce({ format: "svg" } as sharp.Metadata)
        .mockRejectedValueOnce(new Error(`strip outer failed on ${sampleTempPath}`));
      try {
        const stripRes1 = await app.inject({
          method: "POST",
          url: `${apiToolPath("strip-metadata")}/inspect`,
          ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
        });
        expect(stripRes1.statusCode, stripRes1.body).toBe(422);
        expect(stripRes1.json()).toEqual({
          error: "Failed to read image metadata",
          details: "strip metadata failed on [internal]",
        });
        expect(logLines.some((l) => l.includes("strip metadata failed"))).toBe(true);

        // Disguised SVG exercises the second metadata() call inside the outer try block
        const disguisedSvg = Buffer.concat([Buffer.from("/* comment */"), SVG]);
        const stripRes2 = await app.inject({
          method: "POST",
          url: `${apiToolPath("strip-metadata")}/inspect`,
          ...multipartBody([{ name: "a.png", type: "image/png", data: disguisedSvg }]),
        });
        expect(stripRes2.statusCode, stripRes2.body).toBe(422);
        expect(stripRes2.json()).toEqual({
          error: "Failed to read image metadata",
          details: "strip outer failed on [internal]",
        });
        expect(logLines.some((l) => l.includes("strip outer failed"))).toBe(true);
      } finally {
        metaSpy.mockRestore();
        void origMeta;
      }
    } finally {
      jxlSpy.mockRestore();
      inspectSpy.mockRestore();
      writeSpy.mockRestore();
      await app.close();
    }
  });

  it("html-to-image, webhooks, and siem mask server paths in 400 URL validation details", async () => {
    validateFetchUrlMock.mockRejectedValue(new Error(`DNS lookup failed via ${sampleTempPath}`));
    const { app, logLines } = await buildLoggedApp(async (instance) => {
      registerHtmlToImage(instance);
      await registerWebhookRoutes(instance);
      await registerSiemRoutes(instance);
    });
    try {
      const htmlRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/html-to-image",
        payload: { url: "https://example.com" },
      });
      expect(htmlRes.statusCode, htmlRes.body).toBe(400);
      expect(htmlRes.json()).toEqual({
        error: "URL is not allowed",
        details: "DNS lookup failed via [internal]",
      });

      const webhookRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        payload: {
          name: "Hook",
          type: "alerts",
          url: "https://example.com/hook",
        },
      });
      expect(webhookRes.statusCode, webhookRes.body).toBe(400);
      expect(webhookRes.json()).toEqual({
        error: "Webhook URL must resolve to a public HTTP(S) destination",
        details: "DNS lookup failed via [internal]",
      });

      const siemRes = await app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/siem/config",
        payload: {
          enabled: true,
          webhookUrl: "https://example.com/siem",
        },
      });
      expect(siemRes.statusCode, siemRes.body).toBe(400);
      expect(siemRes.json()).toEqual({
        error: "SIEM webhook URL must resolve to a public HTTP(S) destination",
        details: "DNS lookup failed via [internal]",
      });

      putObject.mockRejectedValueOnce(new Error(`capture write failed at ${sampleTempPath}`));
      const htmlCaptureRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/html-to-image",
        payload: { html: "<p>hi</p>" },
      });
      expect(htmlCaptureRes.statusCode, htmlCaptureRes.body).toBe(422);
      expect(htmlCaptureRes.json()).toEqual({
        error: "Screenshot capture failed",
        details: "capture write failed at [internal]",
      });
      expect(logLines.some((l) => l.includes("capture write failed"))).toBe(true);
    } finally {
      await app.close();
    }
  });
});

/**
 * #4049: favicon reports per-file decode failures through `skippedFiles`, which
 * reaches the client three ways: the 400 `error`, the 400 `skipped` array, and
 * `skipped-files.txt` in the ZIP. Each one carried the decoder's raw message,
 * whose heif-convert command line names server temp files.
 */
describe("favicon skipped-file reasons strip internal paths (#4049)", () => {
  const sampleTempPath = join(tmpdir(), "snapotter-scratch", "heic-4049.heic");
  const decoderFailure = `Command failed: heif-convert ${sampleTempPath} /tmp/heic-out-4049.png`;
  let png: Buffer;

  beforeEach(async () => {
    png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
  });

  it("masks the sole reason in the 400 error and logs the raw decode error", async () => {
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error(decoderFailure));
    const { app, logLines } = await buildLoggedApp(registerFavicon);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("favicon"),
        ...multipartBody([{ name: "broken.heic", type: "image/heic", data: HEIC }]),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.body).not.toContain(tmpdir());
      expect(res.body).not.toContain("/tmp/");
      expect(res.json()).toEqual({
        error: 'Invalid file "broken.heic": Command failed: heif-convert [internal] [internal]',
      });
      // The raw error is still recorded for operators.
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
      expect(logLines.some((l) => l.includes("Favicon input decode failed"))).toBe(true);
    } finally {
      heicSpy.mockRestore();
      await app.close();
    }
  });

  it("masks every reason in the 400 skipped array when all files fail", async () => {
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error(decoderFailure))
      .mockRejectedValueOnce(new Error(`Command failed: heif-convert ${sampleTempPath}`));
    const { app } = await buildLoggedApp(registerFavicon);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("favicon"),
        ...multipartBody([
          { name: "a.heic", type: "image/heic", data: HEIC },
          { name: "b.heic", type: "image/heic", data: HEIC },
        ]),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.body).not.toContain(tmpdir());
      expect(res.body).not.toContain("/tmp/");
      const { error, skipped } = res.json();
      expect(error).toBe("No images could be decoded");
      expect(skipped).toHaveLength(2);
      for (const entry of skipped) {
        expect(entry.reason).toContain("[internal]");
        expect(entry.reason).not.toContain(tmpdir());
      }
    } finally {
      heicSpy.mockRestore();
      await app.close();
    }
  });

  it("masks the reason written to skipped-files.txt in the ZIP", async () => {
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error(decoderFailure));
    const { app } = await buildLoggedApp(registerFavicon);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("favicon"),
        ...multipartBody(
          [
            { name: "ok.png", type: "image/png", data: png },
            { name: "broken.heic", type: "image/heic", data: HEIC },
          ],
          { padding: 0, radius: 0, themeColor: "#ffffff" },
        ),
      });
      expect(res.statusCode, res.body).toBe(200);
      const zip = new AdmZip(res.rawPayload);
      const entry = zip.getEntry("skipped-files.txt");
      expect(entry, "skipped-files.txt is missing from the ZIP").toBeTruthy();
      const text = entry?.getData().toString("utf8") ?? "";
      expect(text).toContain("broken.heic");
      expect(text).toContain("[internal]");
      expect(text).not.toContain(tmpdir());
      expect(text).not.toContain("/tmp/");
    } finally {
      heicSpy.mockRestore();
      await app.close();
    }
  });

  it("masks a client SVG rejection that names a temp path", async () => {
    const svgSpy = vi.spyOn(svgSanitize, "sanitizeSvg").mockImplementationOnce(() => {
      throw Object.assign(new Error(`SVG sanitize rejected at ${sampleTempPath}`), {
        statusCode: 400,
      });
    });
    const { app, logLines } = await buildLoggedApp(registerFavicon);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("favicon"),
        ...multipartBody([{ name: "broken.svg", type: "image/svg+xml", data: SVG }]),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.body).not.toContain(tmpdir());
      expect(res.json()).toEqual({
        error: 'Invalid file "broken.svg": SVG sanitize rejected at [internal]',
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
      expect(logLines.some((l) => l.includes("Favicon SVG sanitize failed"))).toBe(true);
    } finally {
      svgSpy.mockRestore();
      await app.close();
    }
  });

  it("masks an auto-orient/stats failure that names a temp path", async () => {
    const statsSpy = vi
      .spyOn(sharp.prototype, "stats")
      .mockRejectedValueOnce(new Error(`vips stats failed at ${sampleTempPath}`));
    const { app, logLines } = await buildLoggedApp(registerFavicon);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("favicon"),
        ...multipartBody([{ name: "ok.png", type: "image/png", data: png }]),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.body).not.toContain(tmpdir());
      expect(res.json()).toEqual({
        error: 'Invalid file "ok.png": vips stats failed at [internal]',
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
      expect(logLines.some((l) => l.includes("Favicon input decode failed"))).toBe(true);
    } finally {
      statsSpy.mockRestore();
      await app.close();
    }
  });

  it("info, image-to-base64, and favicon report the CLI decoder's error when the Sharp probe also fails, and log it (#4066)", async () => {
    const cliSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValue(
        new Error(`magick: improper image header \`${sampleTempPath}' @ error/icon.c`),
      );
    const corruptIco = Buffer.concat([ICO.subarray(0, 22), Buffer.alloc(2048, 0x5a)]);

    const { app, logLines } = await buildLoggedApp((instance) => {
      registerInfo(instance);
      registerImageToBase64(instance);
      registerFavicon(instance);
    });
    try {
      for (const url of [
        "/api/v1/tools/image/info",
        "/api/v1/tools/image/image-to-base64",
        "/api/v1/tools/image/favicon",
      ]) {
        const res = await app.inject({
          method: "POST",
          url,
          ...multipartBody([{ name: "broken.ico", type: "image/x-icon", data: corruptIco }]),
        });
        expect(res.body, url).not.toContain(tmpdir());
        expect(res.body, url).not.toContain("unsupported image format");
        expect(res.body, url).toContain("improper image header");
      }
      expect(
        logLines.some((l) => l.includes(sampleTempPath) && l.includes("improper image header")),
        "the unstripped decoder error should be logged",
      ).toBe(true);
    } finally {
      cliSpy.mockRestore();
      await app.close();
    }
  });

  it("file preview answers a HEIC decoder failure with stripped details and logs the raw error (#4066)", async () => {
    const heicSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error(`Command failed: heif-convert ${sampleTempPath}`));

    const { app, logLines } = await buildLoggedApp(fileRoutes);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/preview",
        ...multipartBody([{ name: "photo.heic", type: "image/heic", data: HEIC }]),
      });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json()).toEqual({
        error: "Failed to decode HEIC/HEIF file",
        details: "Command failed: heif-convert [internal]",
      });
      expect(logLines.some((l) => l.includes(sampleTempPath))).toBe(true);
    } finally {
      heicSpy.mockRestore();
      await app.close();
    }
  });
});
