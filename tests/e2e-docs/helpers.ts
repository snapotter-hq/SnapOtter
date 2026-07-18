import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wait for VitePress to finish the initial client hydration.
 *
 * The docs navbar (the Pagefind search box, the appearance toggle) is
 * server-rendered, so it's present in the DOM the instant the page loads, but
 * its Vue click handlers aren't wired until the app hydrates. A click that
 * lands before then is silently swallowed. That's the flaky "search won't
 * open" race behind issue #551: the bundle for 21 locales takes a few hundred
 * ms to hydrate, and a fast (or automated) click inside that window does
 * nothing. Playwright's actionability checks don't cover framework hydration,
 * so tests have to wait for it explicitly.
 *
 * Vue assigns `__vue_app__` to the mount container inside `app.mount()`, which
 * for SSR is the same call that hydrates the initial tree. Its presence on
 * `#app` is therefore a deterministic, side-effect-free signal that handlers
 * are attached.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = document.getElementById("app");
      return app !== null && "__vue_app__" in app;
    },
    null,
    { timeout: 15_000 },
  );
}

/**
 * Open the Pagefind search dialog and return its input locator.
 *
 * Waits for hydration first (so the click registers), then asserts the dialog
 * input is visible. The selector is placeholder-agnostic on purpose: the docs
 * config overrides the input placeholder, so keying off a hard-coded string
 * (as the old tests did) breaks whenever that copy changes.
 */
export async function openDocsSearch(page: Page): Promise<Locator> {
  await waitForHydration(page);
  await page.locator(".nav-search-btn-wait").first().click();
  const input = page.locator("[command-dialog-wrapper] input").first();
  await expect(input).toBeVisible({ timeout: 5_000 });
  return input;
}
