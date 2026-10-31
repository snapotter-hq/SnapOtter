import { createNewDocument, drawOnCanvas, expect, selectTool, test } from "./helpers";

test.describe("Editor Autosave", () => {
  test("editor saves state periodically (check localStorage has autosave data)", async ({
    editorPage: page,
  }) => {
    test.slow();

    await createNewDocument(page);

    // Draw something to mark the canvas dirty
    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 300);
    await page.waitForTimeout(300);

    // Trigger the editor's save path so saveEditorState() serializes the live store.
    await page.getByTestId("menu-file").click();
    await page.getByTestId("menu-item-save").click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => localStorage.getItem("snapotter-editor-autosave"));
      })
      .not.toBeNull();

    // Verify localStorage contains the autosave key
    const autosaveData = await page.evaluate(() => {
      return localStorage.getItem("snapotter-editor-autosave");
    });

    expect(autosaveData).not.toBeNull();

    // Parse and verify the structure
    const parsed = JSON.parse(autosaveData!);
    expect(parsed.version).toBe(1);
    expect(parsed.timestamp).toBeGreaterThan(0);
    expect(parsed.state).toBeDefined();
    expect(parsed.state.canvasSize).toBeDefined();
    expect(parsed.state.canvasSize.width).toBeGreaterThan(0);
    expect(parsed.state.canvasSize.height).toBeGreaterThan(0);
    expect(parsed.state.layers).toBeDefined();
    expect(Array.isArray(parsed.state.layers)).toBe(true);
    expect(Array.isArray(parsed.state.objects)).toBe(true);
    expect(parsed.state.objects.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.state.filters)).toBe(true);
    expect(parsed.state.sourceImageUrl).toBe("idb://snapotter-editor-autosave/source");
  });

  test("modified content persists across page reload", async ({ editorPage: page }) => {
    test.slow();

    await createNewDocument(page);

    // Draw something to create content
    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 300);
    await page.waitForTimeout(300);

    // Trigger the editor's save path so saveEditorState() writes to localStorage and IndexedDB.
    await page.getByTestId("menu-file").click();
    await page.getByTestId("menu-item-save").click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => localStorage.getItem("snapotter-editor-autosave"));
      })
      .not.toBeNull();

    // Verify autosave data exists before reload
    const dataBefore = await page.evaluate(() => {
      return localStorage.getItem("snapotter-editor-autosave");
    });
    expect(dataBefore).not.toBeNull();

    // Reload the page
    await page.reload();
    const restoreBtn = page.getByRole("button", { name: "Restore", exact: true });
    await expect(restoreBtn).toBeVisible({
      timeout: 10000,
    });

    // After reload, localStorage should still have the autosave data
    const dataAfter = await page.evaluate(() => {
      return localStorage.getItem("snapotter-editor-autosave");
    });
    expect(dataAfter).not.toBeNull();

    // The data should contain the same canvas dimensions and drawn objects
    const parsedBefore = JSON.parse(dataBefore!);
    const parsedAfter = JSON.parse(dataAfter!);
    expect(parsedAfter.state.canvasSize.width).toBe(parsedBefore.state.canvasSize.width);
    expect(parsedAfter.state.canvasSize.height).toBe(parsedBefore.state.canvasSize.height);
    expect(parsedAfter.state.objects.length).toBeGreaterThan(0);
    expect(parsedAfter.state.objects.length).toBe(parsedBefore.state.objects.length);

    // Click Restore to verify restoreAutosave() rehydrates the canvas and clears autosave storage
    await restoreBtn.click();
    await expect(restoreBtn).toBeHidden();
    await expect(page.getByTestId("status-dimensions")).toContainText("1920 x 1080 px");
    const afterRestoreMeta = await page.evaluate(() =>
      localStorage.getItem("snapotter-editor-autosave"),
    );
    expect(afterRestoreMeta).toBeNull();
  });

  test("File > Save stores rotated source image in IndexedDB and restores across page reload (#2173)", async ({
    editorPage: page,
  }) => {
    test.slow();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("menu-file").click();
    await page.getByTestId("menu-item-open").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles("tests/fixtures/image/valid/test-200x150.png");

    await expect(page.getByTestId("status-dimensions")).toContainText("200 x 150 px");

    // Rotate 90 degrees CW so sourceImageUrl is rebaked into a PNG data URL (150 x 200 px)
    await page.getByTestId("menu-image").click();
    await page.getByTestId("menu-item-image-rotation").hover();
    await page.getByTestId("menu-item-90-cw").click();
    await expect(page.getByTestId("status-dimensions")).toContainText("150 x 200 px");

    await page.getByTestId("menu-file").click();
    await page.getByTestId("menu-item-save").click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => localStorage.getItem("snapotter-editor-autosave"));
      })
      .not.toBeNull();

    const savedMeta = await page.evaluate(() => {
      const raw = localStorage.getItem("snapotter-editor-autosave");
      return raw ? JSON.parse(raw) : null;
    });
    expect(savedMeta?.state?.sourceImageUrl).toBe("idb://snapotter-editor-autosave/source");
    expect(savedMeta?.state?.canvasSize).toEqual({ width: 150, height: 200 });

    await page.reload();

    const restoreBtn = page.getByRole("button", { name: "Restore", exact: true });
    await expect(restoreBtn).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("status-dimensions")).toHaveText("");
    await restoreBtn.click();

    await expect(restoreBtn).toBeHidden();
    await expect(page.getByTestId("status-dimensions")).toContainText("150 x 200 px");
    const afterRestoreMeta = await page.evaluate(() =>
      localStorage.getItem("snapotter-editor-autosave"),
    );
    expect(afterRestoreMeta).toBeNull();
  });
});
