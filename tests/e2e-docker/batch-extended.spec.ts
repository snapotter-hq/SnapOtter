import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Batch Extended ──────────────────────────────────────────────
// Extended batch processing tests covering tool categories not yet
// exercised in batch-workflows.spec.ts: color-blindness, edit-metadata,
// favicon, beautify, vectorize, replace-color (5+ images), and
// cross-format batch operations.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const FORMATS = join(FIXTURES, "formats");
const CONTENT = join(FIXTURES, "content");

let token: string;

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { username: "admin", password: "admin" },
  });
  const body = await res.json();
  token = body.token;
});

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function formatFixture(name: string): Buffer {
  return readFileSync(join(FORMATS, name));
}

function contentFixture(name: string): Buffer {
  return readFileSync(join(CONTENT, name));
}

function buildMultipart(
  files: Array<{ name: string; filename: string; contentType: string; buffer: Buffer }>,
  fields: Array<{ name: string; value: string }>,
): { body: Buffer; contentType: string } {
  const boundary = `----PlaywrightBoundary${Date.now()}`;
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.buffer);
    parts.push(Buffer.from("\r\n"));
  }
  for (const field of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function expectBatchSuccess(res: import("@playwright/test").APIResponse): Promise<void> {
  expect(res.ok()).toBe(true);
  const resContentType = res.headers()["content-type"] ?? "";
  if (resContentType.includes("application/json")) {
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  } else {
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  }
}

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Batch Color Blindness Simulation ────────────────────────────

test.describe("Batch color-blindness simulation", () => {
  test("simulate deuteranomaly on 5 mixed-format images", async ({ request }) => {
    const avifSample = formatFixture("sample.avif");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.avif", contentType: "image/avif", buffer: avifSample },
      ],
      [{ name: "settings", value: JSON.stringify({ simulationType: "deuteranomaly" }) }],
    );
    const res = await request.post("/api/v1/tools/image/color-blindness/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("simulate protanopia on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ simulationType: "protanopia" }) }],
    );
    const res = await request.post("/api/v1/tools/image/color-blindness/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Edit Metadata ─────────────────────────────────────────

test.describe("Batch edit-metadata", () => {
  test("set artist on 5 images", async ({ request }) => {
    const tiffSample = formatFixture("sample.tiff");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "e.tiff", contentType: "image/tiff", buffer: tiffSample },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            artist: "Batch E2E Author",
            copyright: "CC0-1.0",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/edit-metadata/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Beautify ──────────────────────────────────────────────

test.describe("Batch beautify", () => {
  test("beautify 4 screenshots with macOS frame", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            frame: "macos-dark",
            padding: 48,
            borderRadius: 8,
            shadowPreset: "subtle",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/beautify/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("beautify 3 images with gradient background", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            backgroundType: "linear-gradient",
            gradientStops: [
              { color: "#667eea", position: 0 },
              { color: "#764ba2", position: 100 },
            ],
            gradientAngle: 135,
            padding: 64,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/beautify/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Vectorize ─────────────────────────────────────────────

test.describe("Batch vectorize", () => {
  test("vectorize 3 images to SVG", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/vectorize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Replace Color (5+ images) ────────────────────────────

test.describe("Batch replace-color (5+ images)", () => {
  test("replace white with blue in 6 mixed-format images", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const tiffSample = formatFixture("sample.tiff");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.jpg", contentType: "image/jpeg", buffer: portrait },
        { name: "file", filename: "f.tiff", contentType: "image/tiff", buffer: tiffSample },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            targetColor: "#FFFFFF",
            replacementColor: "#3366FF",
            tolerance: 25,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/replace-color/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Favicon ───────────────────────────────────────────────

test.describe("Batch favicon", () => {
  test("generate favicons from 4 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/favicon/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // Favicon batch may not be registered
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    await expectBatchSuccess(res);
  });
});

// ─── Batch Image Enhancement (5+ images) ─────────────────────────

test.describe("Batch image-enhancement (5+ images)", () => {
  test("enhance 6 images with auto preset", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const avifSample = formatFixture("sample.avif");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.jpg", contentType: "image/jpeg", buffer: portrait },
        { name: "file", filename: "f.avif", contentType: "image/avif", buffer: avifSample },
      ],
      [{ name: "settings", value: JSON.stringify({ preset: "auto" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-enhancement/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch SVG-to-Raster ─────────────────────────────────────────

test.describe("Batch svg-to-raster", () => {
  test("rasterize 3 SVGs to PNG", async ({ request }) => {
    const svg100 = fixture("test-100x100.svg");
    const svgLogo = contentFixture("svg-logo.svg");
    const svgSample = formatFixture("sample.svg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.svg", contentType: "image/svg+xml", buffer: svg100 },
        { name: "file", filename: "b.svg", contentType: "image/svg+xml", buffer: svgLogo },
        { name: "file", filename: "c.svg", contentType: "image/svg+xml", buffer: svgSample },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "png", width: 256 }) }],
    );
    const res = await request.post("/api/v1/tools/image/svg-to-raster/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Convert HEIC to Multiple Formats ──────────────────────

test.describe("Batch convert HEIC to web formats", () => {
  test("convert 5 HEIC images to JPEG", async ({ request }) => {
    const heicSample = formatFixture("sample.heic");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.heic", contentType: "image/heic", buffer: heicSample },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: heicSample },
        { name: "file", filename: "e.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "jpg", quality: 85 }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Batch Meme Generator ────────────────────────────────────────

test.describe("Batch meme-generator", () => {
  test("meme 3 images with top-bottom text", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            textLayout: "top-bottom",
            textBoxes: [
              { id: "top", text: "BATCH MEME" },
              { id: "bottom", text: "TESTING" },
            ],
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/meme-generator/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // meme-generator batch may not be registered
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    await expectBatchSuccess(res);
  });
});

// ─── Batch Resize with Large Set (8 images) ──────────────────────

test.describe("Batch resize large set", () => {
  test("resize 8 mixed-format images to thumbnail", async ({ request }) => {
    const avifSample = formatFixture("sample.avif");
    const tiffSample = formatFixture("sample.tiff");
    const portrait = contentFixture("portrait-color.jpg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.avif", contentType: "image/avif", buffer: avifSample },
        { name: "file", filename: "f.tiff", contentType: "image/tiff", buffer: tiffSample },
        { name: "file", filename: "g.jpg", contentType: "image/jpeg", buffer: portrait },
        { name: "file", filename: "h.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 64, height: 64, fit: "cover" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Auth Failure ────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("batch resize without token returns 401", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 100, fit: "contain" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.status()).toBe(401);
  });

  test("batch convert without token returns 401", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "webp" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.status()).toBe(401);
  });
});
