import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

// ─── Creative Tools ─────────────────────────────────────────────────
// Tests for: collage, stitch, split, border, compose, watermark-text,
// watermark-image, text-overlay, content-aware-resize
// These tools handle multi-image operations, overlays, and layout.

const FIXTURES = join(process.cwd(), "tests", "fixtures");

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

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");

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

async function uploadFiles(page: Page, filePaths: string[]): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePaths);
  await page.waitForTimeout(3000);
}

async function waitForProcessingDone(page: Page, timeoutMs = 120_000): Promise<void> {
  try {
    const spinner = page.locator("[class*='animate-spin']");
    if (await spinner.isVisible({ timeout: 3000 })) {
      await spinner.waitFor({ state: "hidden", timeout: timeoutMs });
    }
  } catch {
    // No spinner — processing may have been instant
  }
  await page.waitForTimeout(500);
}

// ─── Collage ────────────────────────────────────────────────────────

test.describe("Collage", () => {
  test("create 2-image collage via API", async ({ request }) => {
    const jpg = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const png = readFileSync(join(FIXTURES, "test-200x150.png"));
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: jpg },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: png },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({
            templateId: "2-h-equal",
            width: 400,
            height: 200,
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

  test("collage API with 2 images", async ({ request }) => {
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
            backgroundColor: "#FFFFFF",
            outputFormat: "png",
          }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/collage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });
});

// ─── Stitch ─────────────────────────────────────────────────────────

test.describe("Stitch", () => {
  test("stitch 2 images horizontally", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
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
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("stitch 2 images vertically", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "vertical", gap: 0 }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch with gap and background color", async ({ request }) => {
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
            gap: 20,
            backgroundColor: "#FF0000",
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

  test("stitch 3 images in grid mode", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ direction: "grid", gridColumns: 2 }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
  });

  test("stitch rejects single file", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 }],
      [{ name: "settings", value: JSON.stringify({ direction: "horizontal" }) }],
    );
    const res = await request.post("/api/v1/tools/stitch", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(false);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ─── Split ──────────────────────────────────────────────────────────

test.describe("Split", () => {
  test("split image into 2x2 tiles via API", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 2, rows: 2 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("split image into 3x3 tiles via API", async ({ request }) => {
    const res = await request.post("/api/v1/tools/split", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ columns: 3, rows: 3 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Border ─────────────────────────────────────────────────────────

test.describe("Border", () => {
  test("add solid color border", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ size: 20, color: "#ff0000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Border adds pixels, so output should be larger
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("add thin border", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ size: 1, color: "#000000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("add wide white border", async ({ request }) => {
    const res = await request.post("/api/v1/tools/border", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ size: 50, color: "#ffffff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Compose ────────────────────────────────────────────────────────

test.describe("Compose", () => {
  test("compose base + overlay via API", async ({ request }) => {
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
    const res = await request.post("/api/v1/tools/compose", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Watermark Text ─────────────────────────────────────────────────

test.describe("Watermark Text", () => {
  test("add center watermark", async ({ request }) => {
    const res = await request.post("/api/v1/tools/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "SAMPLE",
          fontSize: 48,
          color: "#ff0000",
          opacity: 50,
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("add tiled watermark", async ({ request }) => {
    const res = await request.post("/api/v1/tools/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          text: "CONFIDENTIAL",
          fontSize: 24,
          color: "#808080",
          opacity: 30,
          position: "tiled",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("add corner watermark positions", async ({ request }) => {
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
    for (const position of positions) {
      const res = await request.post("/api/v1/tools/watermark-text", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: "WM",
            fontSize: 16,
            color: "#000000",
            opacity: 80,
            position,
          }),
        },
      });
      expect(res.ok(), `watermark at ${position} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("add rotated watermark", async ({ request }) => {
    const res = await request.post("/api/v1/tools/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "DRAFT",
          fontSize: 36,
          color: "#ff0000",
          opacity: 40,
          position: "center",
          rotation: -45,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Watermark Image ────────────────────────────────────────────────

test.describe("Watermark Image", () => {
  test("add image watermark via API", async ({ request }) => {
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
          value: JSON.stringify({ position: "bottom-right", opacity: 50, scale: 25 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/watermark-image", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Text Overlay ───────────────────────────────────────────────────

test.describe("Text Overlay", () => {
  test("add text overlay at center", async ({ request }) => {
    const res = await request.post("/api/v1/tools/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "Hello World",
          fontSize: 48,
          color: "#FFFFFF",
          position: "center",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("add text overlay at top", async ({ request }) => {
    const res = await request.post("/api/v1/tools/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          text: "Title Text",
          fontSize: 24,
          color: "#FF0000",
          position: "top",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("add text overlay at bottom with background box", async ({ request }) => {
    const res = await request.post("/api/v1/tools/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "Caption",
          fontSize: 36,
          color: "#FFFFFF",
          position: "bottom",
          backgroundBox: true,
          backgroundColor: "#000000",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("add text overlay with shadow", async ({ request }) => {
    const res = await request.post("/api/v1/tools/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          text: "Shadow Text",
          fontSize: 40,
          color: "#FFFFFF",
          position: "center",
          shadow: true,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Content-Aware Resize ───────────────────────────────────────────

test.describe("Content-Aware Resize", () => {
  test("content-aware resize to smaller width", async ({ request }) => {
    const res = await request.post("/api/v1/tools/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 150, height: 150 }),
      },
    });
    // Content-aware resize uses caire binary — may return 501 if not installed
    if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    }
  });

  test("content-aware resize JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 80, height: 80 }),
      },
    });
    if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});
