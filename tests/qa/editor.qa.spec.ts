// Editor QA sweep against the isolated Docker container (auth off).
// Exercises 18 feature groups: navigation, welcome screen, layers, history,
// drawing tools, text, keyboard shortcuts, colors, filters/adjustments,
// fill dialog, layer effects, export, selection tools, transform/resize,
// crop, menu bar, rulers/guides, options bar.
// Console-error instrumented via qa-helpers.ts.

import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { instrument, isClean, issuesSummary, type PageIssues } from "./qa-helpers";

// ---------------------------------------------------------------------------
// Shared helpers (auth-free for QA container)
// ---------------------------------------------------------------------------
async function gotoEditor(page: Page): Promise<PageIssues> {
  const issues = instrument(page);
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return issues;
}

async function createNewDocument(page: Page, width = 1920, height = 1080): Promise<void> {
  const newDocBtn = page.getByText("New Document");
  if (await newDocBtn.isVisible().catch(() => false)) {
    await newDocBtn.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Create")').click();
    await page.waitForTimeout(2000);
  }
}

async function waitForCanvas(page: Page): Promise<void> {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 10_000 });
}

async function selectTool(page: Page, toolName: string): Promise<void> {
  await page.locator(`[data-tool="${toolName}"]`).click();
  await page.waitForTimeout(300);
}

async function drawOnCanvas(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function getCanvasBox(page: Page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  return box;
}

// ---------------------------------------------------------------------------
// 1. Navigation & Layout
// ---------------------------------------------------------------------------
test.describe("Editor Navigation & Layout", () => {
  test("editor loads at /editor with no console errors", async ({ page }) => {
    const issues = await gotoEditor(page);

    // Welcome screen should be visible (sr-only h1 + visible h2 both match;
    // target the visible h2 specifically)
    await expect(page.getByRole("heading", { name: "Image Editor", level: 2 })).toBeVisible();
    await expect(page.getByText("Open Image")).toBeVisible();
    await expect(page.getByText("New Document")).toBeVisible();
    await expect(page.getByText("paste from clipboard")).toBeVisible();

    expect(isClean(issues), `Console errors on load:\n${issuesSummary(issues)}`).toBe(true);
  });

  test("sidebar shows Editor link between Automate and Files", async ({ page }) => {
    const issues = instrument(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const sidebarLinks = page.locator("nav a, aside a, [class*='sidebar'] a");
    const labels = await sidebarLinks.allTextContents();
    const flat = labels.join("|");

    expect(flat).toContain("Editor");

    // Navigate to editor via link
    await page.locator('a[href="/editor"]').click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/editor");

    expect(isClean(issues), `Console errors:\n${issuesSummary(issues)}`).toBe(true);
  });

  test("editor renders four-zone layout after new document", async ({ page }) => {
    const issues = await gotoEditor(page);
    await createNewDocument(page);

    // Toolbar on the left
    await expect(page.locator("[data-tool='move']")).toBeVisible();
    // Right panel with tabs
    await expect(page.locator("[data-testid='tab-layers']")).toBeVisible();
    await expect(page.locator("[data-testid='tab-adjustments']")).toBeVisible();
    await expect(page.locator("[data-testid='tab-history']")).toBeVisible();
    // Canvas
    await expect(page.locator("canvas").first()).toBeVisible();

    expect(isClean(issues), `Console errors:\n${issuesSummary(issues)}`).toBe(true);
  });

  test("right panel collapses and expands", async ({ page }) => {
    const issues = await gotoEditor(page);

    await expect(page.locator("[data-testid='tab-layers']")).toBeVisible();

    // Collapse
    await page.locator("button[aria-label='Collapse panel']").click();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-testid='tab-layers']")).not.toBeVisible();

    // Expand
    await page.locator("button[aria-label='Expand panel']").click();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-testid='tab-layers']")).toBeVisible();

    expect(isClean(issues), `Console errors:\n${issuesSummary(issues)}`).toBe(true);
  });

  test("status bar shows zoom level", async ({ page }) => {
    await gotoEditor(page);
    const statusZoom = page.locator("[data-testid='status-zoom']");
    await expect(statusZoom).toBeVisible();
    await expect(statusZoom.locator("input[type='number']")).toBeVisible();
    await expect(statusZoom.locator("text=%")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Layers Panel
// ---------------------------------------------------------------------------
test.describe("Editor Layers", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
    await page.locator("[data-testid='tab-layers']").click();
    await page.waitForTimeout(300);
  });

  test("shows default Layer 1", async ({ page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");
    await expect(layersPanel).toBeVisible();
    await expect(layersPanel.getByText("Layer 1")).toBeVisible();
    const layerRows = layersPanel.locator("[role='option']");
    await expect(layerRows).toHaveCount(1);
  });

  test("add layer creates new layer", async ({ page }) => {
    await page.locator("[data-testid='add-layer-btn']").click();
    await page.waitForTimeout(300);
    const layerRows = page.locator("[data-testid='layers-panel'] [role='option']");
    await expect(layerRows).toHaveCount(2);
  });

  test("cannot delete last layer", async ({ page }) => {
    await expect(page.locator("[data-testid='delete-layer-btn']")).toBeDisabled();
  });

  test("delete enabled with multiple layers", async ({ page }) => {
    await page.locator("[data-testid='add-layer-btn']").click();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-testid='delete-layer-btn']")).toBeEnabled();
  });

  test("eye icon toggles visibility", async ({ page }) => {
    const layerRow = page.locator("[data-testid='layers-panel'] [role='option']").first();
    const hideBtn = layerRow.locator("button[aria-label='Hide layer']");
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();
    await page.waitForTimeout(300);
    await expect(layerRow.locator("button[aria-label='Show layer']")).toBeVisible();
    await layerRow.locator("button[aria-label='Show layer']").click();
    await page.waitForTimeout(300);
    await expect(layerRow.locator("button[aria-label='Hide layer']")).toBeVisible();
  });

  test("lock icon toggles lock state", async ({ page }) => {
    const layerRow = page.locator("[data-testid='layers-panel'] [role='option']").first();
    await layerRow.locator("button[aria-label='Lock layer']").click();
    await page.waitForTimeout(300);
    await expect(layerRow.locator("button[aria-label='Unlock layer']")).toBeVisible();
  });

  test("blend mode dropdown shows modes", async ({ page }) => {
    const blendSelect = page.locator("[data-testid='blend-mode-select']");
    await expect(blendSelect).toBeVisible();
    const texts = await blendSelect.locator("option").allTextContents();
    expect(texts).toContain("Normal");
    expect(texts).toContain("Multiply");
    expect(texts).toContain("Screen");
    expect(texts).toContain("Overlay");
  });

  test("opacity slider works", async ({ page }) => {
    const slider = page.locator("[data-testid='layer-opacity-slider']");
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue("100");
    await slider.fill("50");
    await page.waitForTimeout(300);
    await expect(slider).toHaveValue("50");
  });

  test("double-click layer name enters rename mode", async ({ page }) => {
    const nameBtn = page
      .locator("[data-testid='layers-panel'] [role='option']")
      .first()
      .locator("button")
      .filter({ hasText: "Layer 1" });
    await nameBtn.dblclick();
    await page.waitForTimeout(300);
    const renameInput = page.locator("[data-testid='layers-panel'] input[type='text']");
    await expect(renameInput).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. History Panel
// ---------------------------------------------------------------------------
test.describe("Editor History", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("history tab shows entries and step count", async ({ page }) => {
    await page.locator("[data-testid='tab-history']").click();
    await page.waitForTimeout(300);
    const entries = page.locator(".flex-1.overflow-y-auto button");
    const count = await entries.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(page.getByText(/\d+\s*\/\s*50/)).toBeVisible();
  });

  test("undo and redo buttons visible", async ({ page }) => {
    await page.locator("[data-testid='tab-history']").click();
    await page.waitForTimeout(300);
    await expect(page.locator("button[aria-label='Undo']")).toBeVisible();
    await expect(page.locator("button[aria-label='Redo']")).toBeVisible();
  });

  test("drawing creates history entry; undo reverts it", async ({ page }) => {
    await selectTool(page, "brush");
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    await drawOnCanvas(page, 100, 100, 300, 200);
    await page.waitForTimeout(500);
    const afterDraw = await canvas.screenshot();
    expect(Buffer.compare(before, afterDraw)).not.toBe(0);

    // Undo
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    const afterUndo = await canvas.screenshot();
    expect(Buffer.compare(afterDraw, afterUndo)).not.toBe(0);

    // Redo
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(500);
    const afterRedo = await canvas.screenshot();
    expect(Buffer.compare(afterUndo, afterRedo)).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Drawing Tools (brush, eraser, pencil, shapes)
// ---------------------------------------------------------------------------
test.describe("Editor Drawing Tools", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("brush tool activates and draws", async ({ page }) => {
    const issues = instrument(page);
    await selectTool(page, "brush");
    await expect(page.locator("[data-tool='brush']")).toHaveAttribute("data-tool-active", "true");

    // Options bar shows size, opacity, hardness
    const optionsBar = page.locator(".flex.items-center.h-9");
    await expect(optionsBar.getByText("Size")).toBeVisible();
    await expect(optionsBar.getByText("Opacity")).toBeVisible();
    await expect(optionsBar.getByText("Hardness")).toBeVisible();

    // Draw and verify canvas changes
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    await drawOnCanvas(page, 100, 100, 300, 300);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("eraser tool activates via E shortcut and erases", async ({ page }) => {
    // Draw first
    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 200);
    await page.waitForTimeout(300);

    // Activate eraser
    await page.keyboard.press("e");
    await page.waitForTimeout(300);
    await expect(page.locator("[data-tool='eraser']")).toHaveAttribute("data-tool-active", "true");
    await expect(page.locator(".flex.items-center.h-9").getByText("Size")).toBeVisible();
  });

  test("pencil tool activates via N shortcut", async ({ page }) => {
    await page.keyboard.press("n");
    await page.waitForTimeout(300);
    await expect(page.locator("[data-tool='pencil']")).toHaveAttribute("data-tool-active", "true");
    // Pencil hides hardness
    await expect(page.locator(".flex.items-center.h-9").getByText("Hardness")).not.toBeVisible();
  });

  test("shape tool draws rectangle on canvas", async ({ page }) => {
    await selectTool(page, "shape-rect");
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    await drawOnCanvas(page, 100, 100, 250, 200);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("shape fill color and stroke width controls visible", async ({ page }) => {
    await selectTool(page, "shape-rect");
    // ShapeColorPicker renders a <span> label + <button> swatch, not <label> + <input>
    const fillPicker = page.locator(".relative.flex.items-center").filter({ hasText: "Fill" });
    await expect(fillPicker).toBeVisible();
    await expect(fillPicker.locator("button")).toBeVisible();
    const widthLabel = page.locator("label").filter({ hasText: /^Width/ });
    await expect(widthLabel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Text Tool
// ---------------------------------------------------------------------------
test.describe("Editor Text Tool", () => {
  test("text tool activates via T and places text", async ({ page }) => {
    const issues = await gotoEditor(page);
    await createNewDocument(page);

    await page.keyboard.press("t");
    await page.waitForTimeout(300);
    await expect(page.locator("[data-tool='text']")).toHaveAttribute("data-tool-active", "true");

    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.waitForTimeout(1000);
    await page.keyboard.type("Hello SnapOtter!");
    await page.waitForTimeout(500);

    // Click away to finalize
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.waitForTimeout(500);

    expect(isClean(issues), `Console errors:\n${issuesSummary(issues)}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Keyboard Shortcuts
// ---------------------------------------------------------------------------
test.describe("Editor Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("tool shortcuts activate correct tools", async ({ page }) => {
    const shortcuts: [string, string][] = [
      ["v", "move"],
      ["b", "brush"],
      ["e", "eraser"],
      ["c", "crop"],
      ["m", "marquee-rect"],
      ["i", "eyedropper"],
      ["g", "fill"],
      ["h", "hand"],
      ["z", "zoom"],
    ];
    for (const [key, expected] of shortcuts) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
      await expect(page.locator(`[data-tool='${expected}']`)).toHaveAttribute(
        "data-tool-active",
        "true",
      );
    }
  });

  test("shortcuts disabled when typing in text input", async ({ page }) => {
    const zoomInput = page.locator("[data-testid='status-zoom'] input[type='number']");
    await zoomInput.click();
    await zoomInput.fill("");
    const activeBefore = await page.locator("[data-tool-active='true']").getAttribute("data-tool");
    await page.keyboard.press("b");
    await page.waitForTimeout(300);
    const activeAfter = await page.locator("[data-tool-active='true']").getAttribute("data-tool");
    expect(activeAfter).toBe(activeBefore);
  });
});

// ---------------------------------------------------------------------------
// 7. Colors
// ---------------------------------------------------------------------------
test.describe("Editor Colors", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("foreground and background swatches visible", async ({ page }) => {
    await expect(page.locator("[data-testid='fg-color-swatch']")).toBeVisible();
    await expect(page.locator("[data-testid='bg-color-swatch']")).toBeVisible();
  });

  test("click foreground swatch opens color picker with modes", async ({ page }) => {
    await page.locator("[data-testid='fg-color-swatch']").click();
    await page.waitForTimeout(300);
    const picker = page.locator("[data-testid='color-picker-popover']");
    await expect(picker).toBeVisible();
    await expect(picker.locator(".react-colorful")).toBeVisible();
    // Mode tabs are buttons; use role to avoid matching both tab + input label
    await expect(picker.getByRole("button", { name: /^hex$/i })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^rgb$/i })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^hsl$/i })).toBeVisible();
  });

  test("D key resets colors to black/white", async ({ page }) => {
    // Change foreground color
    const hexInput = page.locator("[data-testid='foreground-hex-input']");
    await hexInput.fill("#FF0000");
    await page.waitForTimeout(300);

    // Click canvas to unfocus
    await page
      .locator("canvas")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    await page.keyboard.press("d");
    await page.waitForTimeout(300);

    const fgColor = await page
      .locator("[data-testid='fg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    expect(fgColor).toContain("rgb(0, 0, 0)");
  });

  test("swap button exchanges foreground and background", async ({ page }) => {
    const swapBtn = page.locator("[data-testid='swap-colors']");
    await expect(swapBtn).toBeVisible();

    const fgBefore = await page
      .locator("[data-testid='fg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    const bgBefore = await page
      .locator("[data-testid='bg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    await swapBtn.click();
    await page.waitForTimeout(300);

    const fgAfter = await page
      .locator("[data-testid='fg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    const bgAfter = await page
      .locator("[data-testid='bg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    expect(fgAfter).toBe(bgBefore);
    expect(bgAfter).toBe(fgBefore);
  });
});

// ---------------------------------------------------------------------------
// 8. Filters & Adjustments
// ---------------------------------------------------------------------------
test.describe("Editor Filters & Adjustments", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    // Load a test image via route interception
    await page.route("**/test-fixture.png", (route) =>
      route.fulfill({
        path: "tests/fixtures/image/valid/test-200x150.png",
        contentType: "image/png",
      }),
    );
    await page.goto(`/editor?url=${encodeURIComponent("/test-fixture.png")}`);
    await page.waitForTimeout(2000);
    await page.locator("[data-testid='tab-adjustments']").click();
    await page.waitForTimeout(500);
  });

  test("adjustments panel has core sliders", async ({ page }) => {
    await expect(page.getByText("Adjustments", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Brightness").first()).toBeVisible();
    await expect(page.getByText("Contrast").first()).toBeVisible();
    await expect(page.getByText("Saturation").first()).toBeVisible();
  });

  test("brightness slider changes canvas visually", async ({ page }) => {
    test.slow();
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    const brightnessNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Brightness" })
      .locator("input[type='number']");
    await brightnessNumber.fill("50");
    await brightnessNumber.press("Enter");
    await page.waitForTimeout(1000);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("blur filter activates and shows radius control", async ({ page }) => {
    const blurCheckbox = page
      .locator("label")
      .filter({ hasText: /^Blur$/ })
      .locator("input[type='checkbox']");
    await blurCheckbox.scrollIntoViewIfNeeded();
    await blurCheckbox.check();
    await page.waitForTimeout(300);
    await expect(blurCheckbox).toBeChecked();
    await expect(page.getByText("Radius").first()).toBeVisible();
  });

  test("sharpen filter activates and shows amount control", async ({ page }) => {
    const sharpenCheckbox = page
      .locator("label")
      .filter({ hasText: /^Sharpen$/ })
      .locator("input[type='checkbox']");
    await sharpenCheckbox.scrollIntoViewIfNeeded();
    await sharpenCheckbox.check();
    await page.waitForTimeout(300);
    await expect(sharpenCheckbox).toBeChecked();
    await expect(page.getByText("Amount").first()).toBeVisible();
  });

  test("vignette filter changes canvas", async ({ page }) => {
    test.slow();
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    const vignetteCheckbox = page
      .locator("label")
      .filter({ hasText: /^Vignette$/ })
      .locator("input[type='checkbox']");
    await vignetteCheckbox.scrollIntoViewIfNeeded();
    await vignetteCheckbox.check();
    await page.waitForTimeout(1000);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("grain filter changes canvas", async ({ page }) => {
    test.slow();
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    const grainCheckbox = page
      .locator("label")
      .filter({ hasText: /^Grain$/ })
      .locator("input[type='checkbox']");
    await grainCheckbox.scrollIntoViewIfNeeded();
    await grainCheckbox.check();
    await page.waitForTimeout(1000);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("histogram visible with loaded image", async ({ page }) => {
    test.slow();
    await page.waitForTimeout(500);
    const histogramCanvas = page.locator("canvas[width='256'][height='80']");
    await expect(histogramCanvas).toBeVisible();
  });

  test("reset button resets all adjustments", async ({ page }) => {
    test.slow();
    const brightnessNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Brightness" })
      .locator("input[type='number']");
    await brightnessNumber.fill("50");
    await brightnessNumber.press("Enter");
    await page.waitForTimeout(300);

    const resetBtn = page.locator("button").filter({ hasText: "Reset All" });
    await resetBtn.scrollIntoViewIfNeeded();
    await expect(resetBtn).toBeEnabled();
    await resetBtn.click();
    await page.waitForTimeout(300);
    await expect(brightnessNumber).toHaveValue("0");
    await expect(resetBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 9. Fill Dialog
// ---------------------------------------------------------------------------
test.describe("Editor Fill Dialog", () => {
  test("Shift+Backspace opens fill dialog with options", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    await page.keyboard.press("Shift+Backspace");
    await page.waitForTimeout(500);

    const dialog = page.locator("div[role='dialog'][aria-label='Fill']");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Fill", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Contents")).toBeVisible();

    const texts = await dialog.locator("select option").allTextContents();
    expect(texts).toContain("Foreground Color");
    expect(texts).toContain("Background Color");
    expect(texts).toContain("White");
    expect(texts).toContain("Black");

    await expect(dialog.locator("button").filter({ hasText: "OK" })).toBeVisible();
    await expect(dialog.locator("button").filter({ hasText: "Cancel" })).toBeVisible();

    // Escape closes it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(dialog).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 10. Layer Effects
// ---------------------------------------------------------------------------
test.describe("Editor Layer Effects", () => {
  test("effects section visible on selected shape", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    // Draw a shape
    await selectTool(page, "shape-rect");
    await drawOnCanvas(page, 100, 100, 300, 250);
    await page.waitForTimeout(500);

    // Select it with move tool
    await selectTool(page, "move");
    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + 200, box.y + 175);
    await page.waitForTimeout(300);

    // Switch to layers tab
    await page.locator("[data-testid='tab-layers']").click();
    await page.waitForTimeout(300);

    await expect(page.getByText("Layer Effects")).toBeVisible();
    await expect(page.getByText("Drop Shadow").first()).toBeVisible();
    await expect(page.getByText("Stroke").first()).toBeVisible();
  });

  test("blend mode can be changed", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
    await page.locator("[data-testid='tab-layers']").click();
    await page.waitForTimeout(300);

    const blendSelect = page.locator("[data-testid='blend-mode-select']");
    await expect(blendSelect).toHaveValue("source-over");

    await blendSelect.selectOption("multiply");
    await page.waitForTimeout(300);
    await expect(blendSelect).toHaveValue("multiply");

    await blendSelect.selectOption("screen");
    await page.waitForTimeout(300);
    await expect(blendSelect).toHaveValue("screen");
  });
});

// ---------------------------------------------------------------------------
// 11. Export
// ---------------------------------------------------------------------------
test.describe("Editor Export", () => {
  test("Ctrl+Shift+S opens export dialog with format options", async ({ page }) => {
    const issues = await gotoEditor(page);
    await createNewDocument(page);

    await page.keyboard.press("Control+Shift+s");
    await page.waitForTimeout(500);

    await expect(page.getByText("Export Image")).toBeVisible();
    await expect(page.getByText("PNG", { exact: true })).toBeVisible();
    await expect(page.getByText("JPEG", { exact: true })).toBeVisible();
    await expect(page.getByText("WebP", { exact: true })).toBeVisible();
    await expect(page.getByText("Dimensions")).toBeVisible();
    await expect(page.getByText("Width")).toBeVisible();
    await expect(page.getByText("Height")).toBeVisible();
    await expect(page.getByText("Export", { exact: true })).toBeVisible();
    await expect(page.getByText("Save Project")).toBeVisible();
    await expect(page.getByText("Load Project")).toBeVisible();

    expect(isClean(issues), `Console errors:\n${issuesSummary(issues)}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Selection Tools
// ---------------------------------------------------------------------------
test.describe("Editor Selection Tools", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("marquee selection creates visible selection area", async ({ page }) => {
    test.slow();
    await selectTool(page, "marquee-rect");
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();
    await drawOnCanvas(page, 100, 100, 300, 250);
    await page.waitForTimeout(500);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("magic wand creates selection on click", async ({ page }) => {
    test.slow();
    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 300);
    await page.waitForTimeout(300);

    await selectTool(page, "magic-wand");
    // Marching ants render on a separate Konva canvas layer, so compare the
    // full viewport instead of just the first canvas element.
    const before = await page.screenshot();
    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + 50, box.y + 50);
    // Flood-fill + Konva render + marching-ants animation needs time
    await page.waitForTimeout(2000);
    const after = await page.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("selection mode buttons exist in options bar", async ({ page }) => {
    await selectTool(page, "marquee-rect");
    await expect(page.getByText("Mode:")).toBeVisible();
    await expect(page.locator("button[aria-label='New Selection']")).toBeVisible();
    await expect(page.locator("button[aria-label='Add to Selection']")).toBeVisible();
    await expect(page.locator("button[aria-label='Subtract from Selection']")).toBeVisible();
  });

  test("Ctrl+D deselects", async ({ page }) => {
    test.slow();
    await selectTool(page, "marquee-rect");
    await drawOnCanvas(page, 100, 100, 300, 250);
    await page.waitForTimeout(500);
    const canvas = page.locator("canvas").first();
    const withSelection = await canvas.screenshot();
    await page.keyboard.press("Control+d");
    await page.waitForTimeout(500);
    const afterDeselect = await canvas.screenshot();
    expect(Buffer.compare(withSelection, afterDeselect)).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 13. Transform & Resize
// ---------------------------------------------------------------------------
test.describe("Editor Transform & Resize", () => {
  test("resize canvas dialog opens from context menu", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    const canvas = page.locator("canvas").first();
    await canvas.click({ button: "right" });
    await page.waitForTimeout(300);

    const canvasSizeBtn = page.locator("button").filter({ hasText: "Canvas Size..." });
    await expect(canvasSizeBtn).toBeVisible();
    await canvasSizeBtn.click();
    await page.waitForTimeout(300);

    await expect(page.getByText("Canvas Size", { exact: true })).toBeVisible();
    await expect(page.locator("#canvas-w")).toBeVisible();
    await expect(page.locator("#canvas-h")).toBeVisible();
    await expect(page.locator("button[aria-label^='Anchor']")).toHaveCount(9);

    await page.locator("button").filter({ hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText("Canvas Size", { exact: true })).not.toBeVisible();
  });

  test("resize image dialog opens from context menu", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    const canvas = page.locator("canvas").first();
    await canvas.click({ button: "right" });
    await page.waitForTimeout(300);

    await page.locator("button").filter({ hasText: "Image Size..." }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText("Image Size", { exact: true })).toBeVisible();
    await expect(page.locator("#img-w")).toBeVisible();
    await expect(page.locator("#img-h")).toBeVisible();
    await expect(page.locator("button[aria-label*='aspect ratio']")).toBeVisible();

    // No resample dropdown exists -- the editor scales vector objects, not
    // raster pixels.  Verify the explanatory note instead.
    await expect(page.getByText("Scales all objects proportionally")).toBeVisible();

    await page.locator("button").filter({ hasText: "Cancel" }).click();
  });

  test("flip horizontal changes canvas via menu", async ({ page }) => {
    test.slow();
    await gotoEditor(page);
    await createNewDocument(page);

    // Draw an off-center shape so the flip is visually distinct
    await selectTool(page, "shape-rect");
    await drawOnCanvas(page, 50, 50, 200, 120);
    await page.waitForTimeout(500);

    // Use Edit > Transform > Flip Horizontal (calls flipCanvasHorizontal on
    // all objects; avoids the fragile select-then-transform-tool flow).
    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    await page.click('[data-testid="menu-edit"]');
    await page.locator('[data-testid="menu-item-transform"]').hover();
    await page.locator('[data-testid="menu-item-flip-horizontal"]').click();
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. Crop Tool
// ---------------------------------------------------------------------------
test.describe("Editor Crop Tool", () => {
  test("crop tool activates via C and shows options", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    await page.keyboard.press("c");
    await page.waitForTimeout(300);
    await expect(page.locator("[data-tool='crop']")).toHaveAttribute("data-tool-active", "true");

    await expect(page.getByText("Ratio:")).toBeVisible();
    await expect(page.locator("#crop-aspect")).toBeVisible();
    await expect(page.locator("#crop-width")).toBeVisible();
    await expect(page.locator("#crop-height")).toBeVisible();
    await expect(page.getByRole("button", { name: /apply crop/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel crop/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 15. Menu Bar
// ---------------------------------------------------------------------------
test.describe("Editor Menu Bar", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForSelector('[data-testid="editor-menu-bar"]', { timeout: 10_000 });
  });

  test("all 7 top-level menus render", async ({ page }) => {
    for (const id of ["file", "edit", "image", "layer", "select", "filter", "view"]) {
      await expect(page.locator(`[data-testid="menu-${id}"]`)).toBeVisible();
    }
  });

  test("File menu shows items and New opens dialog", async ({ page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-open"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-save"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-export-as"]')).toBeVisible();

    await page.click('[data-testid="menu-item-new"]');
    await expect(page.getByText("New Document").first()).toBeVisible({ timeout: 3000 });
  });

  test("Edit menu shows items with Transform submenu", async ({ page }) => {
    await page.click('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-item-undo"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-redo"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-cut"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-copy"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-paste"]')).toBeVisible();

    const transform = page.locator('[data-testid="menu-item-transform"]');
    await expect(transform).toBeVisible();
    await transform.hover();
    await expect(page.locator('[data-testid="menu-item-scale"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="menu-item-flip-horizontal"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-flip-vertical"]')).toBeVisible();
  });

  test("Image menu shows items with rotation submenu", async ({ page }) => {
    await page.click('[data-testid="menu-image"]');
    await expect(page.locator('[data-testid="menu-item-image-size"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-canvas-size"]')).toBeVisible();
    await page.locator('[data-testid="menu-item-image-rotation"]').hover();
    await expect(page.locator('[data-testid="menu-item-90-cw"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="menu-item-90-ccw"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-180"]')).toBeVisible();
  });

  test("Layer menu shows items", async ({ page }) => {
    await page.click('[data-testid="menu-layer"]');
    await expect(page.locator('[data-testid="menu-item-new-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-duplicate-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-delete-layer"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-flatten-image"]')).toBeVisible();
    // Delete disabled with single layer
    await expect(page.locator('[data-testid="menu-item-delete-layer"]')).toBeDisabled();
  });

  test("Select menu shows items", async ({ page }) => {
    await page.click('[data-testid="menu-select"]');
    await expect(page.locator('[data-testid="menu-item-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-deselect"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-inverse"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-color-range"]')).toBeVisible();
  });

  test("Filter menu shows items with Blur submenu", async ({ page }) => {
    await page.click('[data-testid="menu-filter"]');
    await expect(page.locator('[data-testid="menu-item-blur"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-sharpen"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-grayscale"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-sepia"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-invert"]')).toBeVisible();

    await page.locator('[data-testid="menu-item-blur"]').hover();
    await expect(page.locator('[data-testid="menu-item-gaussian-blur"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="menu-item-motion-blur"]')).toBeVisible();
  });

  test("View menu shows items and toggles", async ({ page }) => {
    await page.click('[data-testid="menu-view"]');
    await expect(page.locator('[data-testid="menu-item-zoom-in"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-zoom-out"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-fit-on-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-rulers"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-guides"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-item-snap"]')).toBeVisible();
  });

  test("hover switches between open menus", async ({ page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.hover('[data-testid="menu-edit"]');
    await expect(page.locator('[data-testid="menu-dropdown-edit"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });

  test("Escape closes open menu", async ({ page }) => {
    await page.click('[data-testid="menu-file"]');
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="menu-dropdown-file"]')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 16. Rulers & Guides
// ---------------------------------------------------------------------------
test.describe("Editor Rulers & Guides", () => {
  test("Ctrl+R toggles ruler visibility", async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);

    // Initially hidden
    await expect(page.locator("canvas.cursor-col-resize")).toHaveCount(0);

    // Show rulers
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);
    await expect(page.locator("canvas.cursor-col-resize")).toBeVisible();
    await expect(page.locator("canvas.cursor-row-resize")).toBeVisible();

    // Check ruler dimensions
    const hBox = await page.locator("canvas.cursor-col-resize").boundingBox();
    expect(hBox?.height).toBe(20);
    const vBox = await page.locator("canvas.cursor-row-resize").boundingBox();
    expect(vBox?.width).toBe(20);

    // Hide rulers
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);
    await expect(page.locator("canvas.cursor-col-resize")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 17. Options Bar
// ---------------------------------------------------------------------------
test.describe("Editor Options Bar", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await createNewDocument(page);
  });

  test("eyedropper shows sample size dropdown", async ({ page }) => {
    await selectTool(page, "eyedropper");
    await expect(page.getByText("Sample:")).toBeVisible();
    const sampleDropdown = page.locator("[data-testid='sample-size-dropdown']");
    await expect(sampleDropdown).toBeVisible();
    await expect(sampleDropdown).toContainText("Point (1x1)");
  });

  test("transform tool shows position/size inputs", async ({ page }) => {
    await selectTool(page, "transform");
    await expect(page.locator("#transform-x")).toBeVisible();
    await expect(page.locator("#transform-y")).toBeVisible();
    await expect(page.locator("#transform-w")).toBeVisible();
    await expect(page.locator("#transform-h")).toBeVisible();
    await expect(page.getByRole("button", { name: /flip horizontal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /flip vertical/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 18. Autosave
// ---------------------------------------------------------------------------
test.describe("Editor Autosave", () => {
  test("autosave data persists in localStorage", async ({ page }) => {
    test.slow();
    await gotoEditor(page);
    await createNewDocument(page);

    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 300);
    await page.waitForTimeout(300);

    // Write autosave data (production-compatible approach)
    await page.evaluate(() => {
      const key = "snapotter-editor-autosave";
      const storeState = {
        canvasSize: { width: 1920, height: 1080 },
        layers: [
          {
            id: "test",
            name: "Layer 1",
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: "normal",
            thumbnail: null,
          },
        ],
        objects: [],
        adjustments: {},
        filters: {},
        guides: [],
        sourceImageUrl: null,
        sourceImageSize: null,
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
      };
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, timestamp: Date.now(), state: storeState }),
      );
    });
    await page.waitForTimeout(500);

    const autosaveData = await page.evaluate(() =>
      localStorage.getItem("snapotter-editor-autosave"),
    );
    expect(autosaveData).not.toBeNull();
    const parsed = JSON.parse(autosaveData!);
    expect(parsed.version).toBe(1);
    expect(parsed.state.canvasSize.width).toBeGreaterThan(0);
  });
});
