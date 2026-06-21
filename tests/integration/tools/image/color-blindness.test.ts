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
const _WEBP = readFixture(fixtures.image.base.webp50);

const ALL_TYPES = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "protanomaly",
  "deuteranomaly",
  "tritanomaly",
  "achromatopsia",
  "blueConeMonochromacy",
] as const;

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
    url: "/api/v1/tools/image/color-blindness",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

describe("Default settings", () => {
  it("processes with default settings (deuteranomaly)", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

describe("All 8 simulation types", () => {
  for (const type of ALL_TYPES) {
    it(`processes with simulationType=${type}`, async () => {
      const res = await postTool({ simulationType: type });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    });
  }

  it("different types produce different outputs", async () => {
    const buffers: Buffer[] = [];
    for (const type of ["protanopia", "tritanopia", "achromatopsia"] as const) {
      const res = await postTool({ simulationType: type });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      buffers.push(dlRes.rawPayload);
    }
    const pixelSets = await Promise.all(
      buffers.map(async (buf) => {
        const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        return `${data[0]},${data[1]},${data[2]}`;
      }),
    );
    const unique = new Set(pixelSets);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("Dimension preservation", () => {
  it("output has same dimensions as input", async () => {
    const res = await postTool({ simulationType: "protanopia" });
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

describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool({ simulationType: "deuteranopia" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("processes WebP input", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const res = await postTool({ simulationType: "tritanopia" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
  });

  it("processes HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const res = await postTool({ simulationType: "protanomaly" }, HEIC, "photo.heic", "image/heic");
    expect(res.statusCode).toBe(200);
  });

  it("processes SVG input", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const res = await postTool(
      { simulationType: "achromatopsia" },
      SVG,
      "icon.svg",
      "image/svg+xml",
    );
    expect(res.statusCode).toBe(200);
  });

  it("processes animated GIF input", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const res = await postTool({ simulationType: "deuteranomaly" }, GIF, "anim.gif", "image/gif");
    expect(res.statusCode).toBe(200);
  });
});

describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ simulationType: "protanopia" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-blindness",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid simulationType value", async () => {
    const res = await postTool({ simulationType: "invalid-type" });
    expect(res.statusCode).toBe(400);
  });
});

describe("Edge cases", () => {
  it("processes 1x1 pixel image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const res = await postTool({ simulationType: "deuteranomaly" }, TINY, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("processes stress-large.jpg", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const res = await postTool({ simulationType: "protanopia" }, LARGE, "large.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

describe("Authentication", () => {
  it("rejects unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({ simulationType: "protanopia" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-blindness",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("Format preservation", () => {
  it("preserves JPEG format for JPEG input", async () => {
    const res = await postTool({ simulationType: "protanopia" }, JPG, "test.jpg", "image/jpeg");
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

  it("preserves PNG format for PNG input", async () => {
    const res = await postTool({ simulationType: "deuteranopia" }, PNG, "test.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });
});

describe("Response structure", () => {
  it("returns all expected fields in 200 response", async () => {
    const res = await postTool({ simulationType: "tritanopia" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.originalSize).toBe("number");
    expect(typeof result.processedSize).toBe("number");
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

describe("Empty and corrupt file handling", () => {
  it("returns 400 for empty file upload", async () => {
    const res = await postTool(
      { simulationType: "protanopia" },
      Buffer.alloc(0),
      "empty.png",
      "image/png",
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for corrupt image data", async () => {
    const res = await postTool(
      { simulationType: "deuteranopia" },
      Buffer.from("this is not an image file"),
      "corrupt.png",
      "image/png",
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("Invalid settings JSON", () => {
  it("returns 400 for malformed settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-valid-json{{{" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-blindness",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Cross-format inputs from fixtures/formats", () => {
  it("processes AVIF input", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const res = await postTool(
      { simulationType: "protanomaly" },
      AVIF,
      "sample.avif",
      "image/avif",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("processes TIFF input", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const res = await postTool(
      { simulationType: "tritanomaly" },
      TIFF,
      "sample.tiff",
      "image/tiff",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("processes GIF input from formats", async () => {
    const GIF = readFixture(fixtures.image.formats("gif"));
    const res = await postTool({ simulationType: "achromatopsia" }, GIF, "sample.gif", "image/gif");
    expect(res.statusCode).toBe(200);
  });
});

describe("HEIF input", () => {
  it("processes HEIF (sample.heif) input", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.formats("heif"));
    const res = await postTool(
      { simulationType: "blueConeMonochromacy" },
      HEIF,
      "sample.heif",
      "image/heif",
    );
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });
});

describe("Achromatopsia output verification", () => {
  it("achromatopsia produces grayscale-like output", async () => {
    // Create a colorful image
    const colorful = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const res = await postTool(
      { simulationType: "achromatopsia" },
      colorful,
      "red.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { data } = await sharp(dlRes.rawPayload)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Achromatopsia should make R, G, B channels similar (grayscale)
    const r = data[0];
    const g = data[1];
    const b = data[2];
    expect(Math.abs(r - g)).toBeLessThan(30);
    expect(Math.abs(g - b)).toBeLessThan(30);
  });
});
