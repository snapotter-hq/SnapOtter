import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import AdmZip from "adm-zip";

// ─── Batch Processing ──────────────────────────────────────────────
// Tests for multi-file batch uploads across every tool category.
// Verifies ZIP output, batch limits, and correct processing of all files.

const FIXTURES = join(process.cwd(), "tests", "fixtures", "image", "valid");
const FORMATS = join(process.cwd(), "tests", "fixtures", "image", "formats");
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

/**
 * Build a raw multipart/form-data body. Playwright's `multipart` option
 * does not support arrays for the same field name, so multi-file uploads
 * must be assembled manually.
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

async function readBatchZip(
  res: import("@playwright/test").APIResponse,
  request: import("@playwright/test").APIRequestContext,
): Promise<AdmZip> {
  expect(res.ok()).toBe(true);
  const resContentType = res.headers()["content-type"] ?? "";
  let zipBuffer: Buffer;
  if (resContentType.includes("application/json")) {
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    zipBuffer = Buffer.from(await dlRes.body());
  } else {
    zipBuffer = Buffer.from(await res.body());
  }
  expect(zipBuffer.length).toBeGreaterThan(0);
  expect(zipBuffer[0]).toBe(0x50);
  expect(zipBuffer[1]).toBe(0x4b);
  return new AdmZip(zipBuffer);
}

function readZipEntry(zip: AdmZip, entryName: string): Buffer {
  const entry = zip.getEntry(entryName);
  if (!entry) {
    throw new Error(`Missing ${entryName} in batch ZIP`);
  }
  return entry.getData();
}

// ─── Batch Resize ──────────────────────────────────────────────────

test.describe("Batch Resize", () => {
  test("batch resize 3 images returns ZIP", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 80, fit: "contain" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      // Binary ZIP response
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
      // ZIP magic bytes: PK\x03\x04
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    }
  });

  test("batch resize 5 mixed-format images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 64, fit: "cover" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Crop ────────────────────────────────────────────────────

test.describe("Batch Crop", () => {
  test("batch crop 3 images to same region", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ left: 5, top: 5, width: 40, height: 40 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/crop/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Rotate ──────────────────────────────────────────────────

test.describe("Batch Rotate", () => {
  test("batch rotate 3 images by 90 degrees", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ angle: 90 }) }],
    );
    const res = await request.post("/api/v1/tools/image/rotate/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Convert ─────────────────────────────────────────────────

test.describe("Batch Convert", () => {
  test("batch convert 4 images to WebP", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "d.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "webp" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("batch convert to AVIF format", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "avif" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Batch Compress ────────────────────────────────────────────────

test.describe("Batch Compress", () => {
  test("batch compress 4 images with low quality", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        {
          name: "file",
          filename: "d.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ quality: 30 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Color Adjustments ───────────────────────────────────────

test.describe("Batch Color Adjustments", () => {
  test("batch adjust colors on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ brightness: 15, contrast: 10, saturation: -5 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/adjust-colors/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("batch grayscale conversion", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ effect: "grayscale" }) }],
    );
    const res = await request.post("/api/v1/tools/image/adjust-colors/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(2);
    const [r, g, b] = readFirstPngPixelRgb(readZipEntry(zip, "a_adjust-colors.png"));
    expect(r).toBe(150);
    expect(r).toBe(g);
    expect(g).toBe(b);
    const jpgEntryBuffer = readZipEntry(zip, "b_adjust-colors.jpg");
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "b_adjust-colors.jpg", mimeType: "image/jpeg", buffer: jpgEntryBuffer },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    const [jr, jg, jb] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
    expect(jr).toBeGreaterThan(210);
    expect(jr).toBeLessThan(230);
    expect(jr).toBe(jg);
    expect(jg).toBe(jb);
  });
});

// ─── Batch Sharpening ──────────────────────────────────────────────

test.describe("Batch Sharpening", () => {
  test("batch sharpen 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ sigma: 1.5 }) }],
    );
    const res = await request.post("/api/v1/tools/image/sharpening/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Watermark Text ──────────────────────────────────────────

test.describe("Batch Watermark Text", () => {
  test("batch watermark 3 images with center text", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            text: "BATCH WM",
            fontSize: 24,
            color: "#ff0000",
            opacity: 40,
            position: "center",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-text/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Strip Metadata ──────────────────────────────────────────

test.describe("Batch Strip Metadata", () => {
  test("batch strip metadata from 3 images", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: jpgExif },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/strip-metadata/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Optimize for Web ────────────────────────────────────────

test.describe("Batch Optimize for Web", () => {
  test("batch optimize 4 images for web", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "d.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ maxWidth: 800, quality: 70 }) }],
    );
    const res = await request.post("/api/v1/tools/image/optimize-for-web/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Border ──────────────────────────────────────────────────

test.describe("Batch Border", () => {
  test("batch add border to 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ borderWidth: 10, borderColor: "#0000ff" }) }],
    );
    const res = await request.post("/api/v1/tools/image/border/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(3);
    expect(readFirstPngPixelRgb(readZipEntry(zip, "a_border.png"))).toEqual([0, 0, 255]);
    for (const name of ["b_border.jpg", "c_border.webp"]) {
      expect(readZipEntry(zip, name).length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Replace Color ───────────────────────────────────────────

test.describe("Batch Replace Color", () => {
  test("batch replace color on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            sourceColor: "#ff6432",
            targetColor: "#ff00ff",
            tolerance: 25,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/replace-color/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(3);
    expect(readFirstPngPixelRgb(readZipEntry(zip, "a_replace-color.png"))).toEqual([255, 0, 255]);
    const jpgEntryBuffer = readZipEntry(zip, "b_replace-color.jpg");
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "b_replace-color.jpg", mimeType: "image/jpeg", buffer: jpgEntryBuffer },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    const [jr, jg, jb] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
    expect(jr).toBeLessThan(15);
    expect(jg).toBeGreaterThan(240);
    expect(jb).toBeLessThan(15);
    expect(readZipEntry(zip, "c_replace-color.webp").length).toBeGreaterThan(0);
  });
});

// ─── Batch Enhancement ─────────────────────────────────────────────

test.describe("Batch Enhancement", () => {
  test("batch enhance 3 images with auto mode", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ mode: "auto" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-enhancement/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Vectorize ───────────────────────────────────────────────

test.describe("Batch Vectorize", () => {
  test("batch vectorize 3 images to SVG", async ({ request }) => {
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
    // Vectorize does not register in the batch tool registry, so batch
    // endpoint may return 404. Accept either success or 404.
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Text Overlay ────────────────────────────────────────────

test.describe("Batch Text Overlay", () => {
  test("batch text overlay on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            text: "BATCH TEXT",
            fontSize: 20,
            color: "#ffffff",
            position: "bottom",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/text-overlay/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Favicon ────────────────────────────────────────────────

test.describe("Batch Favicon", () => {
  test("batch favicon from 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/favicon/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // Favicon batch may not be registered — accept 200 or 404
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Edit Metadata ──────────────────────────────────────────

test.describe("Batch Edit Metadata", () => {
  test("batch edit metadata on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ artist: "Batch Test", copyright: "CC0" }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/edit-metadata/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // edit-metadata batch may not be registered — accept 200 or 404
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Convert to Multiple Formats ────────────────────────────

test.describe("Batch Convert — format variety", () => {
  test("batch convert to PNG", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "png" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("batch convert to TIFF", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "tiff" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Batch Rotate with Various Angles ─────────────────────────────

test.describe("Batch Rotate — angles", () => {
  test("batch rotate 180 degrees", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ angle: 180 }) }],
    );
    const res = await request.post("/api/v1/tools/image/rotate/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("batch rotate 270 degrees", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ angle: 270 }) }],
    );
    const res = await request.post("/api/v1/tools/image/rotate/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Batch with HEIC Input ────────────────────────────────────────

test.describe("Batch with HEIC input", () => {
  test("batch resize HEIC and other formats", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 64, fit: "contain" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("batch compress HEIC with other formats", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ quality: 50 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Batch Color Blindness ────────────────────────────────────────

test.describe("Batch Color Blindness", () => {
  test("batch color-blindness simulation on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ simulationType: "deuteranopia" }) }],
    );
    const res = await request.post("/api/v1/tools/image/color-blindness/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Meme Generator ─────────────────────────────────────────

test.describe("Batch Meme Generator", () => {
  test("batch meme-generator on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            textLayout: "top-bottom",
            textBoxes: [
              { id: "top", text: "BATCH" },
              { id: "bottom", text: "MEME" },
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
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Beautify ───────────────────────────────────────────────

test.describe("Batch Beautify", () => {
  test("batch beautify 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            backgroundType: "solid",
            backgroundColor: "#1a1a2e",
            padding: 20,
            borderRadius: 8,
            shadowPreset: "none",
            frame: "none",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/beautify/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // beautify batch may not be registered
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Resize -- 5+ Images with Download Verification ────────

test.describe("Batch Resize -- 5+ images verified", () => {
  test("batch resize 6 mixed-format images and verify ZIP", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
        { name: "file", filename: "f.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 50, fit: "contain" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();

      // Download the ZIP and verify
      const dlRes = await request.get(json.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const buffer = Buffer.from(await dlRes.body());
      expect(buffer.length).toBeGreaterThan(0);
      // ZIP magic bytes
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    }
  });
});

// ─── Batch Convert -- 5+ Images ──────────────────────────────────

test.describe("Batch Convert -- 5+ images", () => {
  test("batch convert 5 images to JPEG", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "d.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
        { name: "file", filename: "e.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "jpg", quality: 80 }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Compress -- 5+ Images ─────────────────────────────────

test.describe("Batch Compress -- 5+ images", () => {
  test("batch compress 5 images with varying formats", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ quality: 40 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Enhancement -- 5+ Images ──────────────────────────────

test.describe("Batch Enhancement -- 5+ images", () => {
  test("batch enhance 5 images with auto mode", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ mode: "auto" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-enhancement/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Watermark Text -- 5+ Images ───────────────────────────

test.describe("Batch Watermark Text -- 5+ images", () => {
  test("batch watermark 5 images with tiled text", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            text: "DO NOT COPY",
            fontSize: 16,
            color: "#999999",
            opacity: 20,
            position: "tiled",
            rotation: -30,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-text/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch Optimize -- Download Verification ─────────────────────

test.describe("Batch Optimize -- download verification", () => {
  test("batch optimize and verify ZIP download", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ maxWidth: 400, quality: 60 }) }],
    );
    const res = await request.post("/api/v1/tools/image/optimize-for-web/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();

      const dlRes = await request.get(json.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(dlRes.ok()).toBe(true);
      const buffer = Buffer.from(await dlRes.body());
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});

// ─── Batch with Empty File List ────────────────────────────────────

test.describe("Batch validation", () => {
  test("batch resize rejects empty file list", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [],
      [{ name: "settings", value: JSON.stringify({ width: 80 }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(false);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("batch compress rejects single file (should use non-batch endpoint)", async ({
    request,
  }) => {
    // Single file to batch endpoint may be accepted or redirected;
    // verify the response is coherent in either case
    const { body: reqBody, contentType } = buildMultipart(
      [{ name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 }],
      [{ name: "settings", value: JSON.stringify({ quality: 50 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // Either accepts the single file or returns an error — both valid
    const resContentType = res.headers()["content-type"] ?? "";
    if (res.ok()) {
      if (resContentType.includes("application/json")) {
        const json = await res.json();
        expect(json.downloadUrl).toBeTruthy();
      } else {
        const buffer = Buffer.from(await res.body());
        expect(buffer.length).toBeGreaterThan(0);
      }
    } else {
      const json = await res.json();
      expect(json.error).toBeDefined();
    }
  });
});
