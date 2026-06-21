/**
 * Integration tests for the meme-generator tool (/api/v1/tools/image/meme-generator).
 *
 * Supports two input modes:
 * 1. Template mode: JSON body with templateId (no file upload)
 * 2. Custom image mode: multipart with file upload + settings
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

/** First template ID from the real manifest, loaded in beforeAll. */
let firstTemplateId: string;
/** Text box IDs for the first template. */
let firstTemplateTextBoxIds: string[];

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Read the first template from the actual manifest
  const manifestRes = await app.inject({
    method: "GET",
    url: "/api/v1/meme-templates",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const manifest = JSON.parse(manifestRes.body);
  const firstTemplate = manifest.templates[0];
  firstTemplateId = firstTemplate.id;
  firstTemplateTextBoxIds = firstTemplate.textBoxes.map((tb: { id: string }) => tb.id);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Meme Generator", () => {
  // ── Template listing sanity check ─────────────────────────────────

  it("GET /api/v1/meme-templates returns valid manifest", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/meme-templates",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const manifest = JSON.parse(res.body);
    expect(manifest.templates).toBeDefined();
    expect(manifest.templates.length).toBeGreaterThan(0);
    expect(manifest.templates[0].id).toBeDefined();
    expect(manifest.templates[0].textBoxes).toBeDefined();
  });

  // ── Template mode ─────────────────────────────────────────────────

  it("template mode: valid templateId + text boxes returns 200 with downloadUrl", async () => {
    const textBoxes = firstTemplateTextBoxIds.map((id) => ({
      id,
      text: `Test text for ${id}`,
    }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textBoxes,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Custom image mode ─────────────────────────────────────────────

  it("custom image mode: file upload + textLayout + text boxes returns 200", async () => {
    const settings = {
      textLayout: "top-bottom",
      textBoxes: [
        { id: "top", text: "TOP TEXT" },
        { id: "bottom", text: "BOTTOM TEXT" },
      ],
    };

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "meme.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify(settings) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Validation: invalid templateId ────────────────────────────────

  it("invalid templateId returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: "nonexistent-template-that-does-not-exist",
        textBoxes: [{ id: "top", text: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/template/i);
  });

  // ── Validation: neither templateId nor file ───────────────────────

  it("neither templateId nor file returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        textBoxes: [{ id: "top", text: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  // ── Empty text boxes still generates image ────────────────────────

  it("empty text boxes returns 200 (image without text)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textBoxes: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Every font family ─────────────────────────────────────────────

  const FONT_FAMILIES = [
    "anton",
    "arial-black",
    "comic-sans",
    "montserrat",
    "bebas-neue",
    "permanent-marker",
  ] as const;

  for (const font of FONT_FAMILIES) {
    it(`font family "${font}" returns 200`, async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/meme-generator",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          templateId: firstTemplateId,
          fontFamily: font,
          textBoxes: firstTemplateTextBoxIds.map((id) => ({
            id,
            text: `Test with ${font}`,
          })),
        },
      });

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    });
  }

  // ── All text layout presets with custom image ─────────────────────

  const TEXT_LAYOUTS = ["top-bottom", "top-only", "bottom-only", "center", "side-by-side"] as const;

  for (const layout of TEXT_LAYOUTS) {
    it(`text layout "${layout}" with custom image returns 200`, async () => {
      // Build text boxes matching the layout preset IDs
      const textBoxMap: Record<string, { id: string; text: string }[]> = {
        "top-bottom": [
          { id: "top", text: "TOP" },
          { id: "bottom", text: "BOTTOM" },
        ],
        "top-only": [{ id: "top", text: "TOP ONLY" }],
        "bottom-only": [{ id: "bottom", text: "BOTTOM ONLY" }],
        center: [{ id: "center", text: "CENTER TEXT" }],
        "side-by-side": [
          { id: "left", text: "LEFT" },
          { id: "right", text: "RIGHT" },
        ],
      };

      const settings = {
        textLayout: layout,
        textBoxes: textBoxMap[layout],
      };

      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "meme.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify(settings) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/meme-generator",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    });
  }

  // ── Authentication ────────────────────────────────────────────────

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textBoxes: [],
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Response structure ──────────────────────────────────────────
  it("returns all expected fields in template mode response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: `Test ${id}`,
        })),
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.processedSize).toBe("number");
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Custom image with JPEG input ────────────────────────────────
  it("custom image mode with JPEG input", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const settings = {
      textLayout: "top-bottom",
      textBoxes: [
        { id: "top", text: "JPEG TOP" },
        { id: "bottom", text: "JPEG BOTTOM" },
      ],
    };

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "meme.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify(settings) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Font size parameter ─────────────────────────────────────────
  it("accepts custom fontSize parameter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontSize: 48,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Big text",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Text color and stroke color ─────────────────────────────────
  it("accepts custom textColor and strokeColor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textColor: "#ff0000",
        strokeColor: "#00ff00",
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Colored text",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Text alignment ──────────────────────────────────────────────
  it("accepts text alignment left", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textAlign: "left",
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Left aligned",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts text alignment right", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textAlign: "right",
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Right aligned",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── allCaps toggle ──────────────────────────────────────────────
  it("accepts allCaps=false (lowercase text)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        allCaps: false,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "lowercase text test",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── roboto font family ──────────────────────────────────────────
  it("accepts roboto font family", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontFamily: "roboto",
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Roboto font",
        })),
      },
    });

    // Roboto may not be installed in test env, accept 422 (rendering failure)
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    }
  });

  // ── Invalid font family ─────────────────────────────────────────
  it("rejects invalid font family", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontFamily: "comic-neue",
        textBoxes: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Corrupt image in custom mode ────────────────────────────────
  it("rejects corrupt image in custom mode", async () => {
    const settings = {
      textLayout: "top-bottom",
      textBoxes: [{ id: "top", text: "FAIL" }],
    };

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.png",
        contentType: "image/png",
        content: Buffer.from("not image data"),
      },
      { name: "settings", content: JSON.stringify(settings) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Template mode with special characters in text ───────────────
  it("handles special characters in meme text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "<script>\"Hello\" & 'World'</script>",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Custom image with HEIC input ────────────────────────────────
  it("custom image mode with HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const settings = {
      textLayout: "center",
      textBoxes: [{ id: "center", text: "HEIC MEME" }],
    };

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "meme.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify(settings) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    }
  });

  // ── Font size boundaries ────────────────────────────────────────
  it("accepts minimum fontSize (8)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontSize: 8,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Tiny text",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts maximum fontSize (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontSize: 200,
        textBoxes: firstTemplateTextBoxIds.map((id) => ({
          id,
          text: "Huge text",
        })),
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects fontSize below minimum (7)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontSize: 7,
        textBoxes: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects fontSize above maximum (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/meme-generator",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        templateId: firstTemplateId,
        fontSize: 201,
        textBoxes: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
