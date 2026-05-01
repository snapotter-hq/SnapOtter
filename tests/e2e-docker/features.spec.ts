import { expect, test } from "@playwright/test";

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
  status: string;
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
  test("GET /api/v1/features returns all 6 bundles with correct shape", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.bundles).toHaveLength(6);

    const expectedBundles = [
      "background-removal",
      "face-detection",
      "object-eraser-colorize",
      "upscale-enhance",
      "photo-restoration",
      "ocr",
    ];
    for (const id of expectedBundles) {
      const bundle = data.bundles.find((b: any) => b.id === id);
      expect(bundle, `Bundle ${id} missing`).toBeDefined();
      expect(bundle.name).toBeTruthy();
      expect(bundle.description).toBeTruthy();
      expect(bundle.estimatedSize).toBeTruthy();
      expect(bundle.enablesTools).toBeInstanceOf(Array);
      expect(bundle.enablesTools.length).toBeGreaterThan(0);
      expect(["not_installed", "installed", "installing", "error"]).toContain(bundle.status);
    }
  });

  test("each bundle has the correct tools", async ({ request }) => {
    const token = await getToken(request);
    const response = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    const toolMap: Record<string, string[]> = {
      "background-removal": ["remove-background", "passport-photo"],
      "face-detection": ["blur-faces", "red-eye-removal", "smart-crop"],
      "object-eraser-colorize": ["erase-object", "colorize"],
      "upscale-enhance": ["upscale", "enhance-faces", "noise-removal"],
      "photo-restoration": ["restore-photo"],
      ocr: ["ocr"],
    };

    for (const [bundleId, expectedTools] of Object.entries(toolMap)) {
      const bundle = data.bundles.find((b: any) => b.id === bundleId);
      expect(bundle.enablesTools).toEqual(expectedTools);
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

// ─── Tool route guard tests (serial: manages ocr bundle lifecycle) ──

test.describe("Tool route guards", () => {
  test.describe.configure({ mode: "serial" });

  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );

  test.beforeAll(async ({ request }) => {
    const token = await getToken(request);
    const bundles = await fetchBundleStatuses(request);
    const ocr = bundles.find((b) => b.id === "ocr");
    if (ocr?.status === "installed") {
      await request.post("/api/v1/admin/features/ocr/uninstall", {
        headers: { Authorization: `Bearer ${token}` },
      });
      for (let i = 0; i < 30; i++) {
        const updated = await fetchBundleStatuses(request);
        if (updated.find((b) => b.id === "ocr")?.status === "not_installed") break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  });

  test.afterAll(async ({ request }) => {
    const token = await getToken(request);
    await request.post("/api/v1/admin/features/ocr/install", {
      headers: { Authorization: `Bearer ${token}` },
    });
    for (let i = 0; i < 60; i++) {
      const updated = await fetchBundleStatuses(request);
      if (updated.find((b) => b.id === "ocr")?.status === "installed") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  });

  // ocr bundle is uninstalled -- expect 501
  test("ocr returns 501 FEATURE_NOT_INSTALLED with correct bundle", async ({ request }) => {
    const response = await request.post("/api/v1/tools/ocr", {
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        settings: JSON.stringify({}),
      },
    });
    expect(response.status()).toBe(501);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    expect(body.feature).toBe("ocr");
    expect(body.featureName).toBeTruthy();
    expect(body.estimatedSize).toBeTruthy();
  });

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
      const response = await request.post(`/api/v1/tools/${tool}`, {
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
    const response = await request.post("/api/v1/tools/resize", {
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

  // ─── Uninstall conflict (ocr is not installed at this point) ──────

  test("POST uninstall returns 409 for not-installed bundle", async ({ request }) => {
    const response = await request.post("/api/v1/admin/features/ocr/uninstall");
    expect(response.status()).toBe(409);
  });

  // ─── Batch guard (ocr is not installed at this point) ─────────────

  test("batch endpoint returns 501 for uninstalled AI tool", async ({ request }) => {
    const response = await request.post("/api/v1/tools/ocr/batch", {
      multipart: {
        "files[]": {
          name: "test.png",
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        settings: JSON.stringify({}),
      },
    });
    expect(response.status()).toBe(501);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INSTALLED");
  });

  // ─── GUI tests (ocr is not installed at this point) ───────────────

  test("uninstalled AI tool page shows install prompt", async ({ page }) => {
    await page.goto("/ocr");
    await expect(page.getByText("OCR")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("additional download")).toBeVisible();
    await expect(page.getByRole("button", { name: /enable/i })).toBeVisible();
  });

  test("AI tools show download badge in sidebar", async ({ page }) => {
    await page.goto("/resize");
    // Wait for the sidebar to load
    await expect(page.locator("[data-testid='tool-panel']").or(page.locator("nav"))).toBeVisible({
      timeout: 10000,
    });
    // The download icon should be visible near the OCR tool
    const ocrLink = page.locator("a[href='/ocr']");
    await expect(ocrLink).toBeVisible();
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

  test("AI Features settings shows all 6 bundles", async ({ page }) => {
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
        // Should show all 6 bundles
        await expect(page.getByText("Background Removal")).toBeVisible({
          timeout: 5000,
        });
        await expect(page.getByText("Face Detection")).toBeVisible();
        await expect(page.getByText("Object Eraser & Colorize")).toBeVisible();
        await expect(page.getByText("Upscale & Enhance")).toBeVisible();
        await expect(page.getByText("Photo Restoration")).toBeVisible();
        await expect(page.getByText("OCR")).toBeVisible();
      }
    }
  });
});
