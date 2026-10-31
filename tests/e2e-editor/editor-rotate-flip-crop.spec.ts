import { expect, loadTestImage, test } from "./helpers";

// Rotate, flip and crop rebuild the source bitmap on a real canvas. The unit tests
// stand a fake canvas in for jsdom, so this is the smoke test that the browser path
// works: the image decodes, draws and encodes with no error toast, the canvas size
// follows, and undo lands back on the original. The test image is served same-origin,
// so the canvas is never tainted (#2070).
//
// It is NOT a regression test for the stale-bitmap race: it passes on the code from
// before #2070 too, because it can only see the canvas size, and the old race put the
// wrong bitmap under a correct size. The fixture is a solid colour, so pixels can't
// show it either. tests/unit/web/editor-rebake-transforms.test.ts holds the decode
// open and covers that.

const SIZE_ORIGINAL = /^200 x 150 px$/;
const SIZE_ROTATED = /^150 x 200 px$/;

async function openRotation(page: import("@playwright/test").Page) {
  await page.click('[data-testid="menu-image"]');
  await page.locator('[data-testid="menu-item-image-rotation"]').hover();
}

test.describe("Rotate, flip and crop in a real browser (#2070)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await expect(page.locator('[data-testid="status-dimensions"]')).toHaveText(SIZE_ORIGINAL, {
      timeout: 15_000,
    });
  });

  test("Rotate 90 CW swaps the canvas, and undo puts it back", async ({ editorPage: page }) => {
    const dims = page.locator('[data-testid="status-dimensions"]');
    await openRotation(page);
    await page.click('[data-testid="menu-item-90-cw"]');
    await expect(dims).toHaveText(SIZE_ROTATED);

    await page.keyboard.press("Control+z");
    await expect(dims).toHaveText(SIZE_ORIGINAL);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("Ctrl+Z straight after a rotate undoes the rotate", async ({ editorPage: page }) => {
    const dims = page.locator('[data-testid="status-dimensions"]');
    await openRotation(page);
    // No wait between the click and the keypress: the bitmap is still being built.
    await page.click('[data-testid="menu-item-90-cw"]');
    await page.keyboard.press("Control+z");

    await expect(dims).toHaveText(SIZE_ORIGINAL);
    // And the size settles there rather than flipping to the rotated one afterwards.
    await page.waitForTimeout(1500);
    await expect(dims).toHaveText(SIZE_ORIGINAL);
  });

  test("two rotations compose to a half turn", async ({ editorPage: page }) => {
    const dims = page.locator('[data-testid="status-dimensions"]');
    await openRotation(page);
    await page.click('[data-testid="menu-item-90-cw"]');
    await openRotation(page);
    await page.click('[data-testid="menu-item-90-cw"]');
    await expect(dims).toHaveText(SIZE_ORIGINAL);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("Flip horizontal keeps the size and reports no error", async ({ editorPage: page }) => {
    const dims = page.locator('[data-testid="status-dimensions"]');
    await openRotation(page);
    await page.click('[data-testid="menu-item-flip-horizontal"]');
    await page.waitForTimeout(500);
    await expect(dims).toHaveText(SIZE_ORIGINAL);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await expect(dims).toHaveText(SIZE_ORIGINAL);
  });

  test("Apply crop shrinks the canvas to the box, and undo restores it", async ({
    editorPage: page,
  }) => {
    const dims = page.locator('[data-testid="status-dimensions"]');
    await page.locator('[data-tool="crop"]').click();
    await page.getByRole("button", { name: "Apply crop" }).click();
    await expect(dims).toHaveText(/^\d+ x \d+ px$/);
    await expect(dims).not.toHaveText(SIZE_ORIGINAL);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await expect(dims).toHaveText(SIZE_ORIGINAL);
  });
});
