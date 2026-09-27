/**
 * Integration tests for the passport-photo AI tool.
 *
 * Two-phase flow:
 *   Phase 1: POST /api/v1/tools/image/passport-photo/analyze (face detection + bg removal)
 *   Phase 2: POST /api/v1/tools/image/passport-photo/generate (crop/resize, JSON body)
 *
 * The Python sidecar may not be running, so processing tests accept both
 * 200 (sidecar available) and 501 (feature not installed). Validation paths
 * are always testable.
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getObjectBuffer, putObject } from "../../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
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

describe("passport-photo/analyze", () => {
  // ── Processing (sidecar-dependent) ────────────────────────────────

  it("responds to the analyze route (200, 422, or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // 200 = success with face, 422 = no face detected or processing error, 501 = sidecar not installed
    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  it("returns landmarks and preview on success", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 422, 501]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.landmarks).toBeDefined();
      expect(json.preview).toBeDefined();
      expect(json.imageWidth).toBeDefined();
      expect(json.imageHeight).toBeDefined();
    }
  }, 60_000);

  it(
    "handles HEIC input (200, 422, or 501)",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/passport-photo/analyze",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect([200, 422, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel input (200, 422, or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ──────────────────────────────────

  it("rejects requests without a file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "clientJobId", content: "test-123" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // 400 when sidecar is available, 501 when not (isToolInstalled check fires first)
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/no image/i);
    }
  });

  it("rejects unauthenticated requests to analyze (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("passport-photo/generate", () => {
  // ── Validation (always testable, JSON body endpoint) ──────────────

  it("rejects missing required fields (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/invalid settings/i);
  });

  it("rejects unknown country code without custom dimensions (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: "nonexistent-job-id",
        filename: "test.png",
        countryCode: "XX",
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          rightEye: { x: 0.7, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.2 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.6 },
          faceCenterX: 0.5,
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    // 400 for unknown country code or 422 for missing workspace
    expect([400, 422]).toContain(res.statusCode);
  });

  it("rejects invalid dpi value (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: "test-job",
        filename: "test.png",
        countryCode: "US",
        dpi: 50,
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          rightEye: { x: 0.7, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.2 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.6 },
          faceCenterX: 0.5,
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid zoom value (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: "test-job",
        filename: "test.png",
        countryCode: "US",
        zoom: 10,
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          rightEye: { x: 0.7, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.2 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.6 },
          faceCenterX: 0.5,
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests to generate (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: { "content-type": "application/json" },
      payload: {
        jobId: "test-job",
        filename: "test.png",
        countryCode: "US",
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          rightEye: { x: 0.7, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.2 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.6 },
          faceCenterX: 0.5,
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects missing landmarks fields (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: "test-job",
        filename: "test.png",
        countryCode: "US",
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          // Missing required fields
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 422 when jobId workspace does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: "00000000-0000-0000-0000-000000000000",
        filename: "test.png",
        countryCode: "US",
        landmarks: {
          leftEye: { x: 0.3, y: 0.4 },
          rightEye: { x: 0.7, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.2 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.6 },
          faceCenterX: 0.5,
        },
        imageWidth: 200,
        imageHeight: 150,
      },
    });

    // 422 because the workspace directory won't exist for this fake jobId
    expect(res.statusCode).toBe(422);
  });
});

describe("passport-photo/generate maxFileSizeKb (#1288)", () => {
  // Seeds the analyze phase's output directly (a background-removed PNG), so
  // the crop, resize and size cap run without the face-detection model.
  async function seedNobg(): Promise<{ jobId: string; w: number; h: number }> {
    const w = 900;
    const h = 1200;
    const raw = Buffer.alloc(w * h * 4);
    let s = 4242;
    for (let i = 0; i < raw.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      raw[i] = s & 0xff;
      raw[i + 1] = (s >> 8) & 0xff;
      raw[i + 2] = (s >> 16) & 0xff;
      raw[i + 3] = 255;
    }
    const nobg = await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();
    const jobId = randomUUID();
    await putObject(`outputs/${jobId}/photo_nobg.png`, nobg);
    return { jobId, w, h };
  }

  const point = (x: number, y: number) => ({ x, y });

  async function generate(maxFileSizeKb: number) {
    const { jobId, w, h } = await seedNobg();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: {
        jobId,
        filename: "photo.jpg",
        countryCode: "US",
        maxFileSizeKb,
        imageWidth: w,
        imageHeight: h,
        landmarks: {
          leftEye: point(0.42, 0.4),
          rightEye: point(0.58, 0.4),
          eyeCenter: point(0.5, 0.4),
          chin: point(0.5, 0.62),
          forehead: point(0.5, 0.25),
          crown: point(0.5, 0.18),
          nose: point(0.5, 0.5),
          faceCenterX: 0.5,
        },
      },
    });
    return { res, jobId };
  }

  it("counts the cap in 1000-byte KB, the way upload portals do", async () => {
    // With 1024-byte KB this photo came back at 122,230 bytes for a 120 KB
    // cap: over a portal that counts 120 KB as 120,000 bytes.
    const { res, jobId } = await generate(120);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    const out = await getObjectBuffer(`outputs/${jobId}/photo_passport.jpg`);
    expect(out.length).toBeLessThanOrEqual(120_000);
  });

  it("fails clearly instead of returning a photo over the cap", async () => {
    // A 600x600 px JPEG of noise can't get under 1 KB, even at quality 1.
    const { res } = await generate(1);
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toBe(
      "Couldn't get this photo under 1 KB at the required dimensions. Try a larger size limit.",
    );
  });
});
