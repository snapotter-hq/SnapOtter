import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

// apps/web/src/lib/chunk-reload.ts: a lazy chunk that fails to load reloads
// the page only when the server now serves a different build. Firefox and
// WebKit also fail in-flight imports when a navigation leaves the page, and
// reloading then cancelled that navigation (#912): the navigation and
// home-page specs in these engines cover that half.

const AUTOMATE_CHUNK = /\/assets\/automate-page-[^/]+\.js(?:\?.*)?$/;

/** Fail the automate page's chunk, as after a deploy that removed it. */
async function removeAutomateChunk(page: Page): Promise<void> {
  await page.route(AUTOMATE_CHUNK, (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
  );
}

/** Answer the handler's shell check, optionally as a newer build would. */
async function serveShell(page: Page, { newBuild }: { newBuild: boolean }): Promise<void> {
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      if (route.request().resourceType() !== "fetch") return route.fallback();
      const response = await route.fetch();
      const html = await response.text();
      const body = newBuild
        ? html.replace(/(<script type="module"[^>]*\bsrc=")([^"]+)"/, '$1$2?next-build"')
        : html;
      await route.fulfill({ response, body });
    },
  );
}

test.describe("Chunk reload after a deploy", () => {
  test("reloads when the server serves a newer build", async ({ loggedInPage: page }) => {
    await removeAutomateChunk(page);
    await serveShell(page, { newBuild: true });

    const shellCheck = page.waitForRequest(
      (req) => new URL(req.url()).pathname === "/" && req.resourceType() === "fetch",
    );
    const reload = page.waitForEvent("load");
    await page.getByRole("link", { name: "Automate" }).click();

    await shellCheck;
    await reload;
    await expect(page).toHaveURL("/automate");
  });

  test("does not reload when the server still serves the same build", async ({
    loggedInPage: page,
  }) => {
    await removeAutomateChunk(page);
    await serveShell(page, { newBuild: false });

    let loads = 0;
    page.on("load", () => loads++);
    const shellCheck = page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/" && res.request().resourceType() === "fetch",
    );
    await page.getByRole("link", { name: "Automate" }).click();
    await shellCheck;

    // The handler decides as soon as the check answers; give a reload it
    // might schedule time to start before asserting that none did.
    await page.waitForTimeout(1500);
    expect(loads).toBe(0);
    await expect(page).toHaveURL("/automate");
  });
});
