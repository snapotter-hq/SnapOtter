import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// What is on screen AFTER processing, for live-preview tools (#713).
//
// Live-preview tools whose wrapper style simulates the result (vignette,
// duotone, beautify, ...) keep showing the styled original: WYSIWYG. Pixelate
// is different: its overlay is the selection box, an input control, so after
// processing the viewer must switch to the server-rendered result. Before the
// fix, selection mode kept showing the untouched original forever while the
// download link quietly carried the real result.
// ---------------------------------------------------------------------------

test.describe("Pixelate result display (#713)", () => {
  test("whole-image mode shows the processed image", async ({ loggedInPage: page }) => {
    await page.goto("/image/pixelate");
    await uploadTestImage(page);

    const submit = page.getByTestId("pixelate-submit");
    await expect(submit).toBeEnabled({ timeout: 5000 });
    await submit.click();
    await expect(page.getByTestId("pixelate-download")).toBeVisible({ timeout: 30_000 });

    const result = page.locator('img[alt="test-image_pixelated.png"]');
    await expect(result).toBeVisible({ timeout: 10_000 });
    expect(await result.getAttribute("src")).toContain("/api/v1/download/");
  });

  test("selection mode shows the processed image and keeps the box", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/pixelate");
    await uploadTestImage(page);

    await page.getByTestId("pixelate-mode-selection").click();
    await expect(page.getByTestId("pixelate-selection-box")).toBeVisible({ timeout: 5000 });

    const submit = page.getByTestId("pixelate-submit");
    await expect(submit).toBeEnabled({ timeout: 5000 });
    await submit.click();
    await expect(page.getByTestId("pixelate-download")).toBeVisible({ timeout: 30_000 });

    // The viewer must switch to the server result, not keep the original.
    const result = page.locator('img[alt="test-image_pixelated.png"]');
    await expect(result).toBeVisible({ timeout: 10_000 });
    expect(await result.getAttribute("src")).toContain("/api/v1/download/");

    // The selection box is an input control and stays available for the
    // next region, rendered over the result.
    await expect(page.getByTestId("pixelate-selection-box")).toBeVisible();
  });

  test("beautify keeps the styled original after processing (WYSIWYG pin)", async ({
    loggedInPage: page,
  }) => {
    // The other side of the contract: for tools whose wrapper style simulates
    // the result, processing must NOT switch the viewer away from the styled
    // original. Guards against "fixing" #713 by dropping that branch.
    await page.goto("/image/beautify");
    await uploadTestImage(page);

    const submit = page.getByTestId("beautify-submit");
    await expect(submit).toBeEnabled({ timeout: 5000 });
    await submit.click();
    await expect(page.getByTestId("beautify-download")).toBeVisible({ timeout: 30_000 });

    const original = page.locator('img[alt="test-image.png"]');
    await expect(original).toBeVisible({ timeout: 10_000 });
    expect(await original.getAttribute("src")).toContain("blob:");
  });
});
