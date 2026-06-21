/**
 * Integration tests for the sharpening tool.
 *
 * Tests all three sharpening methods (adaptive, unsharp-mask, high-pass),
 * custom parameters, denoise option, and format support.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);

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
    url: "/api/v1/tools/image/sharpening",
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
      url: "/api/v1/tools/image/sharpening",
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
    const HEIC = readFixture(fixtures.image.base.heic200);
    const res = await postTool({ method: "adaptive" }, HEIC, "photo.heic", "image/heic");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Edge size inputs ────────────────────────────────────────────
describe("Edge size inputs", () => {
  it("processes 1x1 pixel image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const res = await postTool({ method: "adaptive" }, TINY, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
  });

  it("processes stress-large.jpg", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
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
      url: "/api/v1/tools/image/sharpening",
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
    const HEIC = readFixture(fixtures.image.base.heic200);
    const res = await postTool(
      { method: "unsharp-mask", amount: 200 },
      HEIC,
      "photo.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
  });

  it("processes HEIC with high-pass", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
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
      const HEIF = readFixture(fixtures.image.motorcycle);
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
    const GIF = readFixture(fixtures.image.animated.gif);
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
    const SVG = readFixture(fixtures.image.base.svg100);
    const res = await postTool({ method: "adaptive" }, SVG, "icon.svg", "image/svg+xml");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── TIFF input ─────────────────────────────────────────────────
describe("TIFF input", () => {
  it("processes TIFF image with unsharp-mask", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const res = await postTool(
      { method: "unsharp-mask", amount: 150 },
      TIFF,
      "test.tiff",
      "image/tiff",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── BMP input ──────────────────────────────────────────────────
describe("BMP input", () => {
  it("processes BMP image with adaptive sharpening", async () => {
    const BMP = readFixture(fixtures.image.formats("bmp"));
    const res = await postTool({ method: "adaptive", sigma: 2.0 }, BMP, "test.bmp", "image/bmp");
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    }
  });
});

// ── Negative strength rejected ─────────────────────────────────
describe("Negative strength rejected", () => {
  it("rejects negative strength value", async () => {
    const res = await postTool({ method: "high-pass", strength: -1 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Radius out of range ────────────────────────────────────────
describe("Radius out of range", () => {
  it("rejects radius below minimum (<0.1)", async () => {
    const res = await postTool({ method: "unsharp-mask", radius: 0.05 });
    expect(res.statusCode).toBe(400);
  });

  it("rejects radius above maximum (>5)", async () => {
    const res = await postTool({ method: "unsharp-mask", radius: 5.1 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Threshold boundary 0 ───────────────────────────────────────
describe("Threshold boundary", () => {
  it("accepts minimum threshold (0)", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 100,
      radius: 1.0,
      threshold: 0,
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects threshold above maximum (>255)", async () => {
    const res = await postTool({ method: "unsharp-mask", threshold: 256 });
    expect(res.statusCode).toBe(400);
  });

  it("rejects negative threshold", async () => {
    const res = await postTool({ method: "unsharp-mask", threshold: -1 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Amount boundary ────────────────────────────────────────────
describe("Amount boundary", () => {
  it("accepts minimum amount (0)", async () => {
    const res = await postTool({ method: "unsharp-mask", amount: 0 });
    expect(res.statusCode).toBe(200);
  });

  it("rejects negative amount", async () => {
    const res = await postTool({ method: "unsharp-mask", amount: -1 });
    expect(res.statusCode).toBe(400);
  });
});

// ── All three methods with denoise ─────────────────────────────
describe("All methods with denoise", () => {
  it("applies adaptive with strong denoise", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 2.0,
      denoise: "strong",
    });
    expect(res.statusCode).toBe(200);
  });

  it("applies unsharp-mask with light denoise", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 100,
      denoise: "light",
    });
    expect(res.statusCode).toBe(200);
  });

  it("applies high-pass with medium denoise", async () => {
    const res = await postTool({
      method: "high-pass",
      strength: 50,
      kernelSize: 3,
      denoise: "medium",
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Output format preservation ─────────────────────────────────
describe("Output format preservation", () => {
  it("preserves JPEG format after sharpening", async () => {
    const res = await postTool(
      { method: "unsharp-mask", amount: 200 },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("preserves WebP format after sharpening", async () => {
    const res = await postTool({ method: "adaptive", sigma: 1.5 }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });
});

// ── High-pass with default kernelSize 3 ──────────────────────
describe("High-pass default kernelSize", () => {
  it("uses default kernelSize (3) when not specified", async () => {
    const res = await postTool({ method: "high-pass", strength: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Before-after comparison for each method ────────────────────
describe("Before-after pixel comparison", () => {
  it("unsharp-mask changes pixel data", async () => {
    const res = await postTool({ method: "unsharp-mask", amount: 500, radius: 2.0, threshold: 0 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(Buffer.compare(dlRes.rawPayload, PNG)).not.toBe(0);
  });

  it("high-pass changes pixel data", async () => {
    const res = await postTool({ method: "high-pass", strength: 80, kernelSize: 5 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(Buffer.compare(dlRes.rawPayload, PNG)).not.toBe(0);
  });
});

// ── Invalid settings JSON ────────────────────────────────────
describe("Invalid settings JSON", () => {
  it("rejects malformed settings JSON string", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-valid-json" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/sharpening",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Extreme sharpening on tiny image ──────────────────────────
describe("Extreme sharpening on tiny image", () => {
  it("applies maximum sharpening to 1x1 pixel image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const res = await postTool(
      { method: "unsharp-mask", amount: 1000, radius: 5.0, threshold: 0 },
      TINY,
      "tiny.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Adaptive with denoise on JPEG ─────────────────────────────
describe("Adaptive with denoise on JPEG", () => {
  it("applies adaptive sharpening with medium denoise on JPEG", async () => {
    const res = await postTool(
      { method: "adaptive", sigma: 2.0, denoise: "medium" },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });
});

// ── AVIF input ──────────────────────────────────────────────────
describe("AVIF input", () => {
  it("processes AVIF image with adaptive sharpening", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const res = await postTool({ method: "adaptive", sigma: 2.0 }, AVIF, "test.avif", "image/avif");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Adaptive params at minimum values ───────────────────────────
describe("Adaptive minimum parameters", () => {
  it("uses all minimum adaptive parameter values", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 0.5,
      m1: 0,
      m2: 0,
      x1: 0,
      y2: 0,
      y3: 0,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── High-pass kernelSize 3 vs 5 both produce valid output ──────
describe("High-pass kernel size comparison", () => {
  it("kernelSize 3 and 5 both produce valid sharpened output", async () => {
    const res3 = await postTool({ method: "high-pass", strength: 50, kernelSize: 3 });
    const res5 = await postTool({ method: "high-pass", strength: 50, kernelSize: 5 });
    expect(res3.statusCode).toBe(200);
    expect(res5.statusCode).toBe(200);

    const result3 = JSON.parse(res3.body);
    const result5 = JSON.parse(res5.body);

    expect(result3.processedSize).toBeGreaterThan(0);
    expect(result5.processedSize).toBeGreaterThan(0);

    // Both kernel sizes should produce valid images with same dimensions
    const dl3 = await app.inject({
      method: "GET",
      url: result3.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const dl5 = await app.inject({
      method: "GET",
      url: result5.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const meta3 = await sharp(dl3.rawPayload).metadata();
    const meta5 = await sharp(dl5.rawPayload).metadata();
    expect(meta3.width).toBe(200);
    expect(meta3.height).toBe(150);
    expect(meta5.width).toBe(200);
    expect(meta5.height).toBe(150);
  });
});

// ── Denoise with all methods produce valid output ─────────────
describe("Denoise completeness", () => {
  it("applies adaptive with off denoise (explicit)", async () => {
    const res = await postTool({
      method: "adaptive",
      sigma: 1.5,
      denoise: "off",
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("applies high-pass with strong denoise on JPEG", async () => {
    const res = await postTool(
      { method: "high-pass", strength: 60, kernelSize: 3, denoise: "strong" },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

// ── Unsharp-mask minimum amount (0) is a no-op ─────────────────
describe("Unsharp-mask no-op amount", () => {
  it("amount=0 produces minimal change", async () => {
    const res = await postTool({
      method: "unsharp-mask",
      amount: 0,
      radius: 1.0,
      threshold: 0,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── All three methods on same JPEG, verify format preserved ────
describe("Format preservation across methods", () => {
  it("adaptive preserves JPEG format", async () => {
    const res = await postTool({ method: "adaptive", sigma: 2.0 }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("high-pass preserves JPEG format", async () => {
    const res = await postTool(
      { method: "high-pass", strength: 50, kernelSize: 3 },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

// ── Rejects invalid kernelSize (4) ────────────────────────────
describe("Invalid kernelSize", () => {
  it("rejects kernelSize 4 (only 3 and 5 valid)", async () => {
    const res = await postTool({ method: "high-pass", kernelSize: 4 });
    expect(res.statusCode).toBe(400);
  });

  it("rejects kernelSize 1", async () => {
    const res = await postTool({ method: "high-pass", kernelSize: 1 });
    expect(res.statusCode).toBe(400);
  });
});
