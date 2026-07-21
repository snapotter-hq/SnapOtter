import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

// Regression guard: the page-range box in remove/extract/split PDF tools used
// to ship a hardcoded default (remove-pages "2,4-6") that is out of range for
// any PDF with fewer pages, so clicking the tool on a typical short PDF failed
// with "page out of range". The box now starts empty and submit stays disabled
// until a range is entered.
const PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "test-3page.pdf",
);

async function uploadPdf(page: import("@playwright/test").Page) {
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
}

test.describe("PDF page-range default (out-of-range footgun fix)", () => {
  test("remove-pages: box starts empty, submit disabled until a range is typed, then deletes", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/remove-pages");
    await uploadPdf(page);

    const pagesInput = page.locator("#rp-pages");
    await expect(pagesInput).toHaveValue("");
    await expect(pagesInput).toHaveAttribute("placeholder", "2,4-6");

    const submit = page.getByTestId("remove-pages-submit");
    await expect(submit).toBeDisabled();

    // Typing a valid page on the 3-page fixture enables submit and processes.
    await pagesInput.fill("2");
    await expect(submit).toBeEnabled();

    await submit.click();
    await waitForProcessing(page, 60_000);
    await expect(page.getByText("Download").first()).toBeVisible({ timeout: 30_000 });
  });

  test("extract-pages: submit disabled while the range box is empty", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/extract-pages");
    await uploadPdf(page);

    const rangeInput = page.locator("#ep-range");
    await expect(rangeInput).toHaveValue("");

    const submit = page.getByTestId("extract-pages-submit");
    await expect(submit).toBeDisabled();

    await rangeInput.fill("1");
    await expect(submit).toBeEnabled();
  });

  test("split-pdf: submit disabled while the range box is empty in range mode", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/split-pdf");
    await uploadPdf(page);

    const rangeInput = page.locator("#sp-range");
    await expect(rangeInput).toHaveValue("");

    const submit = page.getByTestId("split-pdf-submit");
    await expect(submit).toBeDisabled();

    await rangeInput.fill("1-2");
    await expect(submit).toBeEnabled();
  });
});
