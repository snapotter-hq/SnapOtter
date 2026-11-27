/**
 * Issue #5133: an EXIF-rotated multi-page TIFF whose pages autoOrient can't
 * turn as one stack (pages of different sizes here) was cut to page 1 before
 * any tool ran, so a TIFF-out tool answered 200 with one page where the same
 * file without its orientation tag got a 400. Every ingress that orients
 * (tool route, tool batch, pipeline, pipeline batch) now asks the tool what it
 * writes and refuses when that is TIFF.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const ROTATED = readFixture(fixtures.image.edge.multipageMixedSizesOrientedTiff);
const UNROTATED = readFixture(fixtures.image.edge.multipageMixedSizesTiff);
const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

function post(url: string, parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url,
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

function tiffPart(content: Buffer, filename = "scan.tiff") {
  return { name: "file", filename, contentType: "image/tiff", content };
}

function fileResults(res: { headers: Record<string, unknown> }): Record<string, string> {
  return JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
}

/** The per-file failures a batch parent records. */
async function failureDetails(res: { headers: Record<string, unknown> }) {
  const parentId = res.headers["x-job-id"] as string;
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, parentId));
  return (row?.error as { details?: Array<{ filename: string; error: string }> } | null)?.details;
}

const PAGE_SIZES_REFUSAL = {
  filename: "scan.tiff",
  error: expect.stringMatching(/2 pages of different sizes/),
};

/** The fields a client acts on; a job id and timings differ per run. */
function refusal(res: { statusCode: number; body: string }) {
  const json = JSON.parse(res.body) as { error?: string; code?: string };
  return { statusCode: res.statusCode, error: json.error, code: json.code };
}

describe("tool route", () => {
  it("refuses the rotated file exactly as it refuses the unrotated one", async () => {
    const settings = { name: "settings", content: JSON.stringify({ angle: 90 }) };
    const unrotated = await post("/api/v1/tools/image/rotate", [tiffPart(UNROTATED), settings]);
    const rotated = await post("/api/v1/tools/image/rotate", [tiffPart(ROTATED), settings]);

    expect(refusal(rotated)).toEqual(refusal(unrotated));
    expect(refusal(rotated)).toMatchObject({
      statusCode: 400,
      code: "IMAGE_UNDECODABLE",
      error: expect.stringMatching(/2 pages of different sizes/),
    });
  }, 30_000);

  it("keeps rotated page 1 when the tool writes a still format", async () => {
    const res = await post("/api/v1/tools/image/convert", [
      tiffPart(ROTATED),
      { name: "settings", content: JSON.stringify({ format: "png" }) },
    ]);

    expect([200, 202]).toContain(res.statusCode);
  }, 30_000);

  it("refuses the rotated file for split tiles kept as TIFF, as for the unrotated one", async () => {
    const settings = { name: "settings", content: JSON.stringify({ outputFormat: "original" }) };
    const unrotated = await post("/api/v1/tools/image/split", [tiffPart(UNROTATED), settings]);
    const rotated = await post("/api/v1/tools/image/split", [tiffPart(ROTATED), settings]);

    expect(refusal(rotated)).toEqual(refusal(unrotated));
    expect(refusal(rotated)).toMatchObject({
      statusCode: 400,
      error: expect.stringMatching(/2 pages of different sizes/),
    });
  }, 30_000);

  it.each([
    { toolId: "compose", second: "overlay" },
    { toolId: "watermark-image", second: "watermark" },
  ])(
    "refuses the rotated base for $toolId, as for the unrotated one",
    async ({ toolId, second }) => {
      const parts = (base: Buffer) => [
        tiffPart(base),
        { name: second, filename: "mark.png", contentType: "image/png", content: PNG },
        { name: "settings", content: "{}" },
      ];
      const unrotated = await post(`/api/v1/tools/image/${toolId}`, parts(UNROTATED));
      const rotated = await post(`/api/v1/tools/image/${toolId}`, parts(ROTATED));

      expect(refusal(rotated)).toEqual(refusal(unrotated));
      expect(refusal(rotated)).toMatchObject({
        statusCode: 400,
        error: expect.stringMatching(/2 pages of different sizes/),
      });
    },
    30_000,
  );
});

describe("tool batch", () => {
  it("fails the rotated file alone and keeps the rest", async () => {
    const res = await post("/api/v1/tools/image/rotate/batch", [
      tiffPart(ROTATED),
      { name: "file", filename: "keeper.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const results = fileResults(res);
    expect(results["0"]).toBeUndefined();
    expect(results["1"]).toBeDefined();
    expect(await failureDetails(res)).toEqual([expect.objectContaining(PAGE_SIZES_REFUSAL)]);
  }, 30_000);
});

describe("pipeline", () => {
  function execute(steps: Array<{ toolId: string; settings?: Record<string, unknown> }>) {
    return post("/api/v1/pipeline/execute", [
      tiffPart(ROTATED),
      { name: "pipeline", content: JSON.stringify({ steps }) },
    ]);
  }

  it("refuses the rotated file when the first step writes TIFF", async () => {
    const res = await execute([{ toolId: "rotate", settings: { angle: 90 } }]);

    expect(refusal(res)).toMatchObject({
      statusCode: 400,
      code: "IMAGE_UNDECODABLE",
      error: expect.stringMatching(/2 pages of different sizes/),
    });
  }, 30_000);

  it("keeps rotated page 1 when the first step writes a still format", async () => {
    const res = await execute([{ toolId: "convert", settings: { format: "png" } }]);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).stepsCompleted).toBe(1);
  }, 30_000);

  it("fails the rotated file alone in a pipeline batch", async () => {
    const res = await post("/api/v1/pipeline/batch", [
      tiffPart(ROTATED),
      { name: "file", filename: "keeper.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "rotate", settings: { angle: 90 } }] }),
      },
    ]);

    expect(res.statusCode).toBe(200);
    const results = fileResults(res);
    expect(results["0"]).toBeUndefined();
    expect(results["1"]).toBeDefined();
    expect(await failureDetails(res)).toEqual([expect.objectContaining(PAGE_SIZES_REFUSAL)]);
  }, 30_000);
});
