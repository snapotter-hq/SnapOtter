import path from "node:path";
import { expect, mockAiFeaturesInstalled, test } from "./helpers";

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

test.describe("Erase Object tool", () => {
  // The eraser is an AI tool: without its bundle it renders a FeatureInstallPrompt
  // instead of the tool, which made this whole suite silently skip in CI and on
  // any box without the bundle. Mock the feature as installed so the UI actually
  // renders and these tests run. The settings panel (brush size, mode toggle,
  // submit) only mounts once a file is loaded, so tests that touch it upload first.
  async function gotoEraser(page: import("@playwright/test").Page) {
    await mockAiFeaturesInstalled(page, [
      {
        id: "object-eraser-colorize",
        name: "Object Eraser",
        enablesTools: ["erase-object", "colorize"],
      },
    ]);
    await page.goto("/image/erase-object");
    // A wrong/404 route must fail loudly, not silently pass.
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
    // Installed => the tool renders its dropzone (not the install prompt). Failing
    // here means the feature gate wasn't bypassed, not that a bundle is missing.
    await page
      .getByRole("button", { name: /upload from computer/i })
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  test("shows the tool (not an install prompt) when the feature is available", async ({
    loggedInPage: page,
  }) => {
    await gotoEraser(page);
    // Dropzone is shown; the settings panel and submit only appear after a file.
    await expect(page.getByRole("button", { name: /upload from computer/i })).toBeVisible();
    await expect(page.getByTestId("erase-object-submit")).toHaveCount(0);
  });

  test("loads settings controls once a file is added", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    await expect(page.getByText("Brush Size")).toBeVisible();
    await expect(page.locator("#eraser-brush-size")).toBeVisible();
    await expect(page.locator("#eraser-format")).toBeVisible();
    // No strokes yet -> submit disabled.
    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
  });

  test("submit stays disabled with a file but no strokes", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
  });

  test("brush size slider is interactive", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    const slider = page.locator("#eraser-brush-size");
    await expect(slider).toBeVisible();
    await slider.fill("75");
    await expect(page.getByText("75px")).toBeVisible();
  });

  test("quality slider shows for lossy formats only", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    const qualitySlider = page.locator("#eraser-quality");
    const formatSelect = page.locator("#eraser-format");

    // Default is PNG — quality hidden
    await expect(qualitySlider).not.toBeVisible();

    // Select JPG — quality visible
    await formatSelect.selectOption("jpg");
    await expect(qualitySlider).toBeVisible();

    // Select WEBP — quality visible
    await formatSelect.selectOption("webp");
    await expect(qualitySlider).toBeVisible();

    // Back to PNG — quality hidden
    await formatSelect.selectOption("png");
    await expect(qualitySlider).not.toBeVisible();
  });

  test("strokes persist when switching between files", async ({ loggedInPage: page }) => {
    await gotoEraser(page);

    // Upload first file
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // Paint a stroke on the first file
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await page.mouse.up();

    // Undo/Clear buttons should appear
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

    // Add a DISTINCT second file so the file entries are unambiguous.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add more/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath("image/valid/test-100x100.jpg"));
    await page.waitForTimeout(500);

    // Switch to the second file, then back to the first (select by unique name).
    await page.locator("button").filter({ hasText: "test-100x100.jpg" }).first().click();
    await page.waitForTimeout(300);
    await page.locator("button").filter({ hasText: "test-200x150.png" }).first().click();
    await page.waitForTimeout(300);

    // The first file's stroke was preserved -> Undo is still available.
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("lasso mode toggle switches modes and hides the brush size", async ({
    loggedInPage: page,
  }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // Brush is the default mode: the brush-size slider is shown.
    await expect(page.locator("#eraser-brush-size")).toBeVisible();

    // Switch to lasso: the brush-size slider is hidden.
    await page.getByTestId("eraser-mode-lasso").click();
    await expect(page.locator("#eraser-brush-size")).not.toBeVisible();

    // Switch back to brush: the slider returns.
    await page.getByTestId("eraser-mode-brush").click();
    await expect(page.locator("#eraser-brush-size")).toBeVisible();
  });

  test("drawing a lasso loop enables submit", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    await page.getByTestId("eraser-mode-lasso").click();

    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Drag a closed quad around the middle of the canvas (>= 3 points, real area).
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.up();

    // A lasso region counts as a stroke: Undo appears and submit is enabled.
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();
  });

  test("shows Erase All button when multiple files have masks", async ({ loggedInPage: page }) => {
    await gotoEraser(page);

    // Upload first file
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // Paint on first file
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    let box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3 + 20, box.y + box.height / 3);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Button should say "Erase Object" (only one file has mask)
    await expect(page.getByTestId("erase-object-submit")).toHaveText("Erase Object");

    // Add a DISTINCT second file and paint on it too.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add more/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath("image/valid/test-100x100.jpg"));
    await page.waitForTimeout(500);

    await page.locator("button").filter({ hasText: "test-100x100.jpg" }).first().click();
    await page.waitForTimeout(500);

    const canvas2 = page.locator("canvas");
    await canvas2.waitFor({ state: "visible", timeout: 5_000 });
    box = await canvas2.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Both files now have masks -> batch submit button.
    await expect(page.getByTestId("erase-object-submit")).toHaveText("Erase All (2)");
  });

  async function paintStroke(page: import("@playwright/test").Page) {
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await page.mouse.up();
  }

  // The API answers a successful erase with 202 and lands it over SSE, so a
  // sync 2xx only comes from something in between. #1734: the body is the only
  // thing that may blame the server, and a body with nothing to download used
  // to land as a completed run with no result behind it (#1740).
  test("a 200 with no download URL fails the run as an invalid response", async ({
    loggedInPage: page,
  }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await paintStroke(page);
    await page.route("**/api/v1/tools/image/erase-object", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );

    await page.getByTestId("erase-object-submit").click();

    await expect(page.getByText("Invalid response", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();
    await expect(page.getByTestId("erase-object-download")).toHaveCount(0);
  });

  test("a 200 with a result lands it", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await paintStroke(page);
    await page.route("**/api/v1/tools/image/erase-object", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          downloadUrl: "/api/v1/download/job-1/test-200x150.png",
          originalSize: 1000,
          processedSize: 900,
        }),
      }),
    );

    await page.getByTestId("erase-object-submit").click();

    await expect(page.getByTestId("erase-object-download")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Invalid response", { exact: true })).toHaveCount(0);
  });

  /**
   * Answer the erase with the 202 the API really sends, then complete the run
   * on the progress stream with `result`. The frame waits for the POST, as
   * the worker's would.
   */
  async function completeOverStream(
    page: import("@playwright/test").Page,
    result: Record<string, unknown>,
  ) {
    let accepted: () => void = () => {};
    const postAnswered = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    await page.route("**/api/v1/jobs/*/progress", async (route) => {
      await postAnswered;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ type: "single", phase: "complete", percent: 100, result })}\n\n`,
      });
    });
    await page.route("**/api/v1/tools/image/erase-object", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ jobId: "e2e-1830", async: true }),
      });
      accepted();
    });
  }

  // #1830: the stream twin of the 200 above. A completed frame with nothing to
  // download used to land as a finished run with no result behind it.
  test("a completed stream with no download URL fails the run as an invalid response", async ({
    loggedInPage: page,
  }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await paintStroke(page);
    await completeOverStream(page, { jobId: "e2e-1830", originalSize: 1000, processedSize: 900 });

    await page.getByTestId("erase-object-submit").click();

    await expect(page.getByText("Invalid response", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();
    await expect(page.getByTestId("erase-object-download")).toHaveCount(0);
  });

  // #1810: the batch's teardown now runs after its loop whatever happened in
  // it. A failed file must not stop the next one, and the run must end.
  test("an Erase All batch moves past a failed file and ends", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await paintStroke(page);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add more/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath("image/valid/test-100x100.jpg"));
    await page.waitForTimeout(500);
    await page.locator("button").filter({ hasText: "test-100x100.jpg" }).first().click();
    await page.waitForTimeout(500);
    await paintStroke(page);
    await expect(page.getByTestId("erase-object-submit")).toHaveText("Erase All (2)");

    let requests = 0;
    await page.route("**/api/v1/tools/image/erase-object", (route) => {
      requests++;
      return requests === 1
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Object erasing failed" }),
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              downloadUrl: "/api/v1/download/job-2/test-100x100.png",
              originalSize: 1000,
              processedSize: 900,
            }),
          });
    });

    await page.getByTestId("erase-object-submit").click();

    await expect.poll(() => requests, { timeout: 15_000 }).toBe(2);
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled({ timeout: 15_000 });
  });

  test("a completed stream with a result lands it", async ({ loggedInPage: page }) => {
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));
    await paintStroke(page);
    await completeOverStream(page, {
      jobId: "e2e-1830",
      downloadUrl: "/api/v1/download/e2e-1830/test-200x150.png",
      originalSize: 1000,
      processedSize: 900,
    });

    await page.getByTestId("erase-object-submit").click();

    await expect(page.getByTestId("erase-object-download")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Invalid response", { exact: true })).toHaveCount(0);
  });

  test("High Quality mode is gated on the inpaint-hq pack and blocks submit until installed", async ({
    loggedInPage: page,
  }) => {
    // gotoEraser mocks only object-eraser-colorize as installed, so the optional
    // inpaint-hq (diffusion) pack reads as missing.
    await gotoEraser(page);
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // The Fast/High-Quality toggle is present; Fast is the default.
    await expect(page.getByTestId("eraser-quality-fast")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("eraser-quality-hq")).toBeVisible();

    // Paint a stroke so the ONLY thing gating submit is the quality mode.
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await page.mouse.up();

    // Fast mode with a stroke: submit is enabled.
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();

    // Switch to High Quality: the pack is missing, so submit is blocked (never a
    // silent downgrade to the fast path) and the install prompt appears.
    await page.getByTestId("eraser-quality-hq").click();
    await expect(page.getByTestId("eraser-quality-hq")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
    await expect(page.getByTestId("eraser-install-hq")).toBeVisible();

    // Back to Fast: submit re-enables and the prompt is gone.
    await page.getByTestId("eraser-quality-fast").click();
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();
    await expect(page.getByTestId("eraser-install-hq")).toHaveCount(0);
  });
});
