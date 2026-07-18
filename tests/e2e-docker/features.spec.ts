import { expect, test } from "@playwright/test";
import { apiToolPath } from "@snapotter/shared";

// ─── Helpers ────────────────────────────────────────────────────────

let _token: string | undefined;

async function getToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  if (_token) return _token;
  const res = await request.post("/api/auth/login", {
    data: { username: "admin", password: "admin" },
  });
  const body = await res.json();
  _token = body.token as string;
  return _token;
}

interface BundleInfo {
  id: string;
  name: string;
  description: string;
  estimatedSize: string;
  enablesTools: string[];
  status: string;
  compatibility?: "compatible" | "incompatible" | "invalid";
  availableQualities?: Array<"fast" | "balanced" | "best">;
}

async function fetchBundleStatuses(
  request: import("@playwright/test").APIRequestContext,
): Promise<BundleInfo[]> {
  const token = await getToken(request);
  const res = await request.get("/api/v1/features", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return [];
  const data = await res.json();
  return data.bundles as BundleInfo[];
}

// ─── Feature API tests ─────────────────────────────────────────────

test.describe("Feature API", () => {
  test("GET /api/v1/features returns all 7 bundles with correct shape", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = (await response.json()) as { bundles: BundleInfo[] };
    expect(data.bundles).toHaveLength(8);

    const expectedBundles = [
      "background-removal",
      "face-detection",
      "object-eraser-colorize",
      "inpaint-hq",
      "upscale-enhance",
      "photo-restoration",
      "ocr",
      "transcription",
    ];
    for (const id of expectedBundles) {
      const bundle = data.bundles.find((candidate) => candidate.id === id);
      expect(bundle, `Bundle ${id} missing`).toBeDefined();
      expect(bundle?.name).toBeTruthy();
      expect(bundle?.description).toBeTruthy();
      expect(bundle?.estimatedSize).toBeTruthy();
      expect(bundle?.enablesTools).toBeInstanceOf(Array);
      expect(bundle?.enablesTools.length).toBeGreaterThan(0);
      expect(["not_installed", "queued", "installed", "installing", "error"]).toContain(
        bundle?.status,
      );
    }
  });

  test("each bundle has the correct tools", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as { bundles: BundleInfo[] };

    const toolMap: Record<string, string[]> = {
      "background-removal": ["remove-background", "passport-photo"],
      "face-detection": ["blur-faces", "red-eye-removal", "smart-crop"],
      "object-eraser-colorize": ["erase-object", "colorize"],
      "upscale-enhance": ["upscale", "enhance-faces", "noise-removal"],
      "photo-restoration": ["restore-photo"],
      ocr: ["ocr", "ocr-pdf"],
      transcription: ["transcribe-audio", "auto-subtitles"],
    };

    for (const [bundleId, expectedTools] of Object.entries(toolMap)) {
      const bundle = data.bundles.find((candidate) => candidate.id === bundleId);
      expect(bundle?.enablesTools).toEqual(expectedTools);
    }
  });

  test("POST install returns 404 for unknown bundle", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.post("/api/v1/admin/features/nonexistent/install", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("GET disk-usage returns totalBytes", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.get("/api/v1/admin/features/disk-usage", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(typeof data.totalBytes).toBe("number");
  });
});

// ─── Optional OCR runtime contract ────────────────────────────────

test.describe("Optional OCR runtime", () => {
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );

  async function callOcr(
    request: import("@playwright/test").APIRequestContext,
    settings: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const token = await getToken(request);
    const response = await request.post("/api/v1/tools/image/ocr", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        settings: JSON.stringify(settings),
      },
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (response.status() !== 202 || typeof body.jobId !== "string") {
      return { status: response.status(), body };
    }

    const progress = await request.get(`/api/v1/jobs/${encodeURIComponent(body.jobId)}/progress`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120_000,
    });
    expect(progress.ok()).toBe(true);
    const frames = (await progress.text())
      .split(/\n\n/u)
      .map((frame) => frame.match(/^data:\s*(.+)$/mu)?.[1])
      .filter((data): data is string => data !== undefined)
      .map((data) => JSON.parse(data) as Record<string, unknown>);
    const terminal = [...frames]
      .reverse()
      .find((frame) => frame.phase === "complete" || frame.phase === "failed");
    expect(terminal).toBeDefined();
    if (terminal?.phase === "failed") {
      return { status: 422, body: { error: terminal.error ?? "OCR failed" } };
    }
    expect(terminal?.result).toBeDefined();
    return { status: 200, body: terminal?.result as Record<string, unknown> };
  }

  test("OCR advertises built-in Fast independently of the optional pack", async ({ request }) => {
    const bundles = await fetchBundleStatuses(request);
    const ocr = bundles.find((bundle) => bundle.id === "ocr");
    expect(ocr).toBeDefined();
    expect(ocr?.availableQualities).toContain("fast");

    const response = await callOcr(request, { quality: "fast" });
    expect(response.status).toBe(200);
    const { body } = response;
    expect(body).toMatchObject({
      engine: "tesseract",
      provider: "native",
      device: "cpu",
      requestedQuality: "fast",
      actualQuality: "fast",
      degraded: false,
    });
  });

  test("default OCR remains runnable with or without the accurate pack", async ({ request }) => {
    const response = await callOcr(request, {});
    expect(response.status).toBe(200);
    const { body } = response;
    expect(["fast", "best"]).toContain(body.actualQuality);
    if (body.actualQuality === "fast") {
      expect(body).toMatchObject({ engine: "tesseract", provider: "native", device: "cpu" });
    } else {
      expect(body).toMatchObject({
        engine: "rapidocr-onnx",
        provider: "CPUExecutionProvider",
        device: "cpu",
      });
    }
  });

  for (const quality of ["balanced", "best"] as const) {
    test(`${quality} OCR is gated only by the signed accurate runtime`, async ({ request }) => {
      const bundles = await fetchBundleStatuses(request);
      const ocr = bundles.find((bundle) => bundle.id === "ocr");
      const available = ocr?.availableQualities?.includes(quality) ?? false;
      const response = await callOcr(request, { quality });
      const { body } = response;

      if (available) {
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          engine: "rapidocr-onnx",
          provider: "CPUExecutionProvider",
          device: "cpu",
          requestedQuality: quality,
          actualQuality: quality,
          degraded: false,
        });
      } else {
        expect(response.status).toBe(501);
        expect(["FEATURE_NOT_INSTALLED", "FEATURE_INCOMPATIBLE"]).toContain(body.code);
        expect(body).toMatchObject({ feature: "ocr", requestedQuality: quality });
      }
    });
  }

  // All other AI tools have their bundles installed -- expect 200 (guard allows through)
  const installedAiTools = [
    { tool: "remove-background", bundle: "background-removal" },
    { tool: "upscale", bundle: "upscale-enhance" },
    { tool: "blur-faces", bundle: "face-detection" },
    { tool: "erase-object", bundle: "object-eraser-colorize" },
    { tool: "colorize", bundle: "object-eraser-colorize" },
    { tool: "enhance-faces", bundle: "upscale-enhance" },
    { tool: "noise-removal", bundle: "upscale-enhance" },
    { tool: "red-eye-removal", bundle: "face-detection" },
    { tool: "restore-photo", bundle: "photo-restoration" },
    { tool: "passport-photo", bundle: "background-removal" },
  ];

  for (const { tool } of installedAiTools) {
    test(`${tool} returns 200 when bundle is installed`, async ({ request }) => {
      const response = await request.post(apiToolPath(tool), {
        multipart: {
          file: {
            name: "test.png",
            mimeType: "image/png",
            buffer: pngBuffer,
          },
          settings: JSON.stringify({}),
        },
      });
      expect(response.status()).toBe(200);
    });
  }

  test("non-AI tool works normally (resize)", async ({ request }) => {
    const response = await request.post("/api/v1/tools/image/resize", {
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        settings: JSON.stringify({ width: 100, height: 100, method: "fit" }),
      },
    });
    // Should succeed or fail with a processing error, NOT 501
    expect(response.status()).not.toBe(501);
  });

  test("Fast OCR batch is not gated by the optional pack", async ({ request }) => {
    const response = await request.post("/api/v1/tools/image/ocr/batch", {
      multipart: {
        "files[]": {
          name: "test.png",
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        settings: JSON.stringify({ quality: "fast" }),
      },
    });
    expect(response.status()).not.toBe(501);
    expect(response.ok()).toBeTruthy();
  });

  test("OCR page always exposes Fast and offers the pack only for accurate tiers", async ({
    page,
    request,
  }) => {
    const bundles = await fetchBundleStatuses(request);
    const ocr = bundles.find((bundle) => bundle.id === "ocr");
    await page.goto("/ocr");
    const fast = page.getByRole("button", { name: "Fast", exact: true });
    await expect(fast).toBeVisible({ timeout: 10000 });

    if (ocr?.availableQualities?.includes("best")) {
      await expect(page.getByRole("button", { name: "Best", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } else {
      await expect(fast).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Balanced", exact: true }).click();
      await expect(page.getByText("additional download")).toBeVisible();
      if (ocr?.compatibility === "compatible") {
        await expect(page.getByRole("button", { name: /enable/i })).toBeVisible();
      }
    }
  });
});

// ─── GUI tests (no bundle state dependency) ─────────────────────────

test.describe("Feature install UI", () => {
  test("non-AI tool page loads normally", async ({ page }) => {
    await page.goto("/resize");
    // Should show the normal tool UI, not an install prompt
    await expect(page.getByText("additional download")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("settings dialog has AI Features section", async ({ page }) => {
    await page.goto("/resize");
    // Open settings - look for a settings button/gear icon
    const settingsButton = page
      .getByRole("button", { name: /settings/i })
      .or(page.locator("button[aria-label*='ettings']"));
    if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsButton.click();
      await expect(page.getByText("AI Features")).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("AI Features settings shows all 7 bundles", async ({ page }) => {
    await page.goto("/resize");
    const settingsButton = page
      .getByRole("button", { name: /settings/i })
      .or(page.locator("button[aria-label*='ettings']"));
    if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsButton.click();
      // Click AI Features nav item
      const aiNav = page.getByText("AI Features");
      if (await aiNav.isVisible({ timeout: 3000 }).catch(() => false)) {
        await aiNav.click();
        // Should show all 7 bundles
        await expect(page.getByText("Background Removal")).toBeVisible({
          timeout: 5000,
        });
        await expect(page.getByText("Face Detection")).toBeVisible();
        await expect(page.getByText("Object Eraser & Colorize")).toBeVisible();
        await expect(page.getByText("Upscale & Enhance")).toBeVisible();
        await expect(page.getByText("Photo Restoration")).toBeVisible();
        await expect(page.getByText("OCR")).toBeVisible();
        await expect(page.getByText("Transcription")).toBeVisible();
      }
    }
  });
});
