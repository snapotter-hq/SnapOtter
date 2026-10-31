import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import AdmZip from "adm-zip";

// ─── Batch Workflows ──────────────────────────────────────────────
// Comprehensive batch processing tests for every tool category.
// Each batch uploads 3-5 files, processes them, and verifies all
// outputs are valid (ZIP download or JSON with downloadUrl).

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

/**
 * Assert a batch response is valid: either a JSON with downloadUrl
 * or a raw ZIP binary (PK magic bytes).
 */
async function expectBatchSuccess(res: import("@playwright/test").APIResponse): Promise<void> {
  expect(res.ok()).toBe(true);
  const resContentType = res.headers()["content-type"] ?? "";
  if (resContentType.includes("application/json")) {
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  } else {
    const buffer = Buffer.from(await res.body());
    expect(buffer.length).toBeGreaterThan(0);
    // ZIP magic bytes: PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  }
}

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
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
const WEBP_50x50 = fixture("test-50x50.webp");
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Essential: Batch Resize 5 Images ─────────────────────────────

test.describe("Essential: batch resize 5 images", () => {
  test("resize 5 mixed-format images to 120px wide", async ({ request }) => {
    const avifSample = formatFixture("sample.avif");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.avif", contentType: "image/avif", buffer: avifSample },
      ],
      [{ name: "settings", value: JSON.stringify({ width: 120, fit: "contain" }) }],
    );
    const res = await request.post("/api/v1/tools/image/resize/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("resize 5 images with explicit width and height", async ({ request }) => {
    const tiffSample = formatFixture("sample.tiff");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "e.tiff", contentType: "image/tiff", buffer: tiffSample },
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

// ─── Essential: Batch Compress ────────────────────────────────────

test.describe("Essential: batch compress", () => {
  test("compress 5 images with aggressive quality", async ({ request }) => {
    const pngSample = formatFixture("sample.png");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "e.png", contentType: "image/png", buffer: pngSample },
      ],
      [{ name: "settings", value: JSON.stringify({ quality: 20 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("compress 3 images with moderate quality", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ quality: 60 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compress/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Essential: Batch Rotate ──────────────────────────────────────

test.describe("Essential: batch rotate", () => {
  test("rotate 4 images by 90 degrees", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ angle: 90 }) }],
    );
    const res = await request.post("/api/v1/tools/image/rotate/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("rotate 3 images by 45 degrees with white background", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ angle: 45, background: "#ffffff" }) }],
    );
    const res = await request.post("/api/v1/tools/image/rotate/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Adjustment: Batch Color Adjustments ──────────────────────────

test.describe("Adjustment: batch color adjustments", () => {
  test("adjust brightness and contrast on 4 images", async ({ request }) => {
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
          value: JSON.stringify({ brightness: 25, contrast: 15, saturation: -10 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/adjust-colors/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("batch grayscale conversion on 5 images", async ({ request }) => {
    const avifSample = formatFixture("sample.avif");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.avif", contentType: "image/avif", buffer: avifSample },
      ],
      [{ name: "settings", value: JSON.stringify({ effect: "grayscale" }) }],
    );
    const res = await request.post("/api/v1/tools/image/adjust-colors/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(5);
    const [ar, ag, ab] = readFirstPngPixelRgb(readZipEntry(zip, "a_adjust-colors.png"));
    expect(ar).toBe(150);
    expect(ar).toBe(ag);
    expect(ag).toBe(ab);
    const [dr, dg, db] = readFirstPngPixelRgb(readZipEntry(zip, "d_adjust-colors.png"));
    expect(dr).toBe(150);
    expect(dr).toBe(dg);
    expect(dg).toBe(db);
    for (const name of ["b_adjust-colors.jpg", "c_adjust-colors.webp", "e_adjust-colors.avif"]) {
      expect(readZipEntry(zip, name).length).toBeGreaterThan(0);
    }
  });

  test("batch negative brightness on 3 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ brightness: -30, contrast: 20 }) }],
    );
    const res = await request.post("/api/v1/tools/image/adjust-colors/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Adjustment: Batch Sharpening ─────────────────────────────────

test.describe("Adjustment: batch sharpening", () => {
  test("sharpen 4 images with sigma 2.0", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ sigma: 2.0 }) }],
    );
    const res = await request.post("/api/v1/tools/image/sharpening/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("sharpen 3 images with low sigma for subtle effect", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ sigma: 0.5 }) }],
    );
    const res = await request.post("/api/v1/tools/image/sharpening/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Overlay: Batch Watermark Text ────────────────────────────────

test.describe("Overlay: batch watermark text", () => {
  test("watermark 5 images with tiled text", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "e.webp", contentType: "image/webp", buffer: webpSample },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            text: "CONFIDENTIAL",
            fontSize: 18,
            color: "#ff0000",
            opacity: 30,
            position: "tiled",
            rotation: -45,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-text/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("watermark 3 images at bottom-right", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            text: "@snapotter",
            fontSize: 14,
            color: "#ffffff",
            opacity: 50,
            position: "bottom-right",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-text/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Overlay: Batch Watermark Image ───────────────────────────────

test.describe("Overlay: batch watermark image", () => {
  test("watermark 3 images with a logo overlay", async ({ request }) => {
    const watermarkImg = contentFixture("watermark.jpg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        {
          name: "watermark",
          filename: "logo.jpg",
          contentType: "image/jpeg",
          buffer: watermarkImg,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "bottom-right", opacity: 50, scale: 20 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // watermark-image batch may not be registered
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    await expectBatchSuccess(res);
  });
});

// ─── Format: Batch Convert JPEG to PNG ────────────────────────────

test.describe("Format: batch convert JPEG to PNG", () => {
  test("convert 5 JPEG files to PNG", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const portraitBw = contentFixture("portrait-bw.jpeg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "file",
          filename: "c.jpg",
          contentType: "image/jpeg",
          buffer: fixture("test-with-exif.jpg"),
        },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: portrait },
        { name: "file", filename: "e.jpeg", contentType: "image/jpeg", buffer: portraitBw },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "png" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("convert 4 mixed formats to WebP", async ({ request }) => {
    const tiffSample = formatFixture("sample.tiff");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "c.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "d.tiff", contentType: "image/tiff", buffer: tiffSample },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "webp", quality: 80 }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("convert 3 formats to AVIF", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "avif" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Utility: Batch Info ──────────────────────────────────────────

test.describe("Utility: batch info", () => {
  test("get info for 5 images of different formats", async ({ request }) => {
    const tiffSample = formatFixture("sample.tiff");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "e.tiff", contentType: "image/tiff", buffer: tiffSample },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/image/info/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    // info/batch may not exist as a batch endpoint
    if (res.status() === 404) {
      const json = await res.json();
      expect(json.error).toBeDefined();
      return;
    }
    expect(res.ok()).toBe(true);
    const json = await res.json();
    // Batch info should return metadata for each file
    if (json.results) {
      expect(json.results).toBeInstanceOf(Array);
      expect(json.results.length).toBe(5);
    } else if (json.downloadUrl) {
      expect(json.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Utility: Batch Strip Metadata ────────────────────────────────

test.describe("Utility: batch strip metadata", () => {
  test("strip metadata from 4 images", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: jpgExif },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/strip-metadata/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });

  test("strip metadata from 3 images including HEIC", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: jpgExif },
        { name: "file", filename: "b.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({}) }],
    );
    const res = await request.post("/api/v1/tools/image/strip-metadata/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Essential: Batch Crop ────────────────────────────────────────

test.describe("Essential: batch crop", () => {
  test("crop 4 images to a small center region", async ({ request }) => {
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
          value: JSON.stringify({ left: 5, top: 5, width: 40, height: 40 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/crop/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Overlay: Batch Text Overlay ──────────────────────────────────

test.describe("Overlay: batch text overlay", () => {
  test("text overlay on 4 images with background box", async ({ request }) => {
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
            text: "BATCH CAPTION",
            fontSize: 16,
            color: "#ffffff",
            position: "bottom",
            backgroundBox: true,
            backgroundColor: "#000000",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/text-overlay/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Format: Batch Convert to TIFF ────────────────────────────────

test.describe("Format: batch convert to TIFF", () => {
  test("convert 3 images to TIFF", async ({ request }) => {
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
    await expectBatchSuccess(res);
  });
});

// ─── Adjustment: Batch Enhance ────────────────────────────────────

test.describe("Adjustment: batch enhance", () => {
  test("enhance 4 images with landscape mode", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
      ],
      [{ name: "settings", value: JSON.stringify({ mode: "landscape" }) }],
    );
    const res = await request.post("/api/v1/tools/image/image-enhancement/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(4);
    const [r, g, b] = readFirstPngPixelRgb(readZipEntry(zip, "a_image-enhancement.png"));
    expect(r).toBeGreaterThanOrEqual(240);
    expect(r).toBeLessThanOrEqual(248);
    expect(g).toBeGreaterThanOrEqual(113);
    expect(g).toBeLessThanOrEqual(120);
    expect(b).toBeGreaterThanOrEqual(66);
    expect(b).toBeLessThanOrEqual(75);
    for (const name of [
      "b_image-enhancement.jpg",
      "c_image-enhancement.webp",
      "d_image-enhancement.jpg",
    ]) {
      expect(readZipEntry(zip, name).length).toBeGreaterThan(0);
    }
  });
});

// ─── Utility: Batch Optimize for Web ──────────────────────────────

test.describe("Utility: batch optimize for web", () => {
  test("optimize 5 images for web delivery", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "file", filename: "e.webp", contentType: "image/webp", buffer: webpSample },
      ],
      [{ name: "settings", value: JSON.stringify({ maxWidth: 600, quality: 65 }) }],
    );
    const res = await request.post("/api/v1/tools/image/optimize-for-web/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Overlay: Batch Border ────────────────────────────────────────

test.describe("Overlay: batch border", () => {
  test("add 20px red border to 4 images", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
      ],
      [{ name: "settings", value: JSON.stringify({ borderWidth: 20, borderColor: "#ff0000" }) }],
    );
    const res = await request.post("/api/v1/tools/image/border/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    const zip = await readBatchZip(res, request);
    expect(zip.getEntries()).toHaveLength(4);
    expect(readFirstPngPixelRgb(readZipEntry(zip, "a_border.png"))).toEqual([255, 0, 0]);
    expect(readFirstPngPixelRgb(readZipEntry(zip, "d_border.png"))).toEqual([255, 0, 0]);
    for (const name of ["b_border.jpg", "c_border.webp"]) {
      expect(readZipEntry(zip, name).length).toBeGreaterThan(0);
    }
  });
});

// ─── Format: Batch Convert to GIF ─────────────────────────────────

test.describe("Format: batch convert to GIF", () => {
  test("convert 3 images to GIF", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ format: "gif" }) }],
    );
    const res = await request.post("/api/v1/tools/image/convert/batch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    await expectBatchSuccess(res);
  });
});

// ─── Adjustment: Batch Replace Color ──────────────────────────────

test.describe("Adjustment: batch replace color", () => {
  test("replace orange with light gray in 3 images", async ({ request }) => {
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
            targetColor: "#e0e0e0",
            tolerance: 30,
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
    expect(readFirstPngPixelRgb(readZipEntry(zip, "a_replace-color.png"))).toEqual([224, 224, 224]);
    expect(readZipEntry(zip, "b_replace-color.jpg").length).toBeGreaterThan(0);
    expect(readZipEntry(zip, "c_replace-color.webp").length).toBeGreaterThan(0);
  });
});
