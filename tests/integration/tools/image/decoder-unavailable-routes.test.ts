/**
 * #1428: hand-written image routes decode HEIC and CLI formats inline and used
 * to answer 422 for any failure, so a host without libheif-examples or
 * ImageMagick blamed the upload and nothing was logged. A missing decoder now
 * propagates to the global handler as 503 ENGINE_UNAVAILABLE, the same as
 * collage (#795) and the factory path.
 *
 * Covers the non-AI routes; the AI routes get the same one-line guard but sit
 * behind a bundle-install check the test environment does not satisfy.
 *
 * The missing binary is simulated as a misconfigured host sees it: PATH points
 * at an empty directory, so every decoder spawn fails with ENOENT.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const SAMPLES = {
  heic: {
    filename: "photo.heic",
    contentType: "image/heic",
    content: readFixture(fixtures.image.base.heic200),
  },
  ico: {
    filename: "icon.ico",
    contentType: "image/x-icon",
    content: readFixture(fixtures.image.formats("ico")),
  },
};

const ORIGINAL_PATH = process.env.PATH;
const emptyBinDir = mkdtempSync(join(tmpdir(), "routes-no-decoders-"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(async () => {
  process.env.PATH = ORIGINAL_PATH;
  rmSync(emptyBinDir, { recursive: true, force: true });
  await testApp.cleanup();
}, 10_000);

type Sample = (typeof SAMPLES)[keyof typeof SAMPLES];
type Part = { name: string; filename?: string; contentType?: string; content: Buffer | string };

interface RouteCase {
  name: string;
  url: string;
  parts: (sample: Sample) => Part[];
}

const settings = (value: unknown): Part => ({ name: "settings", content: JSON.stringify(value) });

const ROUTES: RouteCase[] = [
  {
    name: "stitch",
    url: "/api/v1/tools/image/stitch",
    parts: (s) => [
      { name: "file1", ...s },
      { name: "file2", filename: "b.png", contentType: "image/png", content: PNG },
      settings({ direction: "horizontal", resizeMode: "fit" }),
    ],
  },
  {
    name: "split",
    url: "/api/v1/tools/image/split",
    parts: (s) => [{ name: "file", ...s }, settings({ columns: 2, rows: 2 })],
  },
  {
    name: "color-palette",
    url: "/api/v1/tools/image/color-palette",
    parts: (s) => [{ name: "file", ...s }],
  },
  {
    name: "image-to-pdf",
    url: "/api/v1/tools/image/image-to-pdf",
    parts: (s) => [{ name: "file", ...s }, settings({ collate: false })],
  },
  {
    name: "barcode-read",
    url: "/api/v1/tools/image/barcode-read",
    parts: (s) => [{ name: "file", ...s }],
  },
  {
    name: "file preview",
    url: "/api/v1/preview",
    parts: (s) => [{ name: "file", ...s }],
  },
  {
    name: "info",
    url: "/api/v1/tools/image/info",
    parts: (s) => [{ name: "file", ...s }],
  },
  {
    name: "optimize-for-web preview",
    url: "/api/v1/tools/image/optimize-for-web/preview",
    parts: (s) => [{ name: "file", ...s }, settings({ format: "webp", quality: 60 })],
  },
  {
    name: "image-enhancement analyze",
    url: "/api/v1/tools/image/image-enhancement/analyze",
    parts: (s) => [{ name: "file", ...s }, settings({})],
  },
];

function post(route: RouteCase, sample: Sample) {
  const { body, contentType } = createMultipartPayload(route.parts(sample));
  return app.inject({
    method: "POST",
    url: route.url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("Hand-written image routes: decoder availability (#1428)", () => {
  for (const route of ROUTES) {
    for (const [format, sample] of Object.entries(SAMPLES)) {
      it(`${route.name}: a missing decoder for ${format} answers 503 ENGINE_UNAVAILABLE`, async () => {
        process.env.PATH = emptyBinDir;

        const res = await post(route, sample);

        expect(res.statusCode, res.body).toBe(503);
        expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
      });
    }
  }

  it("info: an unrecognized upload stays 422 even with no HEIF decoder to guess with", async () => {
    process.env.PATH = emptyBinDir;

    // info tries HEIF on anything Sharp can't read; a missing HEIF decoder
    // says nothing about a file that was never detected as HEIF.
    const res = await post(ROUTES.find((r) => r.name === "info") as RouteCase, {
      filename: "junk.jpg",
      contentType: "image/jpeg",
      content: readFixture(fixtures.image.hostile.garbage),
    });

    expect(res.statusCode, res.body).toBe(422);
  });
});
