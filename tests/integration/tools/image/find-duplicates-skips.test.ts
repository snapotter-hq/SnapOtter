/**
 * find-duplicates skip paths before the hash step (#1493): each decode or
 * sanitize failure that skips a file has to leave a server-side warn with the
 * underlying error, and a missing decoder is the operator's problem, so it
 * answers 503 ENGINE_UNAVAILABLE for the request instead of a per-file skip.
 * The hash-step catch (#1492) tells a corrupt upload from a real fault; the
 * fault case here stubs the classifier to say "not input".
 *
 * The decoder failures are injected through the real modules' exports, so the
 * cases don't depend on which decoders a host has installed.
 */

import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const decoderMocks = vi.hoisted(() => ({
  heic: null as Error | null,
  cli: null as Error | null,
  // When set, the hash-step classifier says "not input" so the route's
  // real-fault branch runs against a buffer it would otherwise call corrupt.
  hashIsNotInput: false,
  reportError: vi.fn(),
}));

vi.mock("../../../../apps/api/src/lib/image-error.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/image-error.js")>();
  return {
    ...actual,
    asInputErrorIfUndecodable: async (
      ...args: Parameters<typeof actual.asInputErrorIfUndecodable>
    ) => {
      if (decoderMocks.hashIsNotInput) {
        const err = args[1];
        return err instanceof Error ? err : new Error(String(err));
      }
      return actual.asInputErrorIfUndecodable(...args);
    },
  };
});

vi.mock("../../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError: decoderMocks.reportError };
});

vi.mock("../../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: async (...args: Parameters<typeof actual.decodeHeic>) => {
      if (decoderMocks.heic) throw decoderMocks.heic;
      return actual.decodeHeic(...args);
    },
  };
});

vi.mock("../../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: async (...args: Parameters<typeof actual.decodeToSharpCompat>) => {
      if (decoderMocks.cli) throw decoderMocks.cli;
      return actual.decodeToSharpCompat(...args);
    },
  };
});

import { validateImageBuffer } from "../../../../apps/api/src/lib/file-validation.js";
import { DecoderUnavailableError } from "../../../../apps/api/src/lib/format-decoders.js";
import { logger } from "../../../../apps/api/src/lib/logger.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const HEIC = readFixture(fixtures.image.base.heic200);
// A DNG is a TIFF container. Validation routes it to the CLI decoder as "raw",
// and when that decoder is missing the route falls back to Sharp's TIFF read.
const DNG = readFixture(fixtures.image.formats("dng"));
// A Photoshop signature and version, then garbage: validation passes it as a
// CLI-decoded format without a Sharp read, so it reaches decodeToSharpCompat,
// and Sharp's own fallback read then fails too.
const FAKE_PSD = Buffer.concat([
  Buffer.from("8BPS"),
  Buffer.from([0, 1, 0, 0, 0, 0, 0, 0]), // version 1, six reserved zero bytes
  Buffer.alloc(64, 7),
]);
// gzip magic plus garbage: validation passes .svgz by extension, decompress throws.
const FAKE_SVGZ = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(32, 9)]);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  // Sharp must not be able to read the fake PSD; the CLI cases rely on the
  // nested fallback failing too.
  await expect(sharp(FAKE_PSD).metadata()).rejects.toThrow();
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

afterEach(() => {
  decoderMocks.heic = null;
  decoderMocks.cli = null;
  decoderMocks.hashIsNotInput = false;
  decoderMocks.reportError.mockClear();
});

/** An orientation-6 JPEG cut in half: validation passes, every decode fails. */
async function truncatedJpeg(): Promise<Buffer> {
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc(width * height * 3);
  let seed = 4242;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (seed >> 16) & 0xff;
  }
  const full = await sharp(raw, { raw: { width, height, channels: 3 } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  return full.subarray(0, Math.floor(full.length / 2));
}

async function post(files: Array<{ filename: string; contentType: string; content: Buffer }>) {
  const { body, contentType } = createMultipartPayload(files.map((f) => ({ name: "file", ...f })));
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/find-duplicates",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

function withGoodPair(extra: { filename: string; contentType: string; content: Buffer }) {
  return [
    { filename: "good1.png", contentType: "image/png", content: PNG },
    { filename: "good2.png", contentType: "image/png", content: PNG },
    extra,
  ];
}

function findDuplicatesWarns(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.filter(
    (call) => typeof call[1] === "string" && String(call[1]).startsWith("find-duplicates:"),
  );
}

describe("find-duplicates skip paths (#1493)", () => {
  it("skips a HEIC the decoder rejects, and logs the decoder's error", async () => {
    decoderMocks.heic = new Error("injected heif-dec failure");
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      const res = await post(
        withGoodPair({ filename: "shot.heic", contentType: "image/heic", content: HEIC }),
      );

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.skippedFiles).toEqual([
        { filename: "shot.heic", reason: "Failed to decode HEIC" },
      ]);
      expect(result.duplicateGroups).toHaveLength(1);

      const lines = findDuplicatesWarns(warnSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toMatchObject({
        filename: "shot.heic",
        format: "heif",
        err: expect.objectContaining({ message: "injected heif-dec failure" }),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("answers 503 ENGINE_UNAVAILABLE when the HEIC decoder is missing, instead of a skip", async () => {
    decoderMocks.heic = new DecoderUnavailableError("No HEIF decoder found.");
    const res = await post(
      withGoodPair({ filename: "shot.heic", contentType: "image/heic", content: HEIC }),
    );

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("ENGINE_UNAVAILABLE");
  });

  it("skips a CLI-decoded file when the decoder and Sharp both fail, logging both errors", async () => {
    const validation = await validateImageBuffer(FAKE_PSD, "layers.psd");
    expect(validation).toMatchObject({ valid: true, format: "psd" });
    decoderMocks.cli = new Error("injected ImageMagick failure");
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      const res = await post(
        withGoodPair({
          filename: "layers.psd",
          contentType: "image/vnd.adobe.photoshop",
          content: FAKE_PSD,
        }),
      );

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.skippedFiles).toEqual([
        { filename: "layers.psd", reason: "Failed to decode PSD" },
      ]);

      const lines = findDuplicatesWarns(warnSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toMatchObject({
        filename: "layers.psd",
        format: "psd",
        // a string, not an Error: pino would serialize a second Error key as {}
        decodeErr: "injected ImageMagick failure",
        err: expect.any(Error),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("answers 503 ENGINE_UNAVAILABLE when the CLI decoder is missing and Sharp can't read the file", async () => {
    decoderMocks.cli = new DecoderUnavailableError("No ImageMagick found.");
    const res = await post(
      withGoodPair({
        filename: "layers.psd",
        contentType: "image/vnd.adobe.photoshop",
        content: FAKE_PSD,
      }),
    );

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("ENGINE_UNAVAILABLE");
  });

  it("keeps a DNG when the RAW decoder is missing but Sharp reads the TIFF, with no skip and no warn", async () => {
    decoderMocks.cli = new DecoderUnavailableError("No RAW decoder found.");
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      const res = await post(
        withGoodPair({ filename: "photo.dng", contentType: "image/x-adobe-dng", content: DNG }),
      );

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.skippedFiles).toBeUndefined();
      expect(result.totalImages).toBe(3);
      // the operator has nothing to fix here, so the fallback stays quiet
      expect(findDuplicatesWarns(warnSpy)).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("treats a hash failure the classifier does not call input as a fault: error line, report, generic reason (#1492)", async () => {
    decoderMocks.hashIsNotInput = true;
    const broken = await truncatedJpeg();
    const errorSpy = vi.spyOn(logger, "error");
    try {
      const res = await post(
        withGoodPair({ filename: "odd.jpg", contentType: "image/jpeg", content: broken }),
      );

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.skippedFiles).toEqual([
        { filename: "odd.jpg", reason: "Failed to compute image hash" },
      ]);

      const lines = errorSpy.mock.calls.filter(
        (call) => typeof call[1] === "string" && String(call[1]).startsWith("find-duplicates:"),
      );
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toMatchObject({ filename: "odd.jpg", err: expect.any(Error) });
      expect(lines[0][1]).toBe("find-duplicates: hash failed on a decodable image");
      expect(decoderMocks.reportError).toHaveBeenCalledTimes(1);
      // the reported error is the one that was logged
      expect(decoderMocks.reportError.mock.calls[0][0]).toBe(lines[0][0].err);
      expect(decoderMocks.reportError.mock.calls[0][1]).toMatchObject({
        source: "http",
        toolId: "find-duplicates",
        inputFormat: "jpg",
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("skips an SVGZ that doesn't decompress to SVG, and logs why", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      const res = await post(
        withGoodPair({ filename: "art.svgz", contentType: "image/svg+xml", content: FAKE_SVGZ }),
      );

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.skippedFiles).toEqual([{ filename: "art.svgz", reason: "Invalid SVG" }]);

      const lines = findDuplicatesWarns(warnSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toMatchObject({
        filename: "art.svgz",
        format: "svg",
        err: expect.any(Error),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
