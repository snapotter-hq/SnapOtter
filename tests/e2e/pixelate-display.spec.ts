import path from "node:path";
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
    const round1Src = await result.getAttribute("src");
    expect(round1Src).toContain("/api/v1/download/");

    // The selection box is an input control and stays available for the
    // next region, rendered over the result.
    const box = page.getByTestId("pixelate-selection-box");
    await expect(box).toBeVisible();

    // Round 2: the box must still be draggable over the result, and
    // re-applying must put a NEW result on screen, not the stale one.
    const beforeLeft = await box.evaluate((el) => (el as HTMLElement).style.left);
    const bb = await box.boundingBox();
    expect(bb).not.toBeNull();
    if (!bb) return;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 - 80, bb.y + bb.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => box.evaluate((el) => (el as HTMLElement).style.left))
      .not.toBe(beforeLeft);

    await submit.click();
    await expect(page.getByTestId("pixelate-download")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => result.getAttribute("src"), { timeout: 15_000 })
      .not.toBe(round1Src);
    expect(await result.getAttribute("src")).toContain("/api/v1/download/");
  });

  test("selection mode shows the decoded result preview for TIFF output", async ({
    loggedInPage: page,
  }) => {
    // Pixelate mirrors the input format, so a TIFF input produces a TIFF
    // result the browser cannot render in <img>. The server-generated
    // preview must be shown; falling back to the original blob would show
    // unredacted content labeled as the result.
    await page.goto("/image/pixelate");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /upload from computer/i })
      .first()
      .click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join(process.cwd(), "tests", "fixtures", "image", "formats", "sample.tiff"),
    );

    await page.getByTestId("pixelate-mode-selection").click();
    await expect(page.getByTestId("pixelate-selection-box")).toBeVisible({ timeout: 10_000 });

    const submit = page.getByTestId("pixelate-submit");
    await expect(submit).toBeEnabled({ timeout: 5000 });
    await submit.click();
    await expect(page.getByTestId("pixelate-download")).toBeVisible({ timeout: 30_000 });

    const result = page.locator('img[alt="sample_pixelated.tiff"]');
    await expect(result).toBeVisible({ timeout: 10_000 });
    const src = await result.getAttribute("src");
    expect(src).not.toContain("blob:");
    expect(src).toContain("/api/v1/download/");
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
