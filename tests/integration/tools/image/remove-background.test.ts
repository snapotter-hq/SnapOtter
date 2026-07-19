/**
 * Integration tests for the remove-background tool (/api/v1/tools/image/remove-background).
 *
 * This tool requires the Python sidecar (rembg). Tests accept both 200
 * (sidecar running) and 501 (not installed) for the processing path while
 * fully testing validation paths that don't depend on the sidecar.
 *
 * Also covers the /effects sub-route for Phase 2 compositing.
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { putObject } from "../../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const HEIC = readFixture(fixtures.image.base.heic200);
const TINY = readFixture(fixtures.image.edge.px1);

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

describe("Remove Background", () => {
  // ── Phase 1: Processing (AI-dependent) ───────────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);

    if (res.statusCode === 202) {
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.async).toBe(true);
    }

    if (res.statusCode === 501) {
      const result = JSON.parse(res.body);
      expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 60_000);

  it("accepts transparent backgroundType", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "transparent" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts color background with blur and shadow settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "color",
          backgroundColor: "#FF0000",
          blurEnabled: true,
          blurIntensity: 50,
          shadowEnabled: true,
          shadowOpacity: 60,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts gradient background settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "gradient",
          gradientColor1: "#FF0000",
          gradientColor2: "#0000FF",
          gradientAngle: 45,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC input",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/remove-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Phase 2: Effects sub-route ───────────────────────────────────

  it("effects route rejects missing settings", async () => {
    const { body, contentType } = createMultipartPayload([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no settings/i);
  });

  it("effects route rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: "not json{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/json/i);
  });

  it("effects route rejects settings without jobId", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ filename: "test.png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  // ── Validation (always testable) ─────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/no image/i);
    }
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not valid json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/json/i);
    }
  });

  it("rejects invalid backgroundType", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "sparkles" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects blurIntensity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurIntensity: 200 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("accepts edge refinement and decontamination settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ edgeRefine: 2, decontaminate: true }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts output format settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "webp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("rejects edgeRefine out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ edgeRefine: 5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "gif" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Phase 2 effects route: library auto-save (#495 / #565) ─────────
//
// The compositing route is pure Sharp (no AI sidecar), so its library
// auto-save is testable end to end in CI. It saves the FINAL composited
// image (not the transparent Phase 1 intermediate) under the chosen
// saveMode when the request references a library file.

/** Upload a PNG into the library, return its file id. */
async function uploadLibraryFile(filename: string): Promise<string> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "image/png", content: PNG },
  ]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body).files[0].id;
}

/** Fetch file detail (metadata + version chain). */
async function getFileDetail(id: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/files/${id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

/**
 * Seed the cached Phase 1 artifacts the effects route reads: a transparent
 * subject (`_mask.png`) and the original (`_original.png`) under the job's
 * output prefix, both matching the `<base>` derived from the filename.
 */
async function seedPhase1Cache(jobId: string, base: string): Promise<void> {
  const mask = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const original = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  await putObject(`outputs/${jobId}/${base}_mask.png`, mask);
  await putObject(`outputs/${jobId}/${base}_original.png`, original);
}

function effectsPayload(fields: Array<{ name: string; content: string }>) {
  return createMultipartPayload(fields);
}

describe("Remove Background effects route: library saveMode", () => {
  it("saves the composited result as an independent new library file", async () => {
    const originalId = await uploadLibraryFile("rbfxnew.png");
    const jobId = randomUUID();
    await seedPhase1Cache(jobId, "rbfxnew");

    const { body, contentType } = effectsPayload([
      {
        name: "settings",
        content: JSON.stringify({
          jobId,
          filename: "rbfxnew.png",
          backgroundType: "color",
          backgroundColor: "#FF0000",
          outputFormat: "png",
        }),
      },
      { name: "fileId", content: originalId },
      { name: "saveMode", content: "new" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.savedFileId).toBeDefined();
    expect(parsed.savedFileId).not.toBe(originalId);

    const detail = await getFileDetail(parsed.savedFileId);
    expect(detail.file.version).toBe(1);
    expect(detail.file.parentId).toBeNull();
    expect(detail.file.toolChain).toContain("remove-background");
  });

  it("overwrite creates a superseding version linked to the original", async () => {
    const originalId = await uploadLibraryFile("rbfxover.png");
    const jobId = randomUUID();
    await seedPhase1Cache(jobId, "rbfxover");

    const { body, contentType } = effectsPayload([
      {
        name: "settings",
        content: JSON.stringify({
          jobId,
          filename: "rbfxover.png",
          backgroundType: "color",
          backgroundColor: "#00FF00",
          outputFormat: "png",
        }),
      },
      { name: "fileId", content: originalId },
      { name: "saveMode", content: "overwrite" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.savedFileId).toBeDefined();

    const detail = await getFileDetail(parsed.savedFileId);
    expect(detail.file.version).toBe(2);
    expect(detail.file.parentId).toBe(originalId);
  });

  it("does not save when no fileId is sent", async () => {
    const jobId = randomUUID();
    await seedPhase1Cache(jobId, "rbfxnolib");

    const { body, contentType } = effectsPayload([
      {
        name: "settings",
        content: JSON.stringify({
          jobId,
          filename: "rbfxnolib.png",
          backgroundType: "color",
          backgroundColor: "#0000FF",
          outputFormat: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).savedFileId).toBeUndefined();
  });

  it("rejects an invalid saveMode with 400", async () => {
    const { body, contentType } = effectsPayload([
      {
        name: "settings",
        content: JSON.stringify({ jobId: randomUUID(), filename: "x.png" }),
      },
      { name: "saveMode", content: "destroy-everything" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/saveMode/i);
  });
});
