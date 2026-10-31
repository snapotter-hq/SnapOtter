import { expect, test } from "./helpers";

test.describe("Editor New Document Dialog", () => {
  test("validates canvas limit and fails gracefully", async ({ editorPage: page }) => {
    // Navigate and open the dialog
    await page.click('[data-testid="menu-file"]');
    await page.click('[data-testid="menu-item-new"]');

    // Check dialog opens
    await expect(page.getByText("New Document").first()).toBeVisible();

    // Set 10000x10000 which will cause an empty data url string return if memory fails
    await page.fill("#new-doc-width", "10000");
    await page.fill("#new-doc-height", "10000");

    // Mock toDataURL to return "data:," which mimics OOM behavior, but only for the next call
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = () => {
        HTMLCanvasElement.prototype.toDataURL = original;
        return "data:,";
      };
    });

    // Click create
    await page.click('button:has-text("Create")');

    // Check if a toast error is visible
    await expect(
      page
        .getByText(
          "This image is too big for your browser to edit with this tool. Try a smaller canvas size.",
        )
        .first(),
    ).toBeVisible({ timeout: 2000 });
  });
});
