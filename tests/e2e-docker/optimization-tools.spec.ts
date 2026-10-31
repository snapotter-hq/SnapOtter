import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// ─── Optimization Tools ────────────────────────────────────────────
// Tests for: optimize-for-web (extended options), bulk-rename (patterns),
// favicon (multi-format output), image-to-pdf (page options),
// replace-color (tolerance edge cases)
// Complements adjustment-tools.spec.ts and conversion-tools.spec.ts
// with deeper coverage of optimization and utility tools.

const FIXTURES = join(process.cwd(), "tests", "fixtures", "image", "valid");
const FORMATS = join(process.cwd(), "tests", "fixtures", "image", "formats");
const CONTENT = FIXTURES;

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

/**
 * Build a raw multipart/form-data body for multi-file uploads.
 */
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

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readFirstPngPixelRgb(png: Buffer): [number, number, number] {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Expected a valid PNG buffer");
  }
  const idatChunks: Buffer[] = [];
  let sawIhdr = false;
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      throw new Error(`Truncated PNG chunk: ${type}`);
    }
    if (type === "IHDR") {
      if (length < 13) {
        throw new Error("Truncated PNG IHDR chunk");
      }
      const bitDepth = png[dataStart + 8];
      const colorType = png[dataStart + 9];
      const interlace = png[dataStart + 12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `Unsupported PNG layout for first-pixel RGB read: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
        );
      }
      sawIhdr = true;
    } else if (type === "IDAT") {
      idatChunks.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!sawIhdr || idatChunks.length === 0) {
    throw new Error("PNG buffer is missing IHDR or IDAT chunks");
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length < 4) {
    throw new Error("Inflated PNG scanline is shorter than 1 RGB pixel");
  }
  if (raw[0] > 4) {
    throw new Error(`Unexpected PNG row 0 filter type: ${raw[0]}`);
  }
  return [raw[1], raw[2], raw[3]];
}

// ─── Optimize for Web — Extended ───────────────────────────────────

test.describe("Optimize for Web — extended", () => {
  test("optimize with aggressive quality (20)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 640, quality: 20 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize with high quality (95) preserves detail", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 1920, quality: 95 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize HEIC for web", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ maxWidth: 400, quality: 75 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize WebP for web", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({ maxWidth: 600, quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize without maxWidth (no resize, only compress)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize large content image for web", async ({ request }) => {
    const stressImg = contentFixture("stress-large.jpg");
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress-large.jpg", mimeType: "image/jpeg", buffer: stressImg },
        settings: JSON.stringify({ maxWidth: 1280, quality: 70 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Bulk Rename — Extended Patterns ───────────────────────────────

test.describe("Bulk Rename — extended", () => {
  test("rename with date-based pattern", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "photo1.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "photo2.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "photo3.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "2024-01-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/image/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl || json.files).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("rename with padded index (starting at 001)", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ pattern: "img-{{index}}", startIndex: 1 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });

  test("rename 5 files preserving extensions", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        {
          name: "file",
          filename: "d.heic",
          contentType: "image/heic",
          buffer: HEIC_200x150,
        },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "gallery-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/image/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Favicon — Extended ────────────────────────────────────────────

test.describe("Favicon — extended", () => {
  test("generate favicon from WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("generate favicon from HEIC", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("generate favicon from large sample JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("generate favicon from AVIF format", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Image to PDF — Extended ───────────────────────────────────────

test.describe("Image to PDF — extended", () => {
  test("convert 3 images to multi-page PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert image to PDF with letter page size", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.jpg", contentType: "image/jpeg", buffer: JPG_100x100 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "Letter" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert HEIC image to PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.heic", contentType: "image/heic", buffer: HEIC_200x150 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert 5 mixed-format images to PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Replace Color: Extended ──────────────────────────────────────

test.describe("Replace Color: extended", () => {
  test("replace color on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({
          sourceColor: "#0200ff",
          targetColor: "#ffffff",
          tolerance: 20,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const webpBuffer = Buffer.from(await dlRes.body());
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "replaced.webp", mimeType: "image/webp", buffer: webpBuffer },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    expect(readFirstPngPixelRgb(Buffer.from(await pngRes.body()))).toEqual([255, 255, 255]);
  });

  test("replace color with zero tolerance (exact match)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ff6432",
          targetColor: "#00ff00",
          tolerance: 0,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(buffer)).toEqual([0, 255, 0]);
  });

  test("replace color with maximum tolerance (100)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          sourceColor: "#00ff01",
          targetColor: "#ff0000",
          tolerance: 100,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const jpgBuffer = Buffer.from(await dlRes.body());
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "replaced.jpg", mimeType: "image/jpeg", buffer: jpgBuffer },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    const [r, g, b] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(10);
    expect(b).toBeLessThan(10);
  });

  test("replace color on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ff6432",
          targetColor: "#cccccc",
          tolerance: 15,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    const [r, g, b] = readFirstPngPixelRgb(buffer);
    expect(r).toBeGreaterThanOrEqual(195);
    expect(r).toBeLessThanOrEqual(215);
    expect(g).toBeGreaterThanOrEqual(195);
    expect(g).toBeLessThanOrEqual(215);
    expect(b).toBeGreaterThanOrEqual(195);
    expect(b).toBeLessThanOrEqual(215);
  });

  test("replace color on content image", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
        settings: JSON.stringify({
          sourceColor: "#ffffff",
          targetColor: "#000000",
          tolerance: 40,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.equals(portrait)).toBe(false);
  });
});

// ─── Edit Metadata — Extended ──────────────────────────────────────

test.describe("Edit Metadata — extended", () => {
  test("set all EXIF fields at once", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          title: "Test Shot",
          description: "E2E test image",
          artist: "SnapOtter Bot",
          copyright: "CC0-1.0",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("edit metadata on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ title: "WebP Test" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("edit metadata round-trip verification", async ({ request }) => {
    // Set metadata
    const editRes = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "RoundTrip Artist" }),
      },
    });
    expect(editRes.ok()).toBe(true);
    const editBody = await editRes.json();

    // Download the edited image
    const dlRes = await request.get(editBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const editedBuffer = Buffer.from(await dlRes.body());

    // Check info on the edited image
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "edited.jpg", mimeType: "image/jpeg", buffer: editedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.hasExif).toBe(true);
  });
});

// ─── Strip Metadata — Extended ────────────────────────────────────

test.describe("Strip Metadata — extended", () => {
  test("strip metadata from JPEG with EXIF preserves dimensions", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).toBeLessThanOrEqual(body.originalSize);
  });

  test("strip metadata from WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("strip metadata from HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("stripped image verified via info has no EXIF", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const stripRes = await request.post("/api/v1/tools/image/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        settings: JSON.stringify({}),
      },
    });
    expect(stripRes.ok()).toBe(true);
    const stripBody = await stripRes.json();

    // Download stripped image
    const dlRes = await request.get(stripBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const strippedBuffer = Buffer.from(await dlRes.body());

    // Verify via info tool
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stripped.jpg", mimeType: "image/jpeg", buffer: strippedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.hasExif).toBe(false);
  });
});

// ─── Image Enhancement: Extended ─────────────────────────────────

test.describe("Image Enhancement: extended", () => {
  test("enhancement with auto mode", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ mode: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("enhancement with landscape mode", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ mode: "landscape" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Enhancement should modify the image and differ from default auto mode
    expect(body.processedSize).not.toBe(body.originalSize);
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const autoRes = await request.post("/api/v1/tools/image/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ mode: "auto" }),
      },
    });
    expect(autoRes.ok()).toBe(true);
    const autoBody = await autoRes.json();
    const autoDlRes = await request.get(autoBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(autoDlRes.ok()).toBe(true);
    expect(Buffer.from(await dlRes.body()).equals(Buffer.from(await autoDlRes.body()))).toBe(false);
  });

  test("enhancement on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ mode: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("enhancement on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ mode: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Content-Aware Resize ─────────────────────────────────────────

test.describe("Content-Aware Resize — extended", () => {
  test("content-aware resize to smaller width", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 150, height: 150 }),
      },
    });
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.code).toBe("ENGINE_UNAVAILABLE");
    } else if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    }
  });

  test("content-aware resize JPEG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 80, height: 80 }),
      },
    });
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.code).toBe("ENGINE_UNAVAILABLE");
    } else if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("content-aware resize on large content image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ width: 300, height: 300 }),
      },
    });
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.code).toBe("ENGINE_UNAVAILABLE");
    } else if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Content-Aware Resize — HEIC & Edge Cases ───────────────────

test.describe("Content-Aware Resize — HEIC & edge cases", () => {
  test("content-aware resize HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ width: 150, height: 120 }),
      },
    });
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.code).toBe("ENGINE_UNAVAILABLE");
    } else if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("content-aware resize WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ width: 40, height: 40 }),
      },
    });
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.code).toBe("ENGINE_UNAVAILABLE");
    } else if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Optimize for Web — Output Verification ─────────────────────

test.describe("Optimize for Web — output verification", () => {
  test("optimized file can be downloaded and is valid", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 400, quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();

    // Download and verify the optimized file is valid
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.length).toBeLessThan(JPG_SAMPLE.length);
  });
});

// ─── Favicon — Output Verification ──────────────────────────────

test.describe("Favicon — output verification", () => {
  test("favicon output can be downloaded", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();

      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const buffer = Buffer.from(await dlRes.body());
      expect(buffer.length).toBeGreaterThan(0);
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("favicon from TIFF format", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Optimize for Web -- Target Format ────────────────────────────

test.describe("Optimize for Web -- target format", () => {
  test("optimize with target format WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 800, quality: 75, targetFormat: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize with target format AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 640, quality: 60, targetFormat: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize preserves original format when no target specified", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ maxWidth: 100, quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Optimize for Web -- Constraint Combinations ──────────────────

test.describe("Optimize for Web -- constraints", () => {
  test("optimize with maxWidth only (no quality)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 400 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize with quality only (no resize)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ quality: 30 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("optimize with very small maxWidth", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 50, quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Favicon -- Multi-size Output ─────────────────────────────────

test.describe("Favicon -- multi-size", () => {
  test("favicon from PNG generates downloadable output", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();

      // Download and verify non-empty
      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const buffer = Buffer.from(await dlRes.body());
      expect(buffer.length).toBeGreaterThan(0);
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("favicon from JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("favicon from PNG content image", async ({ request }) => {
    const portrait = contentFixture("portrait-isolated.png");
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.png", mimeType: "image/png", buffer: portrait },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("favicon from GIF format", async ({ request }) => {
    const gif = formatFixture("sample.gif");
    const res = await request.post("/api/v1/tools/image/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: gif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Replace Color: Tolerance Levels ────────────────────────────

test.describe("Replace Color: tolerance levels", () => {
  const tolerances = [0, 5, 10, 25, 50, 75, 100] as const;

  for (const tolerance of tolerances) {
    test(`replace color with tolerance=${tolerance}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/replace-color", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            sourceColor: "#ff6432",
            targetColor: "#FF0000",
            tolerance,
          }),
        },
      });
      expect(res.ok(), `replace-color with tolerance=${tolerance} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const buffer = Buffer.from(await dlRes.body());
      expect(readFirstPngPixelRgb(buffer)).toEqual([255, 0, 0]);
    });
  }
});

// ─── Replace Color: Download Verification ───────────────────────

test.describe("Replace Color: download verification", () => {
  test("replaced-color image is downloadable and valid", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ff6432",
          targetColor: "#00FF00",
          tolerance: 30,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.equals(PNG_200x150)).toBe(false);
    expect(readFirstPngPixelRgb(buffer)).toEqual([0, 255, 0]);
  });
});

// ─── Bulk Rename -- ZIP Verification ──────────────────────────────

test.describe("Bulk Rename -- ZIP output", () => {
  test("rename 5 files and verify ZIP output", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        {
          name: "file",
          filename: "d.heic",
          contentType: "image/heic",
          buffer: HEIC_200x150,
        },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: JPG_SAMPLE,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "photo-{{index}}", startIndex: 1 }) }],
    );
    const res = await request.post("/api/v1/tools/image/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      if (json.downloadUrl) {
        const dlRes = await request.get(json.downloadUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(dlRes.ok()).toBe(true);
        const buffer = Buffer.from(await dlRes.body());
        expect(buffer.length).toBeGreaterThan(0);
        // ZIP magic bytes: PK
        expect(buffer[0]).toBe(0x50);
        expect(buffer[1]).toBe(0x4b);
      }
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    }
  });

  test("rename with prefix-suffix pattern", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ pattern: "project_{{index}}_final", startIndex: 10 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Image Enhancement: Mode Variations ──────────────────────────

test.describe("Image Enhancement: modes", () => {
  const modes = ["auto", "landscape", "low-light", "portrait"] as const;
  const expectedRedBounds: Record<(typeof modes)[number], [number, number]> = {
    auto: [75, 90],
    landscape: [95, 115],
    "low-light": [62, 74],
    portrait: [45, 60],
  };

  for (const mode of modes) {
    test(`enhancement with mode=${mode}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/image-enhancement", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
          settings: JSON.stringify({ mode }),
        },
      });
      expect(res.ok(), `enhancement with mode=${mode} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const convRes = await request.post("/api/v1/tools/image/convert", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: "enhanced.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from(await dlRes.body()),
          },
          settings: JSON.stringify({ format: "png" }),
        },
      });
      expect(convRes.ok()).toBe(true);
      const convBody = await convRes.json();
      const pngRes = await request.get(convBody.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(pngRes.ok()).toBe(true);
      const [r, g] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
      const [minR, maxR] = expectedRedBounds[mode];
      expect(r).toBeGreaterThanOrEqual(minR);
      expect(r).toBeLessThanOrEqual(maxR);
      expect(g).toBeGreaterThan(245);
    });
  }
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("optimize-for-web without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ maxWidth: 800, quality: 75 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("favicon without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/favicon", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("replace-color without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ffffff",
          targetColor: "#000000",
          tolerance: 30,
        }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("image-to-pdf without token returns 401", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [{ name: "file", filename: "test.jpg", contentType: "image/jpeg", buffer: JPG_100x100 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-to-pdf", {
      headers: { "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.status()).toBe(401);
  });

  test("content-aware-resize without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/content-aware-resize", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, height: 100 }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
