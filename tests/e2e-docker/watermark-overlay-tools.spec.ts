import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Watermark & Overlay Tools ─────────────────────────────────────
// Extended tests for: watermark-text, watermark-image, text-overlay,
// compose — covering positioning, opacity, batch, and edge cases.
// Complements creative-tools.spec.ts with deeper coverage.

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
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Watermark Text — Extended Positioning ─────────────────────────

test.describe("Watermark Text — extended", () => {
  test("watermark with large font on high-res image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          text: "HIGH RES WATERMARK",
          fontSize: 72,
          color: "#ff0000",
          opacity: 60,
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("watermark with small font and low opacity", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "subtle",
          fontSize: 10,
          color: "#cccccc",
          opacity: 10,
          position: "bottom-right",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("watermark on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          text: "HEIC WM",
          fontSize: 24,
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

  test("watermark on WebP image", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({
          text: "WEBP TEST",
          fontSize: 32,
          color: "#0000ff",
          opacity: 45,
          position: "top-left",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("tiled watermark with rotation", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          text: "DO NOT COPY",
          fontSize: 20,
          color: "#808080",
          opacity: 25,
          position: "tiled",
          rotation: -30,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("watermark with full opacity (100)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "OPAQUE",
          fontSize: 36,
          color: "#000000",
          opacity: 100,
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Watermark Image — Extended ────────────────────────────────────

test.describe("Watermark Image — extended", () => {
  test("image watermark at top-left position", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        { name: "watermark", filename: "wm.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "top-left", opacity: 70, scale: 15 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("image watermark at center position", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "watermark",
          filename: "wm.jpg",
          contentType: "image/jpeg",
          buffer: JPG_100x100,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "center", opacity: 40, scale: 50 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("image watermark with low opacity (10%)", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "watermark",
          filename: "wm.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "bottom-left", opacity: 10, scale: 20 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("image watermark with moderate scale (40%)", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "watermark",
          filename: "wm.jpg",
          contentType: "image/jpeg",
          buffer: JPG_100x100,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "center", opacity: 30, scale: 40 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("image watermark using content fixture", async ({ request }) => {
    const watermarkImg = contentFixture("watermark.jpg");
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
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
          value: JSON.stringify({ position: "bottom-right", opacity: 60, scale: 30 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Text Overlay — Extended ───────────────────────────────────────

test.describe("Text Overlay — extended", () => {
  test("text overlay on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          text: "HEIC Overlay",
          fontSize: 24,
          color: "#FFFFFF",
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay on WebP image", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({
          text: "WebP Caption",
          fontSize: 28,
          color: "#FF6600",
          position: "bottom",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay with large font on high-res image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          text: "BIG TEXT",
          fontSize: 96,
          color: "#FF0000",
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("text overlay with background box and custom color", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          text: "Boxed Caption",
          fontSize: 32,
          color: "#FFFFFF",
          position: "bottom",
          backgroundBox: true,
          backgroundColor: "#333333",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay at top position", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "Header",
          fontSize: 18,
          color: "#000000",
          position: "top",
          backgroundBox: true,
          backgroundColor: "#FFFFFF",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay with empty text is rejected", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "",
          fontSize: 24,
          color: "#000000",
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Compose — Extended ────────────────────────────────────────────

test.describe("Compose — extended", () => {
  test("compose with full opacity overlay", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "overlay",
          filename: "overlay.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 0, y: 0, opacity: 100 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("compose with offset positioning", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "overlay",
          filename: "overlay.png",
          contentType: "image/png",
          buffer: PNG_200x150,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 50, y: 50, opacity: 70 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("compose with very low opacity (5%)", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "overlay",
          filename: "overlay.jpg",
          contentType: "image/jpeg",
          buffer: JPG_100x100,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 10, y: 10, opacity: 5 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("compose with overlay at bottom-right corner", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "overlay",
          filename: "overlay.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 150, y: 100, opacity: 50 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Watermark Text — All Positions ──────────────────────────────

test.describe("Watermark Text — all positions", () => {
  const positions = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
    "tiled",
  ] as const;

  for (const position of positions) {
    test(`watermark at ${position} position`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/watermark-text", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: `POS-${position}`,
            fontSize: 16,
            color: "#333333",
            opacity: 60,
            position,
          }),
        },
      });
      expect(res.ok(), `watermark at ${position} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Watermark Image — Tiled ────────────────────────────────────

test.describe("Watermark Image — tiled", () => {
  test("tiled image watermark", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "watermark",
          filename: "wm.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "tiled", opacity: 15, scale: 10 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Compose — Different Format Combos ──────────────────────────

test.describe("Compose — format combinations", () => {
  test("compose HEIC base with PNG overlay", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "overlay",
          filename: "overlay.png",
          contentType: "image/png",
          buffer: PNG_200x150,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 0, y: 0, opacity: 50 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("compose JPEG base with WebP overlay", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        {
          name: "overlay",
          filename: "overlay.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 0, y: 0, opacity: 80 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Text Overlay — Validation ──────────────────────────────────

test.describe("Text Overlay — validation", () => {
  test("text overlay with multiline text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "Line 1\nLine 2\nLine 3",
          fontSize: 20,
          color: "#FFFFFF",
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay with shadow effect", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          text: "Shadow Caption",
          fontSize: 40,
          color: "#FFFFFF",
          position: "bottom",
          shadow: true,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Watermark Text -- Rotation Angles ───────────────────────────

test.describe("Watermark Text -- rotation", () => {
  const rotations = [-45, -30, 0, 30, 45, 90] as const;

  for (const rotation of rotations) {
    test(`tiled watermark with rotation=${rotation}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/watermark-text", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
          settings: JSON.stringify({
            text: `ROT-${rotation}`,
            fontSize: 18,
            color: "#888888",
            opacity: 30,
            position: "tiled",
            rotation,
          }),
        },
      });
      expect(res.ok(), `tiled watermark with rotation=${rotation} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Watermark Text -- Opacity Range ────────────────────────────

test.describe("Watermark Text -- opacity range", () => {
  const opacities = [1, 25, 50, 75, 100] as const;

  for (const opacity of opacities) {
    test(`watermark with opacity=${opacity}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/watermark-text", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: `OP-${opacity}`,
            fontSize: 20,
            color: "#000000",
            opacity,
            position: "center",
          }),
        },
      });
      expect(res.ok(), `watermark with opacity=${opacity} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Watermark Image -- All Positions ──────────────────────────

test.describe("Watermark Image -- all positions", () => {
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const;

  for (const position of positions) {
    test(`image watermark at ${position}`, async ({ request }) => {
      const { body, contentType } = buildMultipart(
        [
          { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
          {
            name: "watermark",
            filename: "wm.png",
            contentType: "image/png",
            buffer: WEBP_50x50,
          },
        ],
        [
          {
            name: "settings",
            value: JSON.stringify({ position, opacity: 50, scale: 20 }),
          },
        ],
      );
      const res = await request.post("/api/v1/tools/image/watermark-image", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        data: body,
      });
      expect(res.ok(), `image watermark at ${position} should succeed`).toBe(true);
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Watermark Image -- Scale Variations ───────────────────────

test.describe("Watermark Image -- scale variations", () => {
  const scales = [5, 15, 30, 50, 75] as const;

  for (const scale of scales) {
    test(`image watermark with scale=${scale}%`, async ({ request }) => {
      const { body, contentType } = buildMultipart(
        [
          { name: "file", filename: "main.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
          {
            name: "watermark",
            filename: "wm.png",
            contentType: "image/png",
            buffer: PNG_200x150,
          },
        ],
        [
          {
            name: "settings",
            value: JSON.stringify({ position: "center", opacity: 40, scale }),
          },
        ],
      );
      const res = await request.post("/api/v1/tools/image/watermark-image", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        data: body,
      });
      expect(res.ok(), `image watermark with scale=${scale} should succeed`).toBe(true);
      const json = await res.json();
      expect(json.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Text Overlay -- All Positions ─────────────────────────────

test.describe("Text Overlay -- all positions", () => {
  const positions = ["top", "center", "bottom"] as const;

  for (const position of positions) {
    test(`text overlay at ${position}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/text-overlay", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: `Position: ${position}`,
            fontSize: 20,
            color: "#FF0000",
            position,
          }),
        },
      });
      expect(res.ok(), `text overlay at ${position} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Text Overlay -- Font Size Range ───────────────────────────

test.describe("Text Overlay -- font size range", () => {
  const fontSizes = [8, 16, 32, 64, 128] as const;

  for (const fontSize of fontSizes) {
    test(`text overlay with fontSize=${fontSize}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/text-overlay", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
          settings: JSON.stringify({
            text: "Font Size Test",
            fontSize,
            color: "#333333",
            position: "center",
          }),
        },
      });
      expect(res.ok(), `text overlay with fontSize=${fontSize} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Text Overlay -- Color Variations ──────────────────────────

test.describe("Text Overlay -- color variations", () => {
  const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF", "#000000", "#FFAA33"] as const;

  for (const color of colors) {
    test(`text overlay with color=${color}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/text-overlay", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: "Color Test",
            fontSize: 24,
            color,
            position: "center",
          }),
        },
      });
      expect(res.ok(), `text overlay with color=${color} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }
});

// ─── Compose -- Output Download Verification ───────────────────

test.describe("Compose -- output verification", () => {
  test("composed image can be downloaded and is valid", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "overlay",
          filename: "overlay.jpg",
          contentType: "image/jpeg",
          buffer: JPG_100x100,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 10, y: 10, opacity: 80 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();

    // Download and verify
    const dlRes = await request.get(json.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
  });

  test("compose with zero offset overlays at origin", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
        {
          name: "overlay",
          filename: "overlay.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 0, y: 0, opacity: 100 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Watermark Text -- Download and Verify ─────────────────────

test.describe("Watermark Text -- download verification", () => {
  test("watermarked file is downloadable and non-empty", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "VERIFY",
          fontSize: 24,
          color: "#FF0000",
          opacity: 50,
          position: "center",
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
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("watermark-text without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "TEST",
          fontSize: 24,
          color: "#ff0000",
          opacity: 50,
          position: "center",
        }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("compose without token returns 401", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "base.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "overlay",
          filename: "overlay.webp",
          contentType: "image/webp",
          buffer: WEBP_50x50,
        },
      ],
      [{ name: "settings", value: JSON.stringify({ x: 0, y: 0, opacity: 100 }) }],
    );
    const res = await request.post("/api/v1/tools/image/compose", {
      headers: { "Content-Type": contentType },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test("watermark-image without token returns 401", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "main.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "watermark",
          filename: "wm.jpg",
          contentType: "image/jpeg",
          buffer: JPG_100x100,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ position: "center", opacity: 50, scale: 25 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/watermark-image", {
      headers: { "Content-Type": contentType },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test("text-overlay without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "No Auth",
          fontSize: 24,
          color: "#000000",
          position: "center",
        }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
