import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Exotic Format Inputs ────────────────────────────────────────
// Tests that exercise less common input formats (TIFF, AVIF, PSD,
// GIF, BMP, SVG) through core processing tools. Verifies the
// format decode path works end-to-end in the Docker container.

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

function formatFixture(name: string): Buffer {
  return readFileSync(join(FORMATS, name));
}

function contentFixture(name: string): Buffer {
  return readFileSync(join(CONTENT, name));
}

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

const TIFF_SAMPLE = formatFixture("sample.tiff");
const AVIF_SAMPLE = formatFixture("sample.avif");
const GIF_SAMPLE = formatFixture("sample.gif");
const SVG_SAMPLE = formatFixture("sample.svg");

// ─── TIFF Through Core Tools ─────────────────────────────────────

test.describe("TIFF input through core tools", () => {
  test("resize TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ width: 200, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("crop TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ left: 10, top: 10, width: 100, height: 100 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate TIFF image 90 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("sharpen TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ sigma: 1.5 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("adjust colors on TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ brightness: 15, contrast: 10 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("color palette from TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.colors).toBeInstanceOf(Array);
    expect(body.colors.length).toBeGreaterThan(0);
  });

  test("border on TIFF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: TIFF_SAMPLE },
        settings: JSON.stringify({ size: 15, color: "#336699" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── AVIF Through Core Tools ─────────────────────────────────────

test.describe("AVIF input through core tools", () => {
  test("resize AVIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({ width: 150, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("crop AVIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({ left: 5, top: 5, width: 50, height: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("compress AVIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({ quality: 40 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert AVIF to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });

  test("convert AVIF to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({ format: "jpg", quality: 80 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
  });

  test("info on AVIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });

  test("watermark text on AVIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: AVIF_SAMPLE },
        settings: JSON.stringify({
          text: "AVIF WM",
          fontSize: 20,
          color: "#ffffff",
          opacity: 50,
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── GIF Through Core Tools ──────────────────────────────────────

test.describe("GIF input through core tools", () => {
  test("resize GIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: GIF_SAMPLE },
        settings: JSON.stringify({ width: 100, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert GIF to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: GIF_SAMPLE },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });

  test("convert GIF to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: GIF_SAMPLE },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("info on GIF image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: GIF_SAMPLE },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });
});

// ─── PSD Through Core Tools ──────────────────────────────────────

test.describe("PSD input through core tools", () => {
  test("info on PSD image", async ({ request }) => {
    const psd = formatFixture("sample.psd");
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.psd", mimeType: "image/vnd.adobe.photoshop", buffer: psd },
      },
    });
    // PSD support depends on Sharp build; accept success or format error
    if (res.ok()) {
      const body = await res.json();
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("resize PSD image", async ({ request }) => {
    const psd = formatFixture("sample.psd");
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.psd", mimeType: "image/vnd.adobe.photoshop", buffer: psd },
        settings: JSON.stringify({ width: 200, fit: "contain" }),
      },
    });
    // PSD decode may not be available
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("convert PSD to PNG", async ({ request }) => {
    const psd = formatFixture("sample.psd");
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.psd", mimeType: "image/vnd.adobe.photoshop", buffer: psd },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".png");
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── SVG Through Extended Tools ──────────────────────────────────

test.describe("SVG input through extended tools", () => {
  test("SVG to raster at multiple widths", async ({ request }) => {
    const widths = [64, 256, 512, 1024] as const;
    for (const width of widths) {
      const res = await request.post("/api/v1/tools/image/svg-to-raster", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "sample.svg", mimeType: "image/svg+xml", buffer: SVG_SAMPLE },
          settings: JSON.stringify({ format: "png", width }),
        },
      });
      expect(res.ok(), `SVG to raster at width=${width} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    }
  });

  test("SVG to raster as JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.svg", mimeType: "image/svg+xml", buffer: SVG_SAMPLE },
        settings: JSON.stringify({ format: "jpg", width: 400 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("SVG to raster as AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.svg", mimeType: "image/svg+xml", buffer: SVG_SAMPLE },
        settings: JSON.stringify({ format: "avif", width: 300 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("color palette from SVG input", async ({ request }) => {
    const svgLogo = contentFixture("svg-logo.svg");
    const res = await request.post("/api/v1/tools/image/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: svgLogo },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.colors).toBeInstanceOf(Array);
    expect(body.colors.length).toBeGreaterThan(0);
  });

  test("beautify SVG input", async ({ request }) => {
    const svg100 = fixture("test-100x100.svg");
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: svg100 },
        settings: JSON.stringify({
          frame: "browser-light",
          frameTitle: "design.svg",
          padding: 40,
          borderRadius: 8,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── HEIF (non-HEIC) Through Core Tools ──────────────────────────

test.describe("HEIF input through core tools", () => {
  test("info on HEIF image", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });

  test("resize HEIF image", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ width: 200, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert HEIF to JPEG", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ format: "jpg", quality: 85 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
  });

  test("convert HEIF to WebP", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("color palette from HEIF image", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.colors).toBeInstanceOf(Array);
    expect(body.colors.length).toBeGreaterThan(0);
  });

  test("adjust colors on HEIF image", async ({ request }) => {
    const heif = contentFixture("motorcycle.heif");
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "motorcycle.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ brightness: 10, contrast: 15, saturation: -5 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Multipage TIFF ──────────────────────────────────────────────

test.describe("Multipage TIFF", () => {
  test("info on multipage TIFF", async ({ request }) => {
    const multiTiff = formatFixture("multipage.tiff");
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "multipage.tiff", mimeType: "image/tiff", buffer: multiTiff },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });

  test("convert multipage TIFF to PNG", async ({ request }) => {
    const multiTiff = formatFixture("multipage.tiff");
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "multipage.tiff", mimeType: "image/tiff", buffer: multiTiff },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });
});

// ─── Animated GIF Through Core Tools ─────────────────────────────

test.describe("Animated GIF through core tools", () => {
  test("info on animated GIF", async ({ request }) => {
    const animated = fixture("animated.gif");
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: animated },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });

  test("resize animated GIF (first frame)", async ({ request }) => {
    const animated = fixture("animated.gif");
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: animated },
        settings: JSON.stringify({ width: 50, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert animated GIF to PNG (first frame)", async ({ request }) => {
    const animated = fixture("animated.gif");
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: animated },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });
});

// ─── Cross-Format Conversion Matrix ──────────────────────────────

test.describe("Cross-format conversion matrix", () => {
  const conversions = [
    { from: "TIFF", file: "sample.tiff", mime: "image/tiff", to: "webp" },
    { from: "TIFF", file: "sample.tiff", mime: "image/tiff", to: "avif" },
    { from: "TIFF", file: "sample.tiff", mime: "image/tiff", to: "jpg" },
    { from: "AVIF", file: "sample.avif", mime: "image/avif", to: "tiff" },
    { from: "AVIF", file: "sample.avif", mime: "image/avif", to: "gif" },
    { from: "GIF", file: "sample.gif", mime: "image/gif", to: "avif" },
    { from: "GIF", file: "sample.gif", mime: "image/gif", to: "tiff" },
  ] as const;

  for (const { from, file, mime, to } of conversions) {
    test(`convert ${from} to ${to}`, async ({ request }) => {
      const buffer = formatFixture(file);
      const res = await request.post("/api/v1/tools/image/convert", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: file, mimeType: mime, buffer },
          settings: JSON.stringify({ format: to }),
        },
      });
      expect(res.ok(), `${from} to ${to} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toContain(`.${to}`);
      expect(body.processedSize).toBeGreaterThan(0);
    });
  }
});
