import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// ─── Layout Tools ──────────────────────────────────────────────────
// Extended tests for: collage (templates, gaps, formats), stitch
// (alignment, large sets), split (asymmetric grids, edge cases),
// border (rounded, gradient, asymmetric sizes)
// Complements creative-tools.spec.ts with deeper layout coverage.

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
const JPG_PORTRAIT = fixture("test-portrait.jpg");
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
            aspectRatio: "4:5",
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.downloadUrl).toContain(".png");
    expect(json.processedSize).toBeGreaterThan(0);
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 255, 255]);
    expect(pngBuf.readUInt32BE(16)).toBe(1920);
    expect(pngBuf.readUInt32BE(20)).toBe(2400);
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
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.downloadUrl).toContain(".jpg");
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const jpgBuf = Buffer.from(await dlRes.body());
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "collage.jpg", mimeType: "image/jpeg", buffer: jpgBuf },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await pngRes.body());
    const [r, g, b] = readFirstPngPixelRgb(pngBuf);
    expect(r).toBeGreaterThanOrEqual(22);
    expect(r).toBeLessThanOrEqual(30);
    expect(g).toBeGreaterThanOrEqual(22);
    expect(g).toBeLessThanOrEqual(30);
    expect(b).toBeGreaterThanOrEqual(22);
    expect(b).toBeLessThanOrEqual(30);
    expect(pngBuf.readUInt32BE(16)).toBe(2400);
    expect(pngBuf.readUInt32BE(20)).toBe(1800);
    // At (20, 20), past the default 8px gap, pixel is still #1a1a1a gap background under gap=30
    const gapCropRes = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "collage.png", mimeType: "image/png", buffer: pngBuf },
        settings: JSON.stringify({ left: 20, top: 20, width: 10, height: 10 }),
      },
    });
    expect(gapCropRes.ok()).toBe(true);
    const gapCropBody = await gapCropRes.json();
    const gapCropDl = await request.get(gapCropBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(gapCropDl.ok()).toBe(true);
    const [gr, gg, gb] = readFirstPngPixelRgb(Buffer.from(await gapCropDl.body()));
    expect(gr).toBeGreaterThanOrEqual(22);
    expect(gr).toBeLessThanOrEqual(30);
    expect(gg).toBeGreaterThanOrEqual(22);
    expect(gg).toBeLessThanOrEqual(30);
    expect(gb).toBeGreaterThanOrEqual(22);
    expect(gb).toBeLessThanOrEqual(30);
    // Cell 0 (PNG_200x150 #ff6432) starts at (30, 30); sample at (40, 40) past JPEG 8x8 block ringing
    const cellCropRes = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "collage.png", mimeType: "image/png", buffer: pngBuf },
        settings: JSON.stringify({ left: 40, top: 40, width: 10, height: 10 }),
      },
    });
    expect(cellCropRes.ok()).toBe(true);
    const cellCropBody = await cellCropRes.json();
    const cellCropDl = await request.get(cellCropBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cellCropDl.ok()).toBe(true);
    const [cr, cg, cb] = readFirstPngPixelRgb(Buffer.from(await cellCropDl.body()));
    expect(cr).toBeGreaterThanOrEqual(245);
    expect(cg).toBeGreaterThanOrEqual(95);
    expect(cg).toBeLessThanOrEqual(105);
    expect(cb).toBeGreaterThanOrEqual(45);
    expect(cb).toBeLessThanOrEqual(55);
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
            aspectRatio: "1:1",
            gap: 5,
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.downloadUrl).toContain(".png");
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 255, 255]);
    expect(pngBuf.readUInt32BE(16)).toBe(2400);
    expect(pngBuf.readUInt32BE(20)).toBe(2400);
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
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await dlRes.body());
    // With gap=0, cell 0 starts at (0, 0) so the first pixel is PNG_200x150 (#ff6432) rather than the #FFFFFF background
    expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 100, 50]);
    expect(pngBuf.readUInt32BE(16)).toBe(2400);
    expect(pngBuf.readUInt32BE(20)).toBe(1800);
  });

  test("collage with single image still succeeds", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 }],
      [
        {
          name: "settings",
          value: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "1:1" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 255, 255]);
    expect(pngBuf.readUInt32BE(16)).toBe(2400);
    expect(pngBuf.readUInt32BE(20)).toBe(2400);
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/stitch", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/split", {
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
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ borderWidth: 15, borderColor: "#336699" }),
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
    expect(readFirstPngPixelRgb(Buffer.from(await dlRes.body()))).toEqual([51, 102, 153]);
  });

  test("border on WebP image", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({ borderWidth: 25, borderColor: "#FF6633" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("very wide border (100px)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ borderWidth: 100, borderColor: "#CCCCCC" }),
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
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "wide-border.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from(await dlRes.body()),
        },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(300);
    expect(infoBody.height).toBe(300);
  });

  test("border with transparent color on PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ borderWidth: 20, borderColor: "#00000000" }),
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("border on large content image", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
        settings: JSON.stringify({ borderWidth: 30, borderColor: "#FFFFFF" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Collage — Output Verification ──────────────────────────────

test.describe("Collage — output verification", () => {
  test("collage output can be downloaded", async ({ request }) => {
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
            aspectRatio: "3:2",
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();

    // Verify the collage can be downloaded
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(readFirstPngPixelRgb(buffer)).toEqual([255, 255, 255]);
    expect(buffer.readUInt32BE(16)).toBe(2400);
    expect(buffer.readUInt32BE(20)).toBe(1600);
  });

  test("collage with HEIC images", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "2-h-equal",
            aspectRatio: "16:9",
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const pngBuf = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 255, 255]);
    expect(pngBuf.readUInt32BE(16)).toBe(2400);
    expect(pngBuf.readUInt32BE(20)).toBe(1350);
    // Verify cell 0 rendered the decoded HEIC image (#ff6433) past the 8px gap
    const cellCropRes = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "collage.png", mimeType: "image/png", buffer: pngBuf },
        settings: JSON.stringify({ left: 10, top: 10, width: 10, height: 10 }),
      },
    });
    expect(cellCropRes.ok()).toBe(true);
    const cellCropBody = await cellCropRes.json();
    const cellCropDl = await request.get(cellCropBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cellCropDl.ok()).toBe(true);
    const [hr, hg, hb] = readFirstPngPixelRgb(Buffer.from(await cellCropDl.body()));
    expect(hr).toBeGreaterThanOrEqual(250);
    expect(hg).toBeGreaterThanOrEqual(95);
    expect(hg).toBeLessThanOrEqual(105);
    expect(hb).toBeGreaterThanOrEqual(45);
    expect(hb).toBeLessThanOrEqual(55);
  });
});

// ─── Stitch — Output Verification ───────────────────────────────

test.describe("Stitch — output verification", () => {
  test("stitched image can be downloaded", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "horizontal", gap: 0 }) }],
    );
    const res = await request.post("/api/v1/tools/image/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();

    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
  });
});

// ─── Border — Output Verification ───────────────────────────────

test.describe("Border — output verification", () => {
  test("bordered image can be downloaded and is larger", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ borderWidth: 20, borderColor: "#FF0000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();

    // Download and verify the bordered image
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(readFirstPngPixelRgb(buffer)).toEqual([255, 0, 0]);
  });

  test("border with minimum size (1px)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ borderWidth: 1, borderColor: "#000000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "min-border.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from(await dlRes.body()),
        },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(102);
    expect(infoBody.height).toBe(102);
  });
});

// ─── Collage -- All Template Types ─────────────────────────────

test.describe("Collage -- template types", () => {
  const templates = [
    { id: "2-h-equal", images: 2, label: "2-horizontal-equal" },
    { id: "2-v-equal", images: 2, label: "2-vertical-equal" },
    { id: "3-v-equal", images: 3, label: "3-vertical-equal" },
    { id: "3-left-large", images: 3, label: "3-left-large" },
    { id: "4-grid", images: 4, label: "4-grid" },
  ] as const;

  const imagePool = [
    { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
    { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
    { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
    { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_PORTRAIT },
  ];

  for (const tmpl of templates) {
    test(`collage with template ${tmpl.label}`, async ({ request }) => {
      const files = imagePool.slice(0, tmpl.images);
      const { body, contentType } = buildMultipart(files, [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: tmpl.id,
            aspectRatio: "1:1",
            gap: 5,
            outputFormat: "png",
          }),
        },
      ]);
      const res = await request.post("/api/v1/tools/image/collage", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        data: body,
      });
      expect(res.ok(), `collage with template ${tmpl.label} should succeed`).toBe(true);
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
      expect(json.processedSize).toBeGreaterThan(0);
      const dlRes = await request.get(json.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const pngBuf = Buffer.from(await dlRes.body());
      expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 255, 255]);
      expect(pngBuf.readUInt32BE(16)).toBe(2400);
      expect(pngBuf.readUInt32BE(20)).toBe(2400);
    });
  }
});

// ─── Collage -- Background Colors ──────────────────────────────

test.describe("Collage -- background colors", () => {
  const bgColors = ["#FFFFFF", "#000000", "#FF0000", "#1a1a2e"] as const;
  const expectedBgRgb: Record<(typeof bgColors)[number], [number, number, number]> = {
    "#FFFFFF": [255, 255, 255],
    "#000000": [0, 0, 0],
    "#FF0000": [255, 0, 0],
    "#1a1a2e": [26, 26, 46],
  };

  for (const bg of bgColors) {
    test(`collage with background ${bg}`, async ({ request }) => {
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
              gap: 10,
              backgroundColor: bg,
              outputFormat: "png",
            }),
          },
        ],
      );
      const res = await request.post("/api/v1/tools/image/collage", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        data: body,
      });
      expect(res.ok(), `collage with bg=${bg} should succeed`).toBe(true);
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
      const dlRes = await request.get(json.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const pngBuf = Buffer.from(await dlRes.body());
      expect(readFirstPngPixelRgb(pngBuf)).toEqual(expectedBgRgb[bg]);
      expect(pngBuf.readUInt32BE(16)).toBe(2400);
      expect(pngBuf.readUInt32BE(20)).toBe(1800);
    });
  }
});

// ─── Stitch -- Alignment Options ───────────────────────────────

test.describe("Stitch -- alignment options", () => {
  test("stitch horizontal with start alignment", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ direction: "horizontal", gap: 5, alignment: "start" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch vertical with end alignment", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ direction: "vertical", gap: 5, alignment: "end" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch horizontal with center alignment", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ direction: "horizontal", gap: 0, alignment: "center" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Split -- Grid Variations ──────────────────────────────────

test.describe("Split -- grid variations", () => {
  test("split into 1x1 (single tile returns full image)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 1, rows: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    // ZIP magic bytes
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split into 5x5 tiles", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 5, rows: 5 }),
      },
    });
    expect(res.ok()).toBe(true);
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split into 2x5 tiles (more rows than columns)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 2, rows: 5 }),
      },
    });
    expect(res.ok()).toBe(true);
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test("split into 10x1 columns", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 10, rows: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});

// ─── Border -- Width and Color Variations ──────────────────────

test.describe("Border -- width and color variations", () => {
  const borderSizes = [1, 5, 20, 50, 100] as const;

  for (const size of borderSizes) {
    test(`border with size=${size}px`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/border", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({ borderWidth: size, borderColor: "#FF6633" }),
        },
      });
      expect(res.ok(), `border with size=${size} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const pngBuf = Buffer.from(await dlRes.body());
      expect(readFirstPngPixelRgb(pngBuf)).toEqual([255, 102, 51]);
      expect(pngBuf.readUInt32BE(16)).toBe(200 + size * 2);
      expect(pngBuf.readUInt32BE(20)).toBe(150 + size * 2);
    });
  }

  const borderColors = ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF"] as const;
  const expectedJpegBorderRgb: Record<
    (typeof borderColors)[number],
    [[number, number], [number, number], [number, number]]
  > = {
    "#000000": [
      [0, 5],
      [0, 5],
      [0, 5],
    ],
    "#FFFFFF": [
      [250, 255],
      [250, 255],
      [250, 255],
    ],
    "#FF0000": [
      [240, 255],
      [0, 10],
      [0, 10],
    ],
    "#00FF00": [
      [0, 10],
      [240, 255],
      [0, 10],
    ],
    "#0000FF": [
      [0, 10],
      [0, 10],
      [240, 255],
    ],
  };

  for (const color of borderColors) {
    test(`border with color=${color}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/border", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
          settings: JSON.stringify({ borderWidth: 10, borderColor: color }),
        },
      });
      expect(res.ok(), `border with color=${color} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      const dlRes = await request.get(body.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const convRes = await request.post("/api/v1/tools/image/convert", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: "bordered.jpg",
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
      const [r, g, b] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
      const [[minR, maxR], [minG, maxG], [minB, maxB]] = expectedJpegBorderRgb[color];
      expect(r).toBeGreaterThanOrEqual(minR);
      expect(r).toBeLessThanOrEqual(maxR);
      expect(g).toBeGreaterThanOrEqual(minG);
      expect(g).toBeLessThanOrEqual(maxG);
      expect(b).toBeGreaterThanOrEqual(minB);
      expect(b).toBeLessThanOrEqual(maxB);
    });
  }
});

// ─── Border -- Dimension Verification ──────────────────────────

test.describe("Border -- dimension verification", () => {
  test("bordered image dimensions increase by 2x border size", async ({ request }) => {
    const borderSize = 20;
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ borderWidth: borderSize, borderColor: "#FF0000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // Download and check dimensions
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(buffer)).toEqual([255, 0, 0]);

    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "bordered.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    // 200 + 20*2 = 240, 150 + 20*2 = 190
    expect(infoBody.width).toBe(200 + borderSize * 2);
    expect(infoBody.height).toBe(150 + borderSize * 2);
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("split without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/split", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 2, rows: 2 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("border without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ borderWidth: 10, borderColor: "#ff0000" }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("collage without token returns 401", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "1:1" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/collage", {
      headers: { "Content-Type": contentType },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test("stitch without token returns 401", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "horizontal" }) }],
    );
    const res = await request.post("/api/v1/tools/image/stitch", {
      headers: { "Content-Type": contentType },
      data: body,
    });
    expect(res.status()).toBe(401);
  });
});
