import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

const PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "test-3page.pdf",
);

test.describe("Document display mode (rotate-pdf)", () => {
  test("uploads a PDF, rotates it, and shows the document canvas with processed result", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/rotate-pdf");

    // Upload test-3page.pdf via file chooser
    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
    if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadButton.click();
    } else {
      await page.locator("[class*='border-dashed']").first().click();
    }
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(PDF_FIXTURE);
    await page.waitForTimeout(500);

    // The document canvas should show the source PDF immediately
    const canvas = page.locator("[data-testid='document-canvas']");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Click submit to rotate the PDF (default: 90 degrees, all pages)
    await page.getByTestId("rotate-pdf-submit").click();

    // Wait for processing to complete
    await waitForProcessing(page, 60_000);

    // After processing, the review panel appears with a Download button
    await expect(page.getByText("Download").first()).toBeVisible({ timeout: 30_000 });

    // The document canvas should still be visible (now showing the rotated PDF)
    await expect(canvas).toBeVisible();
  });

  test("document viewer shows page navigation for multi-page PDF", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/rotate-pdf");

    // Upload test-3page.pdf
    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
    if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadButton.click();
    } else {
      await page.locator("[class*='border-dashed']").first().click();
    }
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(PDF_FIXTURE);
    await page.waitForTimeout(500);

    // Wait for the canvas to render the first page
    const canvas = page.locator("[data-testid='document-canvas']");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Page navigation should appear for a 3-page PDF ("1 / 3")
    await expect(page.getByText("1 / 3")).toBeVisible({ timeout: 10_000 });
  });
});
