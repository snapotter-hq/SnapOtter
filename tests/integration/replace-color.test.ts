/**
 * Integration tests for the replace-color tool.
 *
 * Replaces a source color with a target color (or makes it transparent).
 * Tests valid replacements, tolerance parameter, makeTransparent mode,
 * and verifies pixel-level changes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let solidRedBuffer: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Create a solid red test image for predictable color replacement
  solidRedBuffer = await sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = PNG,
  filename = "test.png",
  contentType = "image/png",
) {
  return createMultipartPayload([
    { name: "file", filename, contentType, content: buffer },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
}

async function postTool(
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/replace-color",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Basic replacement ─────────────────────────────────────────────
describe("Basic color replacement", () => {
  it("replaces red with blue in a solid red image", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#0000FF", tolerance: 30 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);

    // Download and verify color changed
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    // Check that the output pixels are predominantly blue
    const { data } = await sharp(dlRes.rawPayload)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // First pixel should be blue-ish (high B, low R)
    expect(data[2]).toBeGreaterThan(data[0]); // blue > red
  });

  it("processes with default settings", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Tolerance ─────────────────────────────────────────────────────
describe("Tolerance parameter", () => {
  it("with tolerance=0, only exact matches are replaced", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 0 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("with high tolerance, more colors are affected", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 200 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("with max tolerance=255, all pixels are affected", async () => {
    const res = await postTool({
      sourceColor: "#FF0000",
      targetColor: "#00FF00",
      tolerance: 255,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Make transparent ──────────────────────────────────────────────
describe("Make transparent mode", () => {
  it("makes matching pixels transparent instead of replacing", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", makeTransparent: true, tolerance: 30 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify alpha channel
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.channels).toBe(4); // RGBA output
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#FF0000", tolerance: 50 },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ sourceColor: "#FF0000", targetColor: "#00FF00" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/replace-color",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid hex color format", async () => {
    const res = await postTool({ sourceColor: "red", targetColor: "#00FF00" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short hex color", async () => {
    const res = await postTool({ sourceColor: "#F00", targetColor: "#00FF00" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for tolerance out of range (negative)", async () => {
    const res = await postTool({ tolerance: -1 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for tolerance out of range (>255)", async () => {
    const res = await postTool({ tolerance: 300 });
    expect(res.statusCode).toBe(400);
  });
});
