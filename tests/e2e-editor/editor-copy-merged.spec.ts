import { expect, loadTestImage, test } from "./helpers";

// #1944: Copy Merged said nothing when the copy failed, and the Edit menu row
// ran plain Copy instead of copying the flattened image.

const COPY_FAILED = "Copy failed";

async function openCopyMerged(page: import("@playwright/test").Page) {
  await page.click('[data-testid="menu-edit"]');
  await page.click('[data-testid="menu-item-copy-merged"]');
}

test.describe("Copy Merged", () => {
  test("Edit > Copy Merged puts the image on the clipboard", async ({
    editorPage: page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadTestImage(page);
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.evaluate(() => navigator.clipboard.writeText("before-copy"));

    await openCopyMerged(page);

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const items = await navigator.clipboard.read();
          return items.flatMap((item) => [...item.types]);
        }),
      )
      .toContain("image/png");
    // The fixture loadTestImage serves is 200x150; the copy is the document, not the workspace.
    const size = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const bitmap = await createImageBitmap(await item.getType("image/png"));
      return { width: bitmap.width, height: bitmap.height };
    });
    expect(size).toEqual({ width: 200, height: 150 });
    await expect(page.getByText(COPY_FAILED)).toHaveCount(0);
  });

  test("copies the whole document, not the zoomed and panned view (#1978)", async ({
    editorPage: page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadTestImage(page);
    await page.locator("canvas").first().click();
    // Zoom in so the stage's own transform is far from identity. Fit-to-screen
    // has already centred the image with a pan offset.
    await page.keyboard.press("Control+Equal");
    await page.keyboard.press("Control+Equal");
    await page.evaluate(() => navigator.clipboard.writeText("before-copy"));

    await page.keyboard.press("Control+Shift+C");

    // The fixture is a solid (255, 100, 50) 200x150 PNG, so every pixel of the
    // copy, corners included, has to be that colour. A viewport copy has the
    // image shifted and scaled, leaving transparent workspace in the corners.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const items = await navigator.clipboard.read();
          return items.flatMap((item) => [...item.types]);
        }),
      )
      .toContain("image/png");
    const copy = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const bitmap = await createImageBitmap(await item.getType("image/png"));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: [at(0, 0), at(199, 0), at(0, 149), at(199, 149), at(100, 75)],
      };
    });
    expect(copy.width).toBe(200);
    expect(copy.height).toBe(150);
    for (const pixel of copy.pixels) expect(pixel).toEqual([255, 100, 50, 255]);
  });

  test("says so when the browser has no image clipboard", async ({ editorPage: page }) => {
    // A plain-http install has no ClipboardItem; copyImageToClipboard can't copy there.
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
      delete (window as any).ClipboardItem;
    });
    await loadTestImage(page);
    await page.locator("canvas").first().waitFor({ state: "visible" });

    await openCopyMerged(page);
    await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
  });

  // The app reads `mod` from navigator.userAgent, and Playwright's "Desktop
  // Chrome" device reports a Windows one on every host. So the shortcut is Ctrl
  // here even on a Mac, and pressing ControlOrMeta (which follows the host OS)
  // sent Cmd to an app expecting Ctrl (#2149). The other editor specs that use
  // a modifier press Control too.
  test("Ctrl+Shift+C says so too", async ({ editorPage: page }) => {
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
      delete (window as any).ClipboardItem;
    });
    await loadTestImage(page);
    await page.locator("canvas").first().click();

    await page.keyboard.press("Control+Shift+C");
    await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
  });

  test.describe("with a macOS user agent", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });

    test("Cmd+Shift+C says so too", async ({ editorPage: page }) => {
      await page.addInitScript(() => {
        // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
        delete (window as any).ClipboardItem;
      });
      await loadTestImage(page);
      await page.locator("canvas").first().click();

      await page.keyboard.press("Meta+Shift+C");
      await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
    });
  });
});
