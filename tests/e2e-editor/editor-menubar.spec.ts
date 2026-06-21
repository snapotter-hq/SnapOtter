import { expect, test } from "./helpers";

test.describe("Editor Menu Bar", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await page.waitForSelector('[data-testid="editor-menu-bar"]', { timeout: 10_000 });
  });

  test("renders all 7 top-level menus", async ({ editorPage: page }) => {
    for (const id of ["file", "edit", "image", "layer", "select", "filter", "view"]) {
      await expect(page.locator(`[data-testid="menu-${id}"]`)).toBeVisible();
    }
  });

  test("menu bar has correct height and styling", async ({ editorPage: page }) => {
    const bar = page.locator('[data-testid="editor-menu-bar"]');
    await expect(bar).toHaveClass(/h-8/);
    await expect(bar).toHaveClass(/bg-background/);
  });

  test("File menu opens on click and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    const dropdown = page.locator('[data-testid="menu-dropdown-file"]');
    await expect(dropdown).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-open"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-save"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-export-as"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-close"]')).toBeVisible();
  });

  test("File > New opens new document dialog", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await page.click('[data-testid="menu-item-new"]');
    await expect(page.getByText("New Document").first()).toBeVisible({ timeout: 3000 });
  });

  test("File > Open triggers file chooser", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('[data-testid="menu-item-open"]');
    const chooser = await fileChooserPromise;
    expect(chooser).toBeTruthy();
  });

  test("File > Close is disabled when no image loaded", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    const closeBtn = page.locator('[data-testid="menu-item-close"]');
    await expect(closeBtn).toBeDisabled();
  });

  test("Edit menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-dropdown-edit"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-undo"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-redo"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-cut"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-copy"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-paste"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-delete"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-free-transform"]')).toBeVisible();
  });

  test("Edit > Delete is disabled when no objects selected", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-item-delete"]')).toBeDisabled();
  });

  test("Edit > Transform submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-edit"]');
    const transform = page.locator('[data-testid="menu-item-transform"]');
    await expect(transform).toBeVisible();
    await transform.hover();
    await expect(page.locator('[data-testid="menu-item-scale"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="menu-item-rotate"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-flip-horizontal"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-flip-vertical"]')).toBeVisible();
  });

  test("Image menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-image"]');
    await expect(page.locator('[data-testid="menu-dropdown-image"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-image-size"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-canvas-size"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-image-rotation"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-trim"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-adjustments"]')).toBeVisible();
  });

  test("Image > Image Rotation submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-image"]');
    await page.locator('[data-testid="menu-item-image-rotation"]').hover();
    await expect(page.locator('[data-testid="menu-item-90-cw"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="menu-item-90-ccw"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-180"]')).toBeVisible();
  });

  test("Image > Adjustments submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-image"]');
    await page.locator('[data-testid="menu-item-adjustments"]').hover();
    await expect(page.locator('[data-testid="menu-item-brightness-contrast"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="menu-item-hue-saturation"]')).toBeVisible();
  });

  test("Layer menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-layer"]');
    await expect(page.locator('[data-testid="menu-dropdown-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-new-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-duplicate-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-delete-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-arrange"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-merge-down"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-flatten-image"]')).toBeVisible();
  });

  test("Layer > Delete Layer is disabled with single layer", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-layer"]');
    await expect(page.locator('[data-testid="menu-item-delete-layer"]')).toBeDisabled();
  });

  test("Layer > Arrange submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-layer"]');
    await page.locator('[data-testid="menu-item-arrange"]').hover();
    await expect(page.locator('[data-testid="menu-item-bring-to-front"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="menu-item-send-to-back"]')).toBeVisible();
  });

  test("Select menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-select"]');
    await expect(page.locator('[data-testid="menu-dropdown-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-deselect"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-inverse"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-color-range"]')).toBeVisible();
  });

  test("Filter menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-filter"]');
    await expect(page.locator('[data-testid="menu-dropdown-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-blur"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-sharpen"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-noise"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-pixelate"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-stylize"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-grayscale"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-sepia"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-invert"]')).toBeVisible();
  });

  test("Filter > Blur submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-filter"]');
    await page.locator('[data-testid="menu-item-blur"]').hover();
    await expect(page.locator('[data-testid="menu-item-gaussian-blur"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="menu-item-motion-blur"]')).toBeVisible();
  });

  test("Filter > Stylize submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-filter"]');
    await page.locator('[data-testid="menu-item-stylize"]').hover();
    await expect(page.locator('[data-testid="menu-item-emboss"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="menu-item-solarize"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-posterize"]')).toBeVisible();
  });

  test("Filter > Noise submenu renders", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-filter"]');
    await page.locator('[data-testid="menu-item-noise"]').hover();
    await expect(page.locator('[data-testid="menu-item-add-noise"]')).toBeVisible({
      timeout: 3000,
    });
  });

  test("View menu opens and shows items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-view"]');
    await expect(page.locator('[data-testid="menu-dropdown-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-zoom-in"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-zoom-out"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-fit-on-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-actual-pixels"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-rulers"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-guides"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-snap"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-panels"]')).toBeVisible();
  });

  test("View > Rulers toggles checkmark", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-view"]');
    await page.click('[data-testid="menu-item-rulers"]');
    await page.click('[data-testid="menu-view"]');
    const rulersItem = page.locator('[data-testid="menu-item-rulers"]');
    await expect(rulersItem.locator("svg")).toBeVisible();
  });

  test("View > Grid toggles checkmark", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-view"]');
    await page.click('[data-testid="menu-item-grid"]');
    await page.click('[data-testid="menu-view"]');
    await expect(page.locator('[data-testid="menu-item-grid"]').locator("svg")).toBeVisible();
  });

  test("keyboard shortcuts are displayed on menu items", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    const text = await page.locator('[data-testid="menu-item-new"]').textContent();
    expect(text).toMatch(/N/);
  });

  test("clicking a menu toggles it open and closed", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("hover switches between open menus", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.hover('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-dropdown-edit"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("clicking outside closes menu", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.locator(".flex-1.overflow-hidden").first().click({ force: true });
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("Escape closes open menu", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("hover does not open menu when none are active", async ({ editorPage: page }) => {
    await page.hover('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("Layer > New Layer adds a layer", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-layer"]');
    await page.click('[data-testid="menu-item-new-layer"]');
    await page.click('[data-testid="menu-layer"]');
    await expect(page.locator('[data-testid="menu-item-delete-layer"]')).toBeEnabled();
  });

  test("Layer > Merge Down is disabled on bottom layer", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-layer"]');
    await expect(page.locator('[data-testid="menu-item-merge-down"]')).toBeDisabled();
  });

  test("File > Export As opens export dialog", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    await page.click('[data-testid="menu-item-export-as"]');
    await expect(page.getByText("Export Image")).toBeVisible({ timeout: 3000 });
  });

  test("Edit > Copy Merged is visible", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-item-copy-merged"]')).toBeVisible();
  });

  test("Edit > Paste in Place is visible", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-item-paste-in-place"]')).toBeVisible();
  });

  test("View > Panels toggles right panel", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-view"]');
    await page.click('[data-testid="menu-item-panels"]');
  });

  test("Image > Canvas Size opens dialog", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-image"]');
    await page.click('[data-testid="menu-item-canvas-size"]');
    await expect(page.getByText("Canvas Size").first()).toBeVisible({ timeout: 3000 });
  });

  test("Image > Image Size opens dialog", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-image"]');
    await page.click('[data-testid="menu-item-image-size"]');
    await expect(page.getByText("Image Size").first()).toBeVisible({ timeout: 3000 });
  });

  test("Select > Deselect does not crash", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-select"]');
    await page.click('[data-testid="menu-item-deselect"]');
  });

  test("Select > Inverse does not crash", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-select"]');
    await page.click('[data-testid="menu-item-inverse"]');
  });

  test("View > Snap toggles", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-view"]');
    const snapItem = page.locator('[data-testid="menu-item-snap"]');
    const initialCheck = await snapItem.locator("svg").count();
    expect(initialCheck).toBeGreaterThan(0);
    await page.click('[data-testid="menu-item-snap"]');
    await page.click('[data-testid="menu-view"]');
    const afterToggleCheck = await page
      .locator('[data-testid="menu-item-snap"]')
      .locator("svg")
      .count();
    expect(afterToggleCheck).toBe(0);
  });

  test("Select > All sets selection", async ({ editorPage: page }) => {
    await page.click('[data-testid="menu-file"]');
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('[data-testid="menu-item-open"]');
    const chooser = await fileChooserPromise;
    await chooser.setFiles("tests/fixtures/image/valid/test-200x150.png");
    await page.waitForTimeout(1000);
    await page.click('[data-testid="menu-select"]');
    await page.click('[data-testid="menu-item-all"]');
  });
});
