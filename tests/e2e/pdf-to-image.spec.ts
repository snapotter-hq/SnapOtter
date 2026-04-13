import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

const PDF_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "test-3page.pdf");

test.describe("PDF to Image tool", () => {
  test("shows page thumbnails after uploading a PDF", async ({ loggedInPage: page }) => {
    await page.goto("/pdf-to-image");

    // Upload PDF via file input
    const fileInput = page.locator("input[type='file'][accept='application/pdf']");
    await fileInput.setInputFiles(PDF_FIXTURE);

    // Wait for page count to appear
    await expect(page.locator(".bg-muted").getByText("3 pages")).toBeVisible({ timeout: 15_000 });

    // Wait for thumbnails to appear in the results panel
    await expect(page.locator("text=3 of 3 pages selected")).toBeVisible({ timeout: 15_000 });
  });

  test("converts a PDF page to an image and shows results", async ({ loggedInPage: page }) => {
    await page.goto("/pdf-to-image");

    // Upload PDF
    const fileInput = page.locator("input[type='file'][accept='application/pdf']");
    await fileInput.setInputFiles(PDF_FIXTURE);
    await expect(page.locator(".bg-muted").getByText("3 pages")).toBeVisible({ timeout: 15_000 });

    // Set pages to just page 1
    await page.fill("#pdf-pages", "1");

    // Click convert
    await page.getByTestId("pdf-to-image-submit").click();

    // Wait for processing
    await waitForProcessing(page);

    // Verify download link appears
    await expect(page.getByTestId("pdf-to-image-download")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pdf-to-image-download")).toContainText("Download All");

    // Verify results panel shows converted page
    await expect(page.locator("text=1 page converted")).toBeVisible();
  });

  test("can select and deselect pages via thumbnails", async ({ loggedInPage: page }) => {
    await page.goto("/pdf-to-image");

    // Upload PDF
    const fileInput = page.locator("input[type='file'][accept='application/pdf']");
    await fileInput.setInputFiles(PDF_FIXTURE);
    await expect(page.locator("text=3 of 3 pages selected")).toBeVisible({ timeout: 15_000 });

    // Click "Deselect All"
    await page.locator("text=Deselect All").click();
    await expect(page.locator("text=0 of 3 pages selected")).toBeVisible();

    // Click "Select All"
    await page.locator("text=Select All").click();
    await expect(page.locator("text=3 of 3 pages selected")).toBeVisible();
  });
});
