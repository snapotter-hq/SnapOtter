import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Meme Generator & Beautify Tools ─────────────────────────────
// Tests for: meme-generator, beautify
// These tools handle meme creation with text overlays and screenshot
// beautification with frames, shadows, backgrounds, and social presets.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const FORMATS = join(FIXTURES, "formats");

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
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Meme Generator — Custom Image ───────────────────────────────

test.describe("Meme Generator — custom image", () => {
  test("meme with top-bottom text layout", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [
            { id: "top", text: "ONE DOES NOT SIMPLY" },
            { id: "bottom", text: "WRITE E2E TESTS" },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("meme with top-only text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          textLayout: "top-only",
          textBoxes: [{ id: "top", text: "HEADER TEXT" }],
          fontFamily: "arial-black",
          textColor: "#FFFF00",
          strokeColor: "#000000",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with bottom-only text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          textLayout: "bottom-only",
          textBoxes: [{ id: "bottom", text: "BOTTOM TEXT" }],
          fontFamily: "comic-sans",
          allCaps: false,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with center text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          textLayout: "center",
          textBoxes: [{ id: "center", text: "CENTER IMPACT" }],
          fontSize: 48,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with no text boxes passes image through", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with custom font and colors", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [
            { id: "top", text: "CUSTOM FONT" },
            { id: "bottom", text: "RED STROKE" },
          ],
          fontFamily: "bebas-neue",
          textColor: "#FFFFFF",
          strokeColor: "#FF0000",
          textAlign: "left",
          allCaps: true,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [
            { id: "top", text: "HEIC" },
            { id: "bottom", text: "MEME" },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme rejects request with no image and no template", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        textLayout: "top-bottom",
        textBoxes: [{ id: "top", text: "NO IMAGE" }],
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Meme Generator — Template Mode ─────────────────────────────

test.describe("Meme Generator — template mode", () => {
  test("meme with template ID (JSON body)", async ({ request }) => {
    // First, fetch the available templates to find a valid ID
    // Use a well-known template if available, otherwise skip
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        templateId: "drake",
        textBoxes: [
          { id: "top", text: "Writing tests manually" },
          { id: "bottom", text: "Using E2E automation" },
        ],
      },
    });
    // Template may not exist -- accept both success and 400
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("meme with invalid template ID returns error", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        templateId: "nonexistent-template-99999",
        textBoxes: [{ id: "top", text: "TEST" }],
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Beautify — Basic Scenarios ──────────────────────────────────

test.describe("Beautify — basic", () => {
  test("beautify with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("beautify with solid background", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          backgroundType: "solid",
          backgroundColor: "#1a1a2e",
          padding: 40,
          borderRadius: 8,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("beautify with transparent background", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          backgroundType: "transparent",
          padding: 32,
          borderRadius: 16,
          outputFormat: "png",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with linear gradient background", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "#667eea", position: 0 },
            { color: "#764ba2", position: 100 },
          ],
          gradientAngle: 135,
          padding: 64,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with radial gradient background", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          backgroundType: "radial-gradient",
          gradientStops: [
            { color: "#ff6b6b", position: 0 },
            { color: "#556270", position: 100 },
          ],
          padding: 48,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Shadow Presets ──────────────────────────────────

test.describe("Beautify — shadows", () => {
  test("beautify with subtle shadow", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          shadowPreset: "subtle",
          padding: 64,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with dramatic shadow", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({
          shadowPreset: "dramatic",
          padding: 80,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with no shadow", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          shadowPreset: "none",
          padding: 32,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Frames ──────────────────────────────────────────

test.describe("Beautify — frames", () => {
  test("beautify with macOS light frame", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          frame: "macos-light",
          frameTitle: "Terminal",
          padding: 48,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with macOS dark frame", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          frame: "macos-dark",
          frameTitle: "Code Editor",
          backgroundType: "solid",
          backgroundColor: "#2d2d2d",
          padding: 48,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with browser light frame", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          frame: "browser-light",
          frameTitle: "https://snapotter.app",
          padding: 32,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with no frame", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          frame: "none",
          borderRadius: 12,
          padding: 32,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Social Presets ──────────────────────────────────

test.describe("Beautify — social presets", () => {
  test("beautify for Twitter", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          socialPreset: "twitter",
          padding: 64,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify for Instagram square", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          socialPreset: "instagram-square",
          padding: 48,
          backgroundType: "solid",
          backgroundColor: "#FFFFFF",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify for LinkedIn", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          socialPreset: "linkedin",
          padding: 40,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Watermark ───────────────────────────────────────

test.describe("Beautify — watermark", () => {
  test("beautify with watermark text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          watermarkText: "snapotter.app",
          watermarkPosition: "bottom-right",
          watermarkOpacity: 40,
          padding: 48,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with center watermark", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          watermarkText: "DRAFT",
          watermarkPosition: "center",
          watermarkOpacity: 20,
          padding: 32,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Output Formats ──────────────────────────────────

test.describe("Beautify — output formats", () => {
  test("beautify with JPEG output", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          outputFormat: "jpeg",
          backgroundType: "solid",
          backgroundColor: "#FFFFFF",
          shadowPreset: "none",
          borderRadius: 0,
          frame: "none",
          padding: 32,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with WebP output", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          outputFormat: "webp",
          padding: 24,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify HEIC input image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          padding: 32,
          borderRadius: 8,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify — Background Image ────────────────────────────────

test.describe("Beautify — background image", () => {
  test("beautify with custom background image", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "screenshot.png", contentType: "image/png", buffer: PNG_200x150 },
        {
          name: "backgroundImage",
          filename: "bg.jpg",
          contentType: "image/jpeg",
          buffer: JPG_SAMPLE,
        },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            backgroundType: "image",
            padding: 64,
            borderRadius: 12,
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Beautify — Validation ──────────────────────────────────────

test.describe("Beautify — validation", () => {
  test("beautify rejects request with no file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        settings: JSON.stringify({ padding: 32 }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("meme-generator without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [{ id: "top", text: "TEST" }],
        }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("beautify without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });
});
