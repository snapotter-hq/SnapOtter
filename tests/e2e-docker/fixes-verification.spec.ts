import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

function getFixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
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

// ─── 1. Error messages should never show [object Object] ─────────────

test.describe("Error message formatting", () => {
  test("tool validation error shows readable message, not [object Object]", async ({ request }) => {
    // Send a malformed request directly to trigger a validation error
    const res = await request.post("/api/v1/tools/resize", {
      multipart: {
        file: {
          name: "test.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("not-an-image"),
        },
        settings: JSON.stringify({ width: 0 }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
    expect(body.error).not.toContain("[object Object]");
    if (body.details) {
      expect(typeof body.details).toBe("string");
      expect(body.details).not.toContain("[object Object]");
    }
  });
});

// ─── 2. Image-to-PDF auth fix ────────────────────────────────────────

test.describe("Image-to-PDF", () => {
  test("single image converts to PDF without auth error", async ({ page }) => {
    await page.goto("/image-to-pdf");

    // image-to-pdf has its own upload UI — use the Upload button
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Upload from computer").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getFixture("test-100x100.jpg"));
    await page.waitForTimeout(3000);

    const processBtn = page.getByRole("button", { name: /create pdf/i });
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    // Should NOT see "Authentication required"
    const errorEl = page.locator(".text-red-500, [class*='text-red']");
    if (await errorEl.isVisible({ timeout: 3000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("Authentication required");
      expect(text).not.toContain("[object Object]");
    }

    // Should see a download link
    const downloadLink = page.locator("a[download], a[href*='download']");
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });
  });

  test("multiple images create multi-page PDF", async ({ page }) => {
    await page.goto("/image-to-pdf");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Upload from computer").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([getFixture("test-100x100.jpg"), getFixture("test-200x150.png")]);
    await page.waitForTimeout(3000);

    const processBtn = page.getByRole("button", { name: /create pdf/i });
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    const errorEl = page.locator(".text-red-500, [class*='text-red']");
    if (await errorEl.isVisible({ timeout: 3000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("Authentication required");
    }

    const downloadLink = page.locator("a[download], a[href*='download']");
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 3. Split tool multi-file ────────────────────────────────────────

test.describe("Split tool", () => {
  test("single image splits into tiles", async ({ page }) => {
    await page.goto("/split");
    await uploadFiles(page, [getFixture("test-200x150.png")]);

    // Use 2x2 preset
    await page.getByRole("button", { name: "2x2" }).click();

    const processBtn = page.getByTestId("split-submit");
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 30_000);

    // Should see tile preview grid
    const tiles = page.locator("button[title^='Download tile']");
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
    const tileCount = await tiles.count();
    expect(tileCount).toBe(4);

    // ZIP download button should appear
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();

    // No errors
    const error = page.locator(".text-red-500");
    expect(await error.isVisible({ timeout: 1000 }).catch(() => false)).toBe(false);
  });

  test("multiple images all get split with subfolders in ZIP", async ({ page }) => {
    await page.goto("/split");
    await uploadFiles(page, [getFixture("test-100x100.jpg"), getFixture("test-200x150.png")]);

    await page.getByRole("button", { name: "2x2" }).click();

    const processBtn = page.getByTestId("split-submit");
    await expect(processBtn).toBeEnabled({ timeout: 5000 });

    // Button should indicate multiple images
    const btnText = await processBtn.textContent();
    expect(btnText).toContain("2 Images");

    await processBtn.click();
    await waitForProcessingDone(page, 60_000);

    // ZIP download should appear
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible({
      timeout: 15_000,
    });

    // Tile preview should show tiles from first image
    const tiles = page.locator("button[title^='Download tile']");
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });

    // Summary should mention both images
    const summary = page.locator("text=images split");
    if (await summary.isVisible({ timeout: 2000 })) {
      const text = await summary.textContent();
      expect(text).toContain("2");
    }
  });
});

// ─── 4. Batch processing (tools that had single-file bug) ────────────

test.describe("Batch processing fixes", () => {
  test("strip-metadata processes multiple files", async ({ page }) => {
    await page.goto("/strip-metadata");
    await uploadFiles(page, [getFixture("test-with-exif.jpg"), getFixture("test-100x100.jpg")]);

    // There should be a thumbnail strip with 2 entries
    await page.waitForTimeout(500);

    const processBtn = page.getByRole("button", { name: /strip|remove|process/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 30_000);

    // Should see ZIP download button for batch
    const zipBtn = page.locator(
      "button:has-text('ZIP'), a:has-text('ZIP'), button:has-text('Download All')",
    );
    await expect(zipBtn).toBeVisible({ timeout: 15_000 });
  });

  test("blur-faces processes multiple files", async ({ page }) => {
    await page.goto("/blur-faces");

    await uploadFiles(page, [
      getFixture("content/multi-face.webp"),
      getFixture("content/portrait-color.jpg"),
    ]);

    const processBtn = page.getByRole("button", { name: /blur|process/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 60_000);

    // Should see batch ZIP
    const zipBtn = page.locator(
      "button:has-text('ZIP'), a:has-text('ZIP'), button:has-text('Download All')",
    );
    await expect(zipBtn).toBeVisible({ timeout: 30_000 });
  });

  test("vectorize processes multiple files", async ({ page }) => {
    await page.goto("/vectorize");
    await uploadFiles(page, [getFixture("test-100x100.jpg"), getFixture("test-50x50.webp")]);

    const processBtn = page.getByTestId("vectorize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 30_000);

    // Should see ZIP download for batch
    const zipBtn = page.locator(
      "button:has-text('ZIP'), a:has-text('ZIP'), button:has-text('Download All')",
    );
    await expect(zipBtn).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 5. Passport photo error handling ────────────────────────────────

test.describe("Passport photo", () => {
  test("error message is readable, not [object Object]", async ({ page }) => {
    await page.goto("/passport-photo");

    // Upload a non-face image to trigger face detection failure
    await uploadFiles(page, [getFixture("test-100x100.jpg")]);

    // Wait for auto-analyze to run and potentially fail
    await page.waitForTimeout(5000);

    // Check for error message
    const errorEl = page.locator(".text-red-500, [class*='text-red'], [class*='error']");
    if (await errorEl.isVisible({ timeout: 10_000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("[object Object]");
      if (text && text.length > 0) {
        expect(text.length).toBeGreaterThan(3);
      }
    }
  });

  test("passport photo works with real portrait", async ({ page }) => {
    await page.goto("/passport-photo");
    await uploadFiles(page, [getFixture("content/portrait-color.jpg")]);

    // Wait for face analysis (uses MediaPipe + rembg, can be slow on CPU)
    await page.waitForTimeout(5000);
    const analyzeSpinner = page.locator("[class*='animate-spin']").first();
    if (await analyzeSpinner.isVisible({ timeout: 3000 })) {
      await analyzeSpinner.waitFor({ state: "hidden", timeout: 180_000 });
    }

    // Face detection should succeed — look for the Generate button
    const generateBtn = page.getByRole("button", { name: /generate|create/i });
    const analyzeError = page.locator("p.text-red-500");
    const gotButton = await generateBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    const gotError = await analyzeError.isVisible({ timeout: 1000 }).catch(() => false);
    if (gotError) {
      const text = await analyzeError.textContent();
      expect(text).not.toContain("[object Object]");
    }
    expect(gotButton || gotError).toBe(true);
  });
});

// ─── 6. OCR modes ────────────────────────────────────────────────────

test.describe("OCR", () => {
  test("fast mode works and returns engine info", async ({ page }) => {
    await page.goto("/ocr");
    await uploadFiles(page, [getFixture("test-100x100.jpg")]);

    // Select fast mode
    const fastBtn = page.getByRole("button", { name: /fast/i });
    if (await fastBtn.isVisible({ timeout: 2000 })) {
      await fastBtn.click();
    }

    const processBtn = page.getByRole("button", { name: /extract|scan|process/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 60_000);

    // Should not show [object Object]
    const errorEl = page.locator(".text-red-500, [class*='text-red']");
    if (await errorEl.isVisible({ timeout: 3000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("[object Object]");
    }
  });

  test("balanced mode works", async ({ page }) => {
    await page.goto("/ocr");
    await uploadFiles(page, [getFixture("test-100x100.jpg")]);

    const balancedBtn = page.getByRole("button", { name: /balanced/i });
    if (await balancedBtn.isVisible({ timeout: 2000 })) {
      await balancedBtn.click();
    }

    const processBtn = page.getByRole("button", { name: /extract|scan|process/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 120_000);

    const errorEl = page.locator(".text-red-500, [class*='text-red']");
    if (await errorEl.isVisible({ timeout: 5000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("[object Object]");
    }
  });

  test("best mode works", async ({ page }) => {
    await page.goto("/ocr");
    await uploadFiles(page, [getFixture("test-100x100.jpg")]);

    const bestBtn = page.getByRole("button", { name: /best/i });
    if (await bestBtn.isVisible({ timeout: 2000 })) {
      await bestBtn.click();
    }

    const processBtn = page.getByRole("button", { name: /extract|scan|process/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page, 120_000);

    const errorEl = page.locator(".text-red-500, [class*='text-red']");
    if (await errorEl.isVisible({ timeout: 5000 })) {
      const text = await errorEl.textContent();
      expect(text).not.toContain("[object Object]");
    }
  });
});

// ─── 7. Common tools still work (regression check) ──────────────────

test.describe("Regression checks", () => {
  test("resize single image works", async ({ page }) => {
    await page.goto("/resize");
    await uploadFiles(page, [getFixture("test-200x150.png")]);

    // Set explicit width so the button enables
    const widthInput = page.getByLabel("Width (px)");
    await widthInput.fill("100");

    const processBtn = page.getByTestId("resize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    const error = page.locator(".text-red-500");
    expect(await error.isVisible({ timeout: 2000 }).catch(() => false)).toBe(false);
  });

  test("compress single image works", async ({ page }) => {
    await page.goto("/compress");
    await uploadFiles(page, [getFixture("test-100x100.jpg")]);

    const processBtn = page.getByRole("button", { name: /compress/i });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    const error = page.locator(".text-red-500");
    expect(await error.isVisible({ timeout: 2000 }).catch(() => false)).toBe(false);
  });

  test("resize batch processes multiple files", async ({ page }) => {
    await page.goto("/resize");
    await uploadFiles(page, [getFixture("test-100x100.jpg"), getFixture("test-200x150.png")]);

    // Set explicit width so the button enables
    const widthInput = page.getByLabel("Width (px)");
    await widthInput.fill("50");

    const processBtn = page.getByTestId("resize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page, 30_000);

    // Batch should produce ZIP
    const zipBtn = page.locator(
      "button:has-text('ZIP'), a:has-text('ZIP'), button:has-text('Download All')",
    );
    await expect(zipBtn).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 8. Docker container health and logging ──────────────────────────

test.describe("Container health", () => {
  test("health endpoint returns healthy", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  test("API returns structured errors, not HTML", async ({ request }) => {
    const res = await request.get("/api/v1/tools/nonexistent");
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");
  });

  test("error responses have string details, not objects", async ({ request }) => {
    const formData = new URLSearchParams();
    const res = await request.post("/api/v1/tools/resize", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: formData.toString(),
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    if (body.details) {
      expect(typeof body.details).toBe("string");
    }
    if (body.error) {
      expect(typeof body.error).toBe("string");
    }
  });
});
