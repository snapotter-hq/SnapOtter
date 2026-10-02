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

  test("Ctrl+Shift+C says so too", async ({ editorPage: page }) => {
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
      delete (window as any).ClipboardItem;
    });
    await loadTestImage(page);
    await page.locator("canvas").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+C");
    await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
  });
});
