import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "document", "valid");

async function uploadPdfs(page: Page, filenames: string[]): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /upload from computer/i })
    .first()
    .click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filenames.map((f) => path.join(FIXTURES_DIR, f)));
  await page.waitForTimeout(500);
}

/**
 * Issue #632: pdf-to-image-group presets (pdf-to-jpg, pdf-to-png, pdf-to-tiff)
 * turn one PDF into many page images, so 2+ uploads belong on the per-file
 * /batch endpoint. Those presets register through registerPdfToImageRoute,
 * which never entered the registry the generic
 * `:section/:toolId/batch` route reads, so the second file used to 404 with
 * `Tool "<id>" not found`. The route now serves its own /batch.
 */
test.describe("pdf-to-image conversion presets with multiple files (issue #632)", () => {
  test("pdf-to-jpg converts 2 PDFs instead of failing", async ({ loggedInPage: page }) => {
    const batchResponse = page.waitForResponse(
      (res) => res.url().includes("/pdf-to-jpg/batch") && res.request().method() === "POST",
    );

    await page.goto("/pdf/pdf-to-jpg");
    await uploadPdfs(page, ["test-3page.pdf", "alt-2page.pdf"]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    await page.getByTestId("preset-submit").click();

    const response = await batchResponse;
    expect(response.status()).toBe(200);
    await expect(page.getByText("Conversion complete").first()).toBeVisible({ timeout: 30_000 });
  });

  test("pdf-to-png reports the error in the panel when every PDF is unreadable", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/pdf-to-png");
    // Route the batch call so the failure path is deterministic without
    // needing a corrupt fixture that the dropzone would reject up front.
    await page.route("**/pdf-to-png/batch", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "All files failed processing", errors: [] }),
      }),
    );

    await uploadPdfs(page, ["test-3page.pdf", "alt-2page.pdf"]);
    await expect(page.getByText("Files (2)")).toBeVisible();
    await page.getByTestId("preset-submit").click();

    await expect(page.getByText(/All files failed processing/i)).toBeVisible({ timeout: 15_000 });
  });

  test("a single PDF still uses the single-file route", async ({ loggedInPage: page }) => {
    const singleResponse = page.waitForResponse(
      (res) => /\/pdf-to-jpg$/.test(res.url()) && res.request().method() === "POST",
    );

    await page.goto("/pdf/pdf-to-jpg");
    await uploadPdfs(page, ["alt-2page.pdf"]);

    await page.getByTestId("preset-submit").click();

    const response = await singleResponse;
    expect(response.status()).toBe(200);

    const download = page.getByTestId("preset-download");
    await expect(download).toBeVisible({ timeout: 30_000 });
    await expect(download).toHaveAttribute("href", /\/api\/v1\/download\/[^/]+\/pdf-pages\.zip$/);
  });
});
