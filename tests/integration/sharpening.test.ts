/**
 * Integration tests for the sharpening tool.
 *
 * Tests all three sharpening methods (adaptive, unsharp-mask, high-pass),
 * custom parameters, denoise option, and format support.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));

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
    url: "/api/v1/tools/sharpening",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Adaptive method (default) ─────────────────────────────────────
describe("Adaptive sharpening", () => {
  it("sharpens with default settings", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("sharpens with custom sigma", async () => {
    const res = await postTool({ method: "adaptive", sigma: 3.0 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("sharpens with all adaptive parameters", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 2.0,
      m1: 2.0,
      m2: 5.0,
      x1: 3.0,
      y2: 15,
      y3: 25,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Unsharp mask method ───────────────────────────────────────────
describe("Unsharp mask sharpening", () => {
  it("sharpens with unsharp-mask method", async () => {
    const res = await postTool({ method: "unsharp-mask" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("sharpens with custom amount and radius", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 200,
      radius: 2.5,
      threshold: 10,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── High-pass method ──────────────────────────────────────────────
describe("High-pass sharpening", () => {
  it("sharpens with high-pass method", async () => {
    const res = await postTool({ method: "high-pass" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("sharpens with custom strength and kernel size 5", async () => {
    const res = await postTool({ method: "high-pass", strength: 80, kernelSize: 5 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Denoise option ────────────────────────────────────────────────
describe("Denoise option", () => {
  it("applies light denoise", async () => {
    const res = await postTool({ denoise: "light" });
    expect(res.statusCode).toBe(200);
  });

  it("applies medium denoise", async () => {
    const res = await postTool({ denoise: "medium" });
    expect(res.statusCode).toBe(200);
  });

  it("applies strong denoise", async () => {
    const res = await postTool({ denoise: "strong" });
    expect(res.statusCode).toBe(200);
  });
});

// ── Output verification ──────────────────────────────────────────
describe("Output verification", () => {
  it("output differs from input (sharpening changes data)", async () => {
    const res = await postTool({ method: "adaptive", sigma: 5.0 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    // Sharpened output should not be identical to input
    expect(Buffer.compare(dlRes.rawPayload, PNG)).not.toBe(0);
  });

  it("preserves image dimensions", async () => {
    const res = await postTool({ method: "unsharp-mask", amount: 300 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool({ method: "adaptive" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("processes WebP input", async () => {
    const res = await postTool({ method: "adaptive" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ method: "adaptive" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/sharpening",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid method", async () => {
    const res = await postTool({ method: "gaussian" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for sigma out of range (too low)", async () => {
    const res = await postTool({ sigma: 0.1 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for sigma out of range (too high)", async () => {
    const res = await postTool({ sigma: 50 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid kernelSize", async () => {
    const res = await postTool({ method: "high-pass", kernelSize: 7 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid denoise value", async () => {
    const res = await postTool({ denoise: "extreme" });
    expect(res.statusCode).toBe(400);
  });
});

// ── HEIC input handling ─────────────────────────────────────────
describe("HEIC input", () => {
  it("processes HEIC image with adaptive sharpening", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool({ method: "adaptive" }, HEIC, "photo.heic", "image/heic");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Edge size inputs ────────────────────────────────────────────
describe("Edge size inputs", () => {
  it("processes 1x1 pixel image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const res = await postTool({ method: "adaptive" }, TINY, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
  });

  it("processes stress-large.jpg", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { method: "unsharp-mask", amount: 150 },
      LARGE,
      "large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Combined sharpening + denoise ───────────────────────────────
describe("Combined sharpening + denoise", () => {
  it("applies high-pass sharpening with strong denoise", async () => {
    const res = await postTool({
      method: "high-pass",
      strength: 80,
      kernelSize: 5,
      denoise: "strong",
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("applies adaptive sharpening with light denoise", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 1.5,
      denoise: "light",
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Unsharp mask with denoise ──────────────────────────────────
describe("Unsharp mask + denoise", () => {
  it("applies unsharp-mask with medium denoise", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 150,
      radius: 2.0,
      threshold: 5,
      denoise: "medium",
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Unauthenticated request ────────────────────────────────────
describe("Authentication", () => {
  it("rejects unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({});
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/sharpening",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Boundary parameters for adaptive ───────────────────────────
describe("Adaptive boundary parameters", () => {
  it("uses minimum sigma (0.5)", async () => {
    const res = await postTool({ method: "adaptive", sigma: 0.5 });
    expect(res.statusCode).toBe(200);
  });

  it("uses maximum sigma (10)", async () => {
    const res = await postTool({ method: "adaptive", sigma: 10 });
    expect(res.statusCode).toBe(200);
  });

  it("uses maximum m1, m2, x1, y2, y3 values", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 2.0,
      m1: 10,
      m2: 20,
      x1: 10,
      y2: 50,
      y3: 50,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Boundary parameters for unsharp mask ───────────────────────
describe("Unsharp mask boundary parameters", () => {
  it("uses maximum amount (1000)", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 1000,
      radius: 1.0,
      threshold: 0,
    });
    expect(res.statusCode).toBe(200);
  });

  it("uses minimum radius (0.1)", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 100,
      radius: 0.1,
    });
    expect(res.statusCode).toBe(200);
  });

  it("uses maximum radius (5)", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 100,
      radius: 5.0,
    });
    expect(res.statusCode).toBe(200);
  });

  it("uses maximum threshold (255)", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      threshold: 255,
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects amount out of range (>1000)", async () => {
    const res = await postTool({ method: "unsharp-mask", amount: 1001 });
    expect(res.statusCode).toBe(400);
  });
});

// ── High-pass boundary parameters ──────────────────────────────
describe("High-pass boundary parameters", () => {
  it("uses minimum strength (0)", async () => {
    const res = await postTool({ method: "high-pass", strength: 0, kernelSize: 3 });
    expect(res.statusCode).toBe(200);
  });

  it("uses maximum strength (100)", async () => {
    const res = await postTool({ method: "high-pass", strength: 100, kernelSize: 3 });
    expect(res.statusCode).toBe(200);
  });

  it("rejects strength out of range (>100)", async () => {
    const res = await postTool({ method: "high-pass", strength: 101 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Denoise boundary: off ──────────────────────────────────────
describe("Denoise off", () => {
  it("explicitly sets denoise to off", async () => {
    const res = await postTool({ denoise: "off" });
    expect(res.statusCode).toBe(200);
  });
});

// ── HEIC with unsharp-mask method ──────────────────────────────
describe("HEIC with different methods", () => {
  it("processes HEIC with unsharp-mask", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool(
      { method: "unsharp-mask", amount: 200 },
      HEIC,
      "photo.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
  });

  it("processes HEIC with high-pass", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool(
      { method: "high-pass", strength: 60 },
      HEIC,
      "photo.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
  });
});

// ── HEIF input ──────────────────────────────────────────────────
describe("HEIF input", () => {
  it(
    "processes HEIF image (motorcycle.heif)",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
      const res = await postTool(
        { method: "adaptive", sigma: 2.0 },
        HEIF,
        "photo.heif",
        "image/heif",
      );
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    },
    120_000,
  );
});

// ── Animated GIF input ──────────────────────────────────────────
describe("Animated GIF input", () => {
  it("processes animated GIF", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const res = await postTool(
      { method: "unsharp-mask", amount: 150 },
      GIF,
      "anim.gif",
      "image/gif",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── SVG input ───────────────────────────────────────────────────
describe("SVG input", () => {
  it("processes SVG image", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const res = await postTool({ method: "adaptive" }, SVG, "icon.svg", "image/svg+xml");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});
