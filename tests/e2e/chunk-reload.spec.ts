import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

// apps/web/src/lib/chunk-reload.ts reloads once when a lazy chunk fails to
// load (a deploy removed it), except while the page is being left: Firefox
// and WebKit abort in-flight imports on navigation, and reloading then
// cancelled the navigation (#912). Runs in chromium, firefox and webkit.

const AUTOMATE_CHUNK = /\/assets\/automate-page-[^/]+\.js(?:\?.*)?$/;

/** Count main-frame document requests: a reload shows up the moment it starts. */
function countNavigations(page: Page): () => number {
  let count = 0;
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) count++;
  });
  return () => count;
}

test.describe("Chunk reload", () => {
  test("reloads once when a deploy removed the next page's chunk", async ({
    loggedInPage: page,
  }) => {
    await page.route(AUTOMATE_CHUNK, (route) =>
      route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
    );
    const navigations = countNavigations(page);

    await page.getByRole("link", { name: "Automate" }).click();

    // The chunk is still missing after the reload, so the loop guard hands
    // the second failure to the error boundary instead of reloading again.
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(navigations()).toBe(1);
    await expect(page).toHaveURL("/automate");
  });

  test("a navigation away is not cancelled by a chunk still loading (#912)", async ({
    loggedInPage: page,
  }) => {
    // Hold the chunk so its import is still in flight when the page is left.
    let chunkRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      chunkRequested = resolve;
    });
    await page.route(AUTOMATE_CHUNK, () => chunkRequested());

    await page.getByRole("link", { name: "Automate" }).click();
    await requested;

    await page.goto("/files");
    await expect(page).toHaveURL("/files");
  });
});
