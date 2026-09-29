/**
 * #1430: hand-written image routes answered a failed decode with a 422 whose
 * `details` was the decoder's raw error. For an external decoder that's
 * execFile's "Command failed: heif-convert /tmp/heic-in-<pid>-<uuid>.heic ...",
 * so the client saw server temp paths. The factory path and the global error
 * handler already strip them; these routes reply inline and didn't.
 */
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const HEIC = readFixture(fixtures.image.base.heic200);
const ICO = readFixture(fixtures.image.formats("ico"));

// Headers intact (they pass the magic-byte check), payloads garbage, so the
// external decoder runs and fails.
const SAMPLES = {
  heic: {
    filename: "broken.heic",
    contentType: "image/heic",
    content: Buffer.concat([HEIC.subarray(0, 64), Buffer.alloc(4096, 0x5a)]),
  },
  ico: {
    filename: "broken.ico",
    contentType: "image/x-icon",
    content: Buffer.concat([ICO.subarray(0, 22), Buffer.alloc(2048, 0x5a)]),
  },
};

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

type Sample = (typeof SAMPLES)[keyof typeof SAMPLES];
type Part = { name: string; filename?: string; contentType?: string; content: Buffer | string };

const settings = (value: unknown): Part => ({ name: "settings", content: JSON.stringify(value) });
const png = (name: string): Part => ({
  name,
  filename: "b.png",
  contentType: "image/png",
  content: PNG,
});

const ROUTES: { name: string; url: string; parts: (s: Sample) => Part[] }[] = [
  {
    name: "collage",
    url: "/api/v1/tools/image/collage",
    parts: (s) => [{ name: "f1", ...s }, png("f2"), settings({ templateId: "2-h-equal" })],
  },
  {
    name: "stitch",
    url: "/api/v1/tools/image/stitch",
    parts: (s) => [
      { name: "file1", ...s },
      png("file2"),
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
    name: "barcode-read",
    url: "/api/v1/tools/image/barcode-read",
    parts: (s) => [{ name: "file", ...s }],
  },
  {
    name: "meme-generator upload",
    url: "/api/v1/tools/image/meme-generator",
    parts: (s) => [
      { name: "file", ...s },
      settings({ textLayout: "top-bottom", textBoxes: [{ id: "top", text: "HI" }] }),
    ],
  },
  {
    name: "image-enhancement analyze",
    url: "/api/v1/tools/image/image-enhancement/analyze",
    parts: (s) => [{ name: "file", ...s }, settings({})],
  },
  {
    name: "optimize-for-web preview",
    url: "/api/v1/tools/image/optimize-for-web/preview",
    parts: (s) => [{ name: "file", ...s }, settings({ format: "webp", quality: 60 })],
  },
  {
    name: "pipeline execute",
    url: "/api/v1/pipeline/execute",
    parts: (s) => [
      { name: "file", ...s },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 32 } }] }),
      },
    ],
  },
];

function post(route: (typeof ROUTES)[number], sample: Sample) {
  const { body, contentType } = createMultipartPayload(route.parts(sample));
  return app.inject({
    method: "POST",
    url: route.url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("decode failures don't expose server temp paths (#1430)", () => {
  for (const route of ROUTES) {
    for (const [format, sample] of Object.entries(SAMPLES)) {
      it(`${route.name}: a corrupt ${format} answers 422 without temp paths`, async () => {
        const res = await post(route, sample);

        expect(res.statusCode, res.body).toBe(422);
        expect(res.body).not.toContain(tmpdir());
        expect(res.body).not.toMatch(/(heic|ico|jxl|raw|jp2|exr)-(in|out)-/);
      });
    }
  }
});
