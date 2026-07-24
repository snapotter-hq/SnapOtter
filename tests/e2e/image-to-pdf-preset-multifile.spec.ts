import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "image", "valid");

async function uploadFiles(page: Page, filenames: string[]): Promise<void> {
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
 * Issue #627: image-to-pdf-group presets (jpg-to-pdf, png-to-pdf, ...) combine
 * every uploaded file into one PDF, the same as the base image-to-pdf tool.
 * Submitting 2+ files used to route to the generic per-file /batch endpoint,
 * which 404s with `Tool "<id>" not found` for these tools (they are
 * registered via registerImageToPdfRoute, never added to the
 * createToolRoute/registerToolProcessFn registry the batch route reads).
 */
test.describe("image-to-pdf-group conversion presets with multiple files (issue #627)", () => {
  test("jpg-to-pdf combines 2 JPGs into one PDF instead of failing", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/jpg-to-pdf");
    await uploadFiles(page, ["portrait-color.jpg", "sample-photo.jpg"]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    await page.getByTestId("preset-submit").click();

    const download = page.getByTestId("preset-download");
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute("href", /\/api\/v1\/download\/[^/]+\/images\.pdf$/);
  });

  test("png-to-pdf combines 2 PNGs into one PDF instead of failing", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/png-to-pdf");
    await uploadFiles(page, ["barcode.png", "portrait-isolated.png"]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    await page.getByTestId("preset-submit").click();

    const download = page.getByTestId("preset-download");
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute("href", /\/api\/v1\/download\/[^/]+\/images\.pdf$/);
  });

  test("jpg-to-png still batches 2 files independently (not a combine preset)", async ({
    loggedInPage: page,
  }) => {
    const batchRequest = page.waitForResponse(
      (res) => res.url().includes("/jpg-to-png/batch") && res.request().method() === "POST",
    );

    await page.goto("/image/jpg-to-png");
    await uploadFiles(page, ["portrait-color.jpg", "sample-photo.jpg"]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    await page.getByTestId("preset-submit").click();

    const response = await batchRequest;
    expect(response.status()).toBe(200);
    await expect(page.getByText("Conversion complete")).toBeVisible({ timeout: 15_000 });
  });
});
