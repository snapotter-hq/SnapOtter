import type { Page } from "@playwright/test";
import { expect, test, uploadTestImage } from "./helpers";

// The sync failure exits in a real browser: a failed run ends on the failure
// screen rather than an endless pulse (#799), and the tool takes the next run
// afterwards. Since #1791 every sync exit ends the run through one guarded
// teardown; the throwing-store-write case behind that issue can't be staged
// from here, so the unit tests in use-tool-processor-single-file-failure pin
// it. This spec guards the ordinary path through the same code.

const TOOL_ROUTE = "**/api/v1/tools/image/resize";

async function startResize(page: Page) {
  await page.goto("/image/resize");
  await uploadTestImage(page);
  await page.locator("input[placeholder='Auto']").first().fill("50");
  await page.getByRole("button", { name: "Resize" }).click();
}

async function expectFailureScreen(page: Page, message: string) {
  // The settings panel repeats the message, so read the preview's copy.
  const preview = page.getByLabel("Preview area");
  await expect(preview.getByText(message)).toBeVisible({ timeout: 15_000 });
  await expect(preview.getByText("Your settings are saved.")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Try again" })).toBeVisible();
}

test.describe("Tool sync failure exits", () => {
  test("an app error response lands on the failure screen", async ({ loggedInPage: page }) => {
    await page.route(TOOL_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Resize blew up on the server" }),
      }),
    );

    await startResize(page);

    await expectFailureScreen(page, "Resize blew up on the server");
  });

  test("a proxy 413 lands on the failure screen in the user's words", async ({
    loggedInPage: page,
  }) => {
    await page.route(TOOL_ROUTE, (route) =>
      route.fulfill({
        status: 413,
        contentType: "text/html",
        body: "<html>413 Request Entity Too Large</html>",
      }),
    );

    await startResize(page);

    await expectFailureScreen(page, "This file is over the server's upload size limit.");
  });

  test("a failed run leaves the tool ready for the next one", async ({ loggedInPage: page }) => {
    await page.route(TOOL_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Resize blew up on the server" }),
      }),
    );

    await startResize(page);
    await expectFailureScreen(page, "Resize blew up on the server");

    await page.unroute(TOOL_ROUTE);
    await page.getByLabel("Preview area").getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Resize" }).click();

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
