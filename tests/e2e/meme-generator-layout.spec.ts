import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 664 }, // iPhone viewport
});

test("meme generator top text is reachable on a phone", async ({ page }) => {
  await page.goto("/image/meme-generator");

  // Upload a tiny custom image (1x1 PNG)
  await page.setInputFiles('input[type="file"]', {
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  });

  // Click a layout first to proceed to the editor
  await page.getByTestId("layout-top-bottom").click();

  // Wait for the preview container
  const preview = page.getByTestId("meme-editor-preview");
  await expect(preview).toBeVisible();

  // Wait for image to load to get accurate dimensions
  // Using evaluate to wait for the image's complete property is robust
  const img = preview.locator("img");
  await img.waitFor({ state: "visible" });
  await img.evaluate((image: HTMLImageElement) => {
    if (image.complete) {
      if (image.naturalWidth === 0) {
        throw new Error(`Image failed to load synchronously: ${image.src}`);
      }
      return;
    }
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Failed to load preview image: ${image.src}`));
    });
  });

  // Get the scroller using its new test id
  const scroller = page.getByTestId("meme-editor-scroller");
  await expect(scroller).toBeVisible();

  const scrollerBox = await scroller.boundingBox();
  expect(scrollerBox).not.toBeNull();

  // Try to scroll to the top
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });

  // Re-measure after scroll
  const newPreviewBox = await preview.boundingBox();

  // If the top of the preview box is ABOVE the top of the scroller, and we are scrolled to 0,
  // it means the top content is unreachable!
  expect(newPreviewBox!.y).toBeGreaterThanOrEqual(scrollerBox!.y);
});
