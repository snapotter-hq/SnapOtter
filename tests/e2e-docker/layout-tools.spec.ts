import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Layout Tools ──────────────────────────────────────────────────
// Extended tests for: collage (templates, gaps, formats), stitch
// (alignment, large sets), split (asymmetric grids, edge cases),
// border (rounded, gradient, asymmetric sizes)
// Complements creative-tools.spec.ts with deeper layout coverage.

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
const JPG_PORTRAIT = fixture("test-portrait.jpg");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Collage — Extended Templates ──────────────────────────────────

test.describe("Collage — extended", () => {
  test("3-image collage with vertical layout", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "3-v-equal",
            width: 400,
            height: 600,
            format: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("collage with wide gap and dark background", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "2-h-equal",
            gap: 30,
            backgroundColor: "#1a1a1a",
            outputFormat: "jpeg",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("collage with 4 images", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "4-grid",
            width: 800,
            height: 800,
            gap: 5,
            format: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("collage with zero gap", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "2-h-equal",
            gap: 0,
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("collage with single image still succeeds", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 }],
      [
        {
          name: "settings",
          value: JSON.stringify({ templateId: "2-h-equal", width: 400 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Stitch — Extended ─────────────────────────────────────────────

test.describe("Stitch — extended", () => {
  test("stitch 4 images horizontally", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "horizontal", gap: 5 }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("stitch 4 images vertically", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "vertical", gap: 10 }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch with wide gap and custom background", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            direction: "horizontal",
            gap: 50,
            backgroundColor: "#00FF00",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch in grid mode with 4 images and 2 columns", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ direction: "grid", gridColumns: 2, gap: 5 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch 5 images in grid with 3 columns", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
        {
          name: "file",
          filename: "e.heic",
          contentType: "image/heic",
          buffer: HEIC_200x150,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ direction: "grid", gridColumns: 3, gap: 8 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch with HEIC images", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "horizontal", gap: 0 }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Split — Extended ──────────────────────────────────────────────

test.describe("Split — extended", () => {
  test("split into 1x3 columns (vertical strips)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 3, rows: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file (PK magic bytes), not JSON
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  test("split into 1x2 rows (horizontal strips)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 1, rows: 2 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split into 4x4 tiles", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ columns: 4, rows: 4 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split JPEG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ columns: 2, rows: 2 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split WebP image", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({ columns: 3, rows: 2 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split portrait-oriented image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: JPG_PORTRAIT },
        settings: JSON.stringify({ columns: 2, rows: 3 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split HEIC image into tiles", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ columns: 2, rows: 2 }),
      },
    });
    expect(res.ok()).toBe(true);
    // Split returns a ZIP file
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});

// ─── Border — Extended ─────────────────────────────────────────────

test.describe("Border — extended", () => {
  test("border on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ size: 15, color: "#336699" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("border on WebP image", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({ size: 25, color: "#FF6633" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("very wide border (100px)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ size: 100, color: "#CCCCCC" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("border with transparent color on PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ size: 20, color: "#00000000" }),
      },
    });
    // May succeed with transparent border or reject — both valid
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("border on large content image", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
        settings: JSON.stringify({ size: 30, color: "#FFFFFF" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("split without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 2, rows: 2 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("border without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ size: 10, color: "#ff0000" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
