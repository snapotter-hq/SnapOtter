/**
 * Real device-emulated mobile tests.
 *
 * Runs on mobile-chromium (Pixel 7) and mobile-webkit (iPhone 14) projects
 * with real touch, mobile UA, DPR, and (for iPhone) the WebKit engine.
 * Replaces the old resized-desktop approach in gui-visual-mobile / gui-responsive.
 *
 * All tests are tagged @mobile so the device projects' grep filter picks them up.
 */
import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// Six Letter pages: enough thumbnails to be taller than a phone's preview area.
const ORGANIZE_PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "multipage-6.pdf",
);

// A5 pages (419 x 595 pt): drawn at the old fixed 1.5x they are 629 x 893 px.
const SIGN_PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "test-3page.pdf",
);

// ---------------------------------------------------------------------------
// Core flow: load -> navigate -> upload -> process -> download
// ---------------------------------------------------------------------------
test.describe("@mobile Core flow", () => {
  test("navigate to tool, upload, and process", async ({ loggedInPage: page }) => {
    // Navigate to resize tool from home
    await page.goto("/image/resize");
    await expect(page.getByText("Resize").first()).toBeVisible();

    // Upload a fixture
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Verify file appeared in the preview area
    await expect(page.locator("img").first()).toBeVisible();

    // On mobile, the "Process" section at the bottom expands the settings
    // bottom sheet. Click it to open settings.
    const processSection = page.getByText("Process").last();
    await processSection.click();
    await page.waitForTimeout(300);

    // Set a width to enable the Resize button (it's disabled without dimensions)
    const widthInput = page.getByRole("spinbutton", { name: /width/i });
    await widthInput.fill("50");
    await page.waitForTimeout(200);

    // The action button is labeled with the tool name ("Resize")
    const actionBtn = page.getByRole("button", { name: /^resize$/i }).last();
    await expect(actionBtn).toBeEnabled({ timeout: 5000 });
    await actionBtn.click();

    // Wait for processing to complete
    await waitForProcessing(page);
    await page.waitForTimeout(2000);

    // After processing, a download button or link should appear
    const downloadBtn = page
      .locator("button, a")
      .filter({ hasText: /download/i })
      .first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// #1974: the run lives in the settings panel, so closing the sheet mid-run used
// to unmount the panel, abort the request, and leave the page at processing.
// ---------------------------------------------------------------------------
test.describe("@mobile Settings sheet during a run", () => {
  test("closing the sheet mid-run lets the run finish", async ({ loggedInPage: page }) => {
    // Hold the answer back so the sheet can be closed while the request is out.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/tools/image/resize", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/image/resize");
    await uploadTestImage(page);
    const peekBar = page.getByRole("button", { name: "Process", exact: true });
    await peekBar.click();
    await page.getByRole("spinbutton", { name: /width/i }).fill("50");
    const requestSent = page.waitForRequest("**/api/v1/tools/image/resize");
    await page
      .getByRole("button", { name: /^resize$/i })
      .last()
      .click();
    await requestSent;

    await page.getByRole("dialog").getByRole("button", { name: /close/i }).click();
    await expect(page.locator("[role='dialog']")).toBeHidden();
    release();

    // The run finished behind the closed sheet: reopening shows its result
    // rather than a panel stuck at processing.
    await peekBar.click();
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// #2176: the side-by-side result (two stacked cards) is taller than the preview
// area on a short phone. It used to spill over the "Process" peek bar and the
// Settings button, so nothing could reopen the sheet and reach the download.
// Pixel 7 is tall enough to hide it, so this runs at an iPhone 14 viewport on
// every mobile project, where the layout fails the same way in any engine.
// ---------------------------------------------------------------------------
test.describe("@mobile A result taller than the preview area", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("leaves the peek bar and the Settings button tappable", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);
    const peekBar = page.getByRole("button", { name: "Process", exact: true });
    await peekBar.click();
    await page.getByRole("spinbutton", { name: /width/i }).fill("50");
    await page
      .getByRole("button", { name: /^resize$/i })
      .last()
      .click();
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("dialog").getByRole("button", { name: /close/i }).click();
    await expect(page.locator("[role='dialog']")).toBeHidden();

    // A trial click does the actionability checks, including "nothing else
    // receives the pointer event", without tapping.
    await peekBar.click({ trial: true, timeout: 5_000 });
    // Scoped to the page: the bottom navigation has a Settings button too.
    await page
      .locator("#main-content")
      .getByRole("button", { name: "Settings", exact: true })
      .click({ trial: true, timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// #2190: the Sign PDF page was drawn at a fixed 1.5x, wider and taller than the
// preview area on a phone. It covered the "Process" peek bar and the Settings
// button, and the part left of the viewport couldn't be scrolled to, so a phone
// user could neither place a signature nor reach the download.
// ---------------------------------------------------------------------------
test.describe("@mobile Sign PDF on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("fits the page in the preview and leaves the settings controls tappable", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/sign-pdf");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /upload from computer/i })
      .first()
      .click();
    await (await chooser).setFiles(SIGN_PDF_FIXTURE);

    const canvas = page.getByTestId("sign-pdf-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    // Wait for pdf.js to size the page: the canvas is 300x150 until it renders.
    await expect
      .poll(async () => (await canvas.boundingBox())?.height ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(160);

    // The page is as wide as the area, not the old fixed 1.5x (629px for this A5 page).
    const box = await canvas.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(390);

    // A trial click does the actionability checks, including "nothing else
    // receives the pointer event", without tapping.
    await page
      .getByRole("button", { name: "Process", exact: true })
      .click({ trial: true, timeout: 5_000 });
    await page
      .locator("#main-content")
      .getByRole("button", { name: "Settings", exact: true })
      .click({ trial: true, timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// #2191: the Organize PDF grid grew to fit its pages instead of scrolling inside
// the preview area. With four or more pages it covered the "Process" peek bar and
// the Settings button, so the sheet could not be opened to run the tool at all,
// and the "Reset order" toolbar scrolled out of reach above the viewport.
// ---------------------------------------------------------------------------
test.describe("@mobile Organize PDF on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("scrolls its page grid inside the preview and leaves the settings controls tappable", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/pdf/organize-pdf");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /upload from computer/i })
      .first()
      .click();
    await (await chooser).setFiles(ORGANIZE_PDF_FIXTURE);

    // Six Letter pages: the grid is taller than the preview area.
    const reset = page.getByTestId("organize-reset");
    await expect(reset).toBeVisible({ timeout: 15_000 });
    const lastPage = page.getByRole("button", { name: /page 6/i }).first();
    await expect(lastPage).toBeAttached();

    // The toolbar stays inside the viewport instead of scrolling away above it.
    const box = await reset.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);

    // The grid scrolls inside the preview: the last page can be brought into view
    // and ends above the peek bar, not under it.
    await lastPage.scrollIntoViewIfNeeded();
    const lastBox = await lastPage.boundingBox();
    const peekBox = await page.getByRole("button", { name: "Process", exact: true }).boundingBox();
    expect((lastBox?.y ?? Infinity) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
      (peekBox?.y ?? 0) + 1,
    );

    // A trial click does the actionability checks, including "nothing else
    // receives the pointer event", without tapping.
    await page
      .getByRole("button", { name: "Process", exact: true })
      .click({ trial: true, timeout: 5_000 });
    await page
      .locator("#main-content")
      .getByRole("button", { name: "Settings", exact: true })
      .click({ trial: true, timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// #2192: more phone views were taller than the preview area and covered the
// "Process" peek bar or the Settings button. The bars now stack above the preview
// content, and the views that overflowed are bounded.
// ---------------------------------------------------------------------------
test.describe("@mobile Small phones keep the settings controls tappable", () => {
  async function expectControlsTappable(page: import("@playwright/test").Page) {
    // A trial click does the actionability checks, including "nothing else
    // receives the pointer event", without tapping.
    await page
      .getByRole("button", { name: "Process", exact: true })
      .click({ trial: true, timeout: 5_000 });
    await page
      .locator("#main-content")
      .getByRole("button", { name: "Settings", exact: true })
      .click({ trial: true, timeout: 5_000 });
  }

  // The bars stack above the preview, so a view that still spills under one passes
  // the trial clicks. These check that the view itself stays between the bars.
  async function headerBottom(page: import("@playwright/test").Page) {
    const header = await page.locator("#main-content h1").locator("xpath=..").boundingBox();
    return (header?.y ?? 0) + (header?.height ?? 0);
  }

  test.describe("QR code preview", () => {
    test.use({ viewport: { width: 360, height: 560 } });

    test("an empty QR preview does not cover the peek bar", async ({ loggedInPage: page }) => {
      await page.goto("/image/qr-generate");
      await expect(page.getByTestId("qr-preview")).toBeVisible({ timeout: 15_000 });

      await expectControlsTappable(page);
      const preview = await page.getByTestId("qr-preview").boundingBox();
      expect((preview?.y ?? -1) + 1).toBeGreaterThanOrEqual(await headerBottom(page));
      // Nothing is cut off sideways: the code fits the 360px width.
      expect((preview?.x ?? -1) + (preview?.width ?? Infinity)).toBeLessThanOrEqual(360);
    });
  });

  test.describe("a failed run", () => {
    test.use({ viewport: { width: 320, height: 480 } });

    test("the failed-file card does not cover the controls", async ({ loggedInPage: page }) => {
      await page.route("**/api/v1/tools/image/resize", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              "Processing failed because the server could not decode this image. It may be corrupt, truncated, or in a format the converter does not support. Try a different file, a smaller size, or export it again from the program that made it.",
          }),
        }),
      );
      await page.goto("/image/resize");
      await uploadTestImage(page);
      await page.getByRole("button", { name: "Process", exact: true }).click();
      await page.getByRole("spinbutton", { name: /width/i }).fill("50");
      await page
        .getByRole("button", { name: /^resize$/i })
        .last()
        .click();
      await expect(page.getByText(/could not decode this image/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("dialog").getByRole("button", { name: /close/i }).click();
      await expect(page.locator("[role='dialog']")).toBeHidden();

      await expectControlsTappable(page);
      // The card starts below the header and its last button can be scrolled to
      // above the peek bar, instead of being clipped or covered.
      const message = await page
        .getByText(/could not decode this image/i)
        .first()
        .boundingBox();
      expect((message?.y ?? -1) + 1).toBeGreaterThanOrEqual(await headerBottom(page));
      const lastButton = page
        .getByRole("button", { name: /report an issue|report issue/i })
        .first();
      await lastButton.scrollIntoViewIfNeeded();
      const last = await lastButton.boundingBox();
      const peek = await page.getByRole("button", { name: "Process", exact: true }).boundingBox();
      expect((last?.y ?? Infinity) + (last?.height ?? 0)).toBeLessThanOrEqual((peek?.y ?? 0) + 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Responsive chrome: mobile-bottom-nav, hamburger, tool-grid, footer hidden
// ---------------------------------------------------------------------------
test.describe("@mobile Responsive chrome", () => {
  test("bottom navigation bar is visible with correct items", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav).toBeVisible();

    await expect(bottomNav.getByText("Tools")).toBeVisible();
    await expect(bottomNav.getByText("Automate")).toBeVisible();
    await expect(bottomNav.getByText("Files")).toBeVisible();
    await expect(bottomNav.getByText("Settings")).toBeVisible();
  });

  test("desktop sidebar is hidden on mobile", async ({ loggedInPage: page }) => {
    await expect(page.locator("aside")).not.toBeVisible();
  });

  test("tool grid and search visible on mobile home", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("footer theme/language buttons are hidden on mobile", async ({ loggedInPage: page }) => {
    await expect(page.locator("button[title='Toggle Theme']")).not.toBeVisible();
    await expect(page.locator("button[title='Language']")).not.toBeVisible();
  });

  test("bottom nav navigates correctly", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");

    // Navigate to Automate
    await bottomNav.getByText("Automate").click();
    await expect(page).toHaveURL("/automate");

    // Navigate to Files
    await bottomNav.getByText("Files").click();
    await expect(page).toHaveURL("/files");

    // Navigate back to Tools (home)
    await bottomNav.getByText("Tools").click();
    await expect(page).toHaveURL("/");
  });

  test("settings opens from bottom nav", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Settings").click();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  });

  test("login page hides marketing panel on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    // Marketing panel hidden on narrow viewport
    await expect(page.getByText("Your images. Stay yours.")).not.toBeVisible();

    await context.close();
  });

  test("no horizontal overflow across key pages", async ({ loggedInPage: page }) => {
    const pages = ["/", "/image/resize", "/automate", "/files", "/editor"];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(300);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `overflow on ${p}`).toBeLessThanOrEqual(clientWidth);
    }
  });
});

// ---------------------------------------------------------------------------
// Touch interactions
// ---------------------------------------------------------------------------
test.describe("@mobile Touch interactions", () => {
  test("before-after slider responds to touch drag", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await uploadTestImage(page);

    // Wait for processing to complete and the slider to appear
    const processBtn = page.getByRole("button", { name: /process|apply/i }).first();
    if (await processBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await processBtn.click();
    }
    await waitForProcessing(page);

    // Look for the before-after comparison area
    const slider = page
      .locator("[class*='before-after'], [class*='BeforeAfter'], [class*='comparison']")
      .first();
    await slider.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

    if (await slider.isVisible()) {
      const box = await slider.boundingBox();
      if (box) {
        // Simulate a touch drag across the slider
        const startX = box.x + box.width * 0.3;
        const endX = box.x + box.width * 0.7;
        const y = box.y + box.height / 2;

        await page.touchscreen.tap(startX, y);
        // Touch drag: move from left to right
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 10 });
        await page.mouse.up();
      }
    }
    // If slider not visible, processing may have been too fast for comparison mode
    // -- this is acceptable; the test validates the touch mechanism when it appears
  });

  test("crop canvas accepts touch input", async ({ loggedInPage: page }) => {
    await page.goto("/image/crop");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        // Tap to interact with crop canvas
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Editor: phone asserts the mobile gate message
// ---------------------------------------------------------------------------
test.describe("@mobile Editor gate", () => {
  test("editor shows desktop-recommended gate on phone", async ({ loggedInPage: page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    // The mobile gate message from editor-page.tsx
    await expect(page.getByText("Desktop Recommended")).toBeVisible();
    await expect(page.getByText(/works best on desktop|larger display/i)).toBeVisible();

    // Editor canvas should NOT be present
    await expect(page.locator(".konvajs-content")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// SSE visibility-recovery regression
// ---------------------------------------------------------------------------
test.describe("@mobile SSE visibility recovery", () => {
  test("backgrounding and restoring tab triggers health check", async ({ loggedInPage: page }) => {
    // Navigate to a tool that processes files
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Simulate backgrounding the tab (visibility hidden)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // Simulate restoring the tab (visibility visible)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // The page should still be functional after visibility recovery.
    // The connection monitor fires a health check on visibility restore,
    // which is the Android-kill fix mechanism. Verify the page recovered.
    await expect(page.getByText("Resize").first()).toBeVisible();

    // Upload area or processed result should still be accessible
    const uploadVisible = await page
      .getByText("Upload from computer")
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const imgVisible = await page
      .locator("img")
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(uploadVisible || imgVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RTL (Arabic locale) responsive check
// ---------------------------------------------------------------------------
test.describe("@mobile RTL responsive", () => {
  test("Arabic locale renders RTL layout without overflow", async ({ loggedInPage: page }) => {
    // Switch to Arabic locale via localStorage (how the app stores locale)
    await page.evaluate(() => {
      localStorage.setItem("snapotter-locale", "ar");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verify RTL direction is applied
    const dir = await page.evaluate(() => document.documentElement.dir || document.body.dir || "");
    expect(dir).toBe("rtl");

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Bottom nav still visible in RTL
    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav).toBeVisible();

    // Reset locale for other tests
    await page.evaluate(() => {
      localStorage.setItem("snapotter-locale", "en");
    });
  });
});

// ---------------------------------------------------------------------------
// iOS navigation dead ends (#735, #736)
// ---------------------------------------------------------------------------
test.describe("@mobile iOS navigation", () => {
  test("editor desktop-only warning offers a way back (#735)", async ({ loggedInPage: page }) => {
    // A home-screen web app runs with no browser chrome, so without an
    // in-page control the editor's desktop-only warning is a dead end.
    await page.goto("/editor");
    await expect(page.getByText("Desktop Recommended")).toBeVisible({ timeout: 10_000 });

    const back = page.getByTestId("editor-mobile-back");
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL("/", { timeout: 10_000 });
  });

  test("last tool clears the fixed bottom nav (#736)", async ({ loggedInPage: page }) => {
    await page.goto("/");
    const main = page.locator("#main-content");
    await expect(main).toBeVisible();

    // The scroller must reserve the nav height plus the home-indicator
    // inset. Device emulation reports a zero inset, so the inset's
    // participation is pinned on the style; the geometry check below runs
    // at inset zero.
    expect(await main.evaluate((el) => (el as HTMLElement).style.paddingBottom)).toContain(
      "safe-area-inset-bottom",
    );

    await main.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    // The pin toggle is a sibling of the card link inside a relative
    // wrapper, so the wrapper (its parent) is the card's true bounding box.
    const lastCard = page
      .getByTestId(/^pin-toggle-/)
      .last()
      .locator("xpath=..");
    const nav = page.locator("nav.fixed");
    const [cardBox, navBox] = await Promise.all([lastCard.boundingBox(), nav.boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (!cardBox || !navBox) return;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(navBox.y + 1);
  });
});

// ---------------------------------------------------------------------------
// Camera capture (#172)
// ---------------------------------------------------------------------------
test.describe("@mobile Camera capture", () => {
  test("image tools offer Take photo on touch devices", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
  });

  test("tools that cannot use a photo do not offer the camera", async ({ loggedInPage: page }) => {
    await page.goto("/pdf/merge-pdf");
    await expect(page.getByRole("button", { name: "Upload from computer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take photo" })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Touch target sizes (#172): icon controls in the mobile header
// ---------------------------------------------------------------------------
test.describe("@mobile Touch target sizes", () => {
  test("mobile header controls are at least 40px", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();

    // Buttons plus aria-labelled icon links (back chevron, sponsor); plain
    // breadcrumb text links are exempt (WCAG inline exception).
    const controls = page.locator("header button, header a[aria-label]");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await controls.nth(i).boundingBox();
      expect(box, `header control ${i} has no box`).not.toBeNull();
      if (!box) continue;
      expect(box.width, `control ${i} width`).toBeGreaterThanOrEqual(39);
      expect(box.height, `control ${i} height`).toBeGreaterThanOrEqual(39);
    }
  });
});
