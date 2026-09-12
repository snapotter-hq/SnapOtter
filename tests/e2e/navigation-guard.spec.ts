import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, getE2eRunRoot, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Navigation guard: the dialog that stands between an in-app navigation and a
// result the user never took.
//
// Only in-app navigations reach react-router's blocker, so every test here
// leaves by clicking a router Link: the top-nav "Tools" link on a tool page, and
// the menu bar's back arrow in the editor, which renders no top nav. page.goto
// is a document navigation; the blocker never sees it and Playwright accepts the
// beforeunload prompt on its own, which is why the rest of the suite navigates
// that way without meeting this dialog.
//
// These specs assert outcomes, never ordering. "Download, then leave" defers
// its proceed by a setTimeout(0) that Playwright cannot observe, so the test
// asserts the file landed AND the navigation happened. Ordering is pinned at
// the unit level, where the clock is controllable.
// ---------------------------------------------------------------------------

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "image", "valid");

/**
 * react-router throws an invariant on a proceed that lands on a block already
 * answered, and a production build (what the e2e webServer serves) keeps that
 * throw. A double-proceed regression therefore surfaces as a page error rather
 * than as a failed assertion, so every test collects them and asserts none.
 */
function watchForPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The one in-app navigation present on every page. */
function toolsLink(page: Page) {
  return page.getByRole("banner").getByRole("link", { name: "Tools", exact: true });
}

/** Resize one image and stop on the result, unclaimed. */
async function resizeOneFile(page: Page) {
  await page.goto("/image/resize");
  await uploadTestImage(page);
  await page.locator("input[placeholder='Auto']").first().fill("50");
  await page.getByRole("button", { name: "Resize" }).click();
  await waitForProcessing(page);
  await expect(page.locator("[data-download-button]").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Resize two images and stop on the zip, unclaimed.
 *
 * Two files and not three on purpose: a batch settles into a single zip, which
 * is one download. Several unclaimed results with no zip would mean several
 * synchronous anchor clicks, and Chrome answers that with its "allow multiple
 * automatic downloads" prompt, which hangs the run.
 */
async function resizeTwoFiles(page: Page) {
  await page.goto("/image/resize");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("[class*='border-dashed']").first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    path.join(FIXTURES, "test-100x100.jpg"),
    path.join(FIXTURES, "test-200x150.png"),
  ]);
  await expect(page.getByText("Files (2)")).toBeVisible({ timeout: 10_000 });

  await page.locator("input[placeholder='Auto']").first().fill("50");
  await page.getByRole("button", { name: /resize.*2 files/i }).click();
  await waitForProcessing(page, 30_000);
  await expect(page.getByRole("button", { name: /download all/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Navigation guard", () => {
  test("an unsaved result blocks an in-app navigation, and Stay here keeps the page", async ({
    loggedInPage: page,
  }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeOneFile(page);

    await toolsLink(page).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /result isn.t saved/i })).toBeVisible();

    await dialog.getByRole("button", { name: /stay here/i }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL("/image/resize");
    // Staying means the result is still there to take.
    await expect(page.locator("[data-download-button]").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("Leave anyway abandons the result and navigates", async ({ loggedInPage: page }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeOneFile(page);

    await toolsLink(page).click();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /leave anyway/i })
      .click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("Download, then leave saves the result and navigates", async ({ loggedInPage: page }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeOneFile(page);

    await toolsLink(page).click();

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /download, then leave/i })
      .click();

    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(0);
    const savePath = path.join(getE2eRunRoot(), "navigation-guard-download-then-leave");
    await download.saveAs(savePath);
    expect(fs.statSync(savePath).size).toBeGreaterThan(0);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("taking the result first leaves the navigation unguarded", async ({
    loggedInPage: page,
  }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeOneFile(page);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-download-button]").first().click();
    await downloadPromise;

    await toolsLink(page).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("taking the batch zip leaves the navigation unguarded", async ({ loggedInPage: page }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeTwoFiles(page);

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: /download all/i })
      .first()
      .click();
    await downloadPromise;

    await toolsLink(page).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("unsaved editor edits block an in-app navigation", async ({ loggedInPage: page }) => {
    const pageErrors = watchForPageErrors(page);
    await page.goto("/editor");

    // The whole setup is one click. The layers panel is the default right-panel
    // tab and renders with no document loaded, and addLayer sets isDirty, which
    // is the reason the guard reports here.
    await page.getByTestId("add-layer-btn").click();

    // /editor renders no top nav, so the in-app way out is the menu bar's back
    // arrow, which calls navigate("/").
    await page.getByRole("button", { name: "Back to SnapOtter" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /unsaved edits/i })).toBeVisible();

    await dialog.getByRole("button", { name: /stay here/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL("/editor");

    await page.getByRole("button", { name: "Back to SnapOtter" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /leave anyway/i })
      .click();

    await expect(page).toHaveURL("/");
    expect(pageErrors).toEqual([]);
  });

  test("closing the tab with an unsaved result raises the native prompt", async ({
    loggedInPage: page,
  }) => {
    const pageErrors = watchForPageErrors(page);
    await resizeOneFile(page);

    // Registering a listener is what stops Playwright answering the prompt for
    // us: with none, a beforeunload dialog is accepted and never observed.
    const dialogPromise = page.waitForEvent("dialog");
    await page.close({ runBeforeUnload: true });

    const dialog = await dialogPromise;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
    expect(pageErrors).toEqual([]);
  });
});
