import { expect, test } from "./helpers";

test.describe("Editor Navigation", () => {
  test("sidebar shows Editor between Automate and Files", async ({ editorPage: page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    const sidebarLinks = page.locator("nav a, aside a, [class*='sidebar'] a");
    const labels = await sidebarLinks.allTextContents();
    const flat = labels.join("|");

    expect(flat).toContain("Automate");
    expect(flat).toContain("Editor");
    expect(flat).toContain("Files");

    const automateIdx = flat.indexOf("Automate");
    const editorIdx = flat.indexOf("Editor");
    const filesIdx = flat.indexOf("Files");
    expect(editorIdx).toBeGreaterThan(automateIdx);
    expect(filesIdx).toBeGreaterThan(editorIdx);
  });

  test("clicking Editor navigates to /editor", async ({ editorPage: page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    await page.locator('a[href="/editor"]').click();
    await page.waitForTimeout(1000);

    expect(page.url()).toContain("/editor");
  });

  test("editor page renders four-zone layout", async ({ editorPage: page }) => {
    // Options bar at the top (contains tool name)
    const optionsBar = page.locator("text=move").first();
    await expect(optionsBar).toBeVisible();

    // Toolbar on the left (contains tool buttons with data-tool)
    const toolbar = page.locator("[data-tool='move']");
    await expect(toolbar).toBeVisible();

    // Canvas area in the middle
    const canvasArea = page.locator(".bg-muted\\/30").first();
    await expect(canvasArea).toBeVisible();

    // Right panel with tabs
    const rightPanel = page.locator("[data-testid='tab-layers']");
    await expect(rightPanel).toBeVisible();
  });

  test("welcome screen shows when no image loaded", async ({ editorPage: page }) => {
    // The welcome heading is the visible <h2> (an sr-only <h1> shares the text).
    await expect(page.getByRole("heading", { level: 2, name: "Image Editor" })).toBeVisible();
    await expect(page.getByText("Drop an image here to get started")).toBeVisible();
    await expect(page.getByText("Open Image")).toBeVisible();
    await expect(page.getByText("New Document")).toBeVisible();
    await expect(page.getByText("paste from clipboard")).toBeVisible();
  });

  test("right panel has three tabs", async ({ editorPage: page }) => {
    const layersTab = page.locator("[data-testid='tab-layers']");
    const adjustmentsTab = page.locator("[data-testid='tab-adjustments']");
    const historyTab = page.locator("[data-testid='tab-history']");

    await expect(layersTab).toBeVisible();
    await expect(adjustmentsTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    await expect(layersTab).toHaveText("Layers");
    await expect(adjustmentsTab).toHaveText("Adjustments");
    await expect(historyTab).toHaveText("History");
  });

  test("right panel tabs use roving focus and standard navigation keys", async ({
    editorPage: page,
  }) => {
    const layersTab = page.getByTestId("tab-layers");
    const adjustmentsTab = page.getByTestId("tab-adjustments");
    const historyTab = page.getByTestId("tab-history");

    await expect(layersTab).toHaveAttribute("tabindex", "0");
    await expect(adjustmentsTab).toHaveAttribute("tabindex", "-1");
    await expect(historyTab).toHaveAttribute("tabindex", "-1");
    for (const tab of [layersTab, adjustmentsTab, historyTab]) {
      await expect(tab).toHaveAttribute("aria-controls", "editor-panel");
    }
    await expect(page.locator("#editor-panel")).toHaveCount(1);

    await layersTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(adjustmentsTab).toBeFocused();
    await expect(adjustmentsTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("End");
    await expect(historyTab).toBeFocused();
    await expect(historyTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Home");
    await expect(layersTab).toBeFocused();
    await expect(layersTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowLeft");
    await expect(historyTab).toBeFocused();
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
  });

  test("Tab leaves the tablist without collapsing the right panel", async ({
    editorPage: page,
  }) => {
    const layersTab = page.getByTestId("tab-layers");
    await layersTab.focus();

    await page.keyboard.press("Tab");

    await expect(layersTab).toBeVisible();
    await expect(page.locator('button[aria-label="Collapse panel"]')).toBeFocused();
  });

  test("editor skip link focuses the main landmark", async ({ editorPage: page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await skipLink.focus();

    await page.keyboard.press("Enter");

    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("right panel collapses and expands", async ({ editorPage: page }) => {
    // Panel starts visible with tabs
    await expect(page.locator("[data-testid='tab-layers']")).toBeVisible();

    // Click the collapse button (ChevronRight at end of tab row)
    await page.locator("button[aria-label='Collapse panel']").click();
    await page.waitForTimeout(300);

    // Tabs should no longer be visible
    await expect(page.locator("[data-testid='tab-layers']")).not.toBeVisible();

    // Expand button should appear
    const expandBtn = page.locator("button[aria-label='Expand panel']");
    await expect(expandBtn).toBeVisible();

    // Click expand
    await expandBtn.click();
    await page.waitForTimeout(300);

    // Tabs visible again
    await expect(page.locator("[data-testid='tab-layers']")).toBeVisible();
  });

  test("status bar shows zoom level", async ({ editorPage: page }) => {
    const statusZoom = page.locator("[data-testid='status-zoom']");
    await expect(statusZoom).toBeVisible();

    // Should contain a number input and % sign
    const zoomInput = statusZoom.locator("input[type='number']");
    await expect(zoomInput).toBeVisible();
    await expect(statusZoom.locator("text=%")).toBeVisible();
  });

  test("status bar shows cursor position after loading document", async ({ editorPage: page }) => {
    const { createNewDocument } = await import("./helpers");
    await createNewDocument(page);

    const statusCursor = page.locator("[data-testid='status-cursor']");
    await expect(statusCursor).toBeVisible();

    // Should show X and Y values
    await expect(page.locator("[data-testid='status-cursor-x']")).toBeVisible();
    await expect(page.locator("[data-testid='status-cursor-y']")).toBeVisible();
  });
});
