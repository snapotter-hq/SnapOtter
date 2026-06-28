import path from "node:path";
import { expect, test } from "./helpers";

// A small, real image fixture. The email-friendly template (resize -> compress)
// runs synchronously on it with no AI model bundle.
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "image", "valid", "test-100x100.jpg");

/** Navigate to /automate and wait for the builder, retrying blank-page flakes. */
async function gotoAutomate(page: import("@playwright/test").Page) {
  const heading = page.getByRole("heading", {
    name: /pipeline builder|automate/i,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/automate", { waitUntil: "load" });
    try {
      await expect(heading).toBeVisible({ timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }

  await page.goto("/automate", { waitUntil: "load" });
  await expect(heading).toBeVisible({ timeout: 10_000 });
}

/** Wait for pipeline steps to render by counting Remove buttons. */
async function waitForSteps(page: import("@playwright/test").Page, count: number) {
  await expect(page.getByTitle("Remove")).toHaveCount(count, { timeout: 5_000 });
}

/** Upload a fixture via the Dropzone file chooser in the preview panel. */
async function uploadFixture(page: import("@playwright/test").Page, fixture: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /upload from computer/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixture);
  await page.waitForTimeout(500);
}

test.describe("Automate templates", () => {
  // Retry blank-page / dev-server timing flakes, mirroring sibling automate specs.
  test.describe.configure({ retries: 3 });

  test("templates render and load into the builder", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    // The Templates section renders in the left pane (desktop layout).
    const section = page.getByTestId("templates-section");
    await expect(section).toBeVisible();

    // Use an out-of-the-box (no-bundle) template: resize -> compress.
    await page.getByTestId("template-use-email-friendly").click();

    // The builder now holds the template's two steps.
    await waitForSteps(page, 2);
    await expect(page.getByText("2 steps configured")).toBeVisible();
  });

  test("preloaded remove-background settings persist after loading cut-out-subject", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    // cut-out-subject = remove-background -> compress, with non-default
    // remove-background settings (transparent / WebP / edgeRefine 1 / decontaminate).
    await page.getByTestId("template-use-cut-out-subject").click();

    await waitForSteps(page, 2);
    await expect(page.getByText("2 steps configured")).toBeVisible();

    // Expand the remove-background step to reveal its settings panel.
    const stepRow = page
      .locator("[role='button']")
      .filter({ hasText: "Remove Background" })
      .first();
    await stepRow.click();

    // Output format reflects the preset (WebP), not the PNG default.
    await expect(page.getByTestId("remove-background-format-webp")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("remove-background-format-png")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // The effects section auto-opens because edgeRefine/decontaminate are active.
    await expect(page.getByTestId("remove-background-edge-refine")).toHaveValue("1");
    await expect(page.getByTestId("remove-background-decontaminate")).toBeChecked();
  });

  test("an out-of-the-box template runs to completion", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await page.getByTestId("template-use-email-friendly").click();
    await waitForSteps(page, 2);

    await uploadFixture(page, FIXTURE);

    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeEnabled();
    await processBtn.click();

    // Completion: the before/after slider appears for an image pipeline result.
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // A download control for the processed result should be available.
    const downloadBtn = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download$/i }));
    await expect(downloadBtn.first()).toBeVisible({ timeout: 10_000 });
  });
});
