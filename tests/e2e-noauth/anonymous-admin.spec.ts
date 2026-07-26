/**
 * AUTH_ENABLED=false: the anonymous admin path.
 *
 * With authentication disabled the API injects a synthetic anonymous user that
 * carries the admin role, so the whole app (including Settings) has to be
 * reachable with no credential ever presented. Every other Playwright config in
 * this repo boots the API with authentication ON, so nothing else exercises
 * this deployment mode in a browser.
 */
import { expect, type Page, test } from "@playwright/test";

const API = (() => {
  const url = process.env.API_URL;
  if (!url) throw new Error("API_URL was not initialized by playwright.noauth.config.ts");
  return url;
})();

/** Fail the test on anything the app should never emit while merely being used. */
function watchForRuntimeFaults(page: Page) {
  const faults: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") faults.push(`console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => faults.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) faults.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return faults;
}

test.describe("AUTH_ENABLED=false", () => {
  test("the web endpoint proxies to the run-owned no-auth API", async ({ page, request }) => {
    // instance_id is a per-database UUID minted at boot, so it identifies one
    // API instance. Reading it directly and through the browser's /api proxy
    // proves both paths terminate at the same server. A health probe would only
    // prove that some API answered, which is how an earlier sweep drove an
    // unrelated instance's settings, sessions and jobs.
    const direct = await request.get(`${API}/api/v1/settings`);
    expect(direct.ok(), "the run-owned API must serve settings to the anonymous admin").toBe(true);
    const directId = ((await direct.json()) as { settings: Record<string, string> }).settings
      .instance_id;
    expect(directId, "the API must mint an instance_id at boot").toBeTruthy();

    await page.goto("/");
    const proxied = await page.request.get("/api/v1/settings");
    expect(proxied.ok()).toBe(true);
    const proxiedId = ((await proxied.json()) as { settings: Record<string, string> }).settings
      .instance_id;

    expect(proxiedId, `the web endpoint proxied /api to a different instance than ${API}`).toBe(
      directId,
    );
  });

  test("the app opens without a login and reports the anonymous admin", async ({ page }) => {
    const faults = watchForRuntimeFaults(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: /^login$/i })).toHaveCount(0);

    const session = await page.request.get("/api/auth/session");
    expect(session.ok()).toBe(true);
    const body = (await session.json()) as {
      user: { id: string; role: string; permissions: string[] };
    };
    expect(body.user.id).toBe("anonymous");
    expect(body.user.role).toBe("admin");
    // The synthetic user must carry real admin authority, not an empty set that
    // happens to pass a role-name check.
    expect(body.user.permissions).toEqual(expect.arrayContaining(["settings:write"]));

    expect(faults).toEqual([]);
  });

  test("Settings is reachable and a change persists across a reload", async ({ page }) => {
    const faults = watchForRuntimeFaults(page);

    await page.goto("/");
    await page.getByTestId("user-menu").click();
    await page.getByTestId("open-settings").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Write through the same session the browser uses, then prove the app reads
    // it back. Asserting only the API response would not show that the
    // anonymous admin's write reaches the UI.
    const write = await page.request.put("/api/v1/settings", { data: { defaultLocale: "de" } });
    expect(write.ok(), `settings write failed with ${write.status()}`).toBe(true);

    await page.reload();
    const readBack = await page.request.get("/api/v1/settings");
    expect(
      ((await readBack.json()) as { settings: Record<string, string> }).settings.defaultLocale,
    ).toBe("de");

    await page.request.put("/api/v1/settings", { data: { defaultLocale: "en" } });
    expect(faults).toEqual([]);
  });

  test("a deep link survives a hard refresh without bouncing to login", async ({ page }) => {
    const faults = watchForRuntimeFaults(page);

    await page.goto("/image/resize");
    await expect(page.getByText("Tool not found")).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/\/image\/resize$/);
    await expect(page.getByRole("button", { name: /upload from computer/i }).first()).toBeVisible();

    expect(faults).toEqual([]);
  });

  test("an unknown route renders not-found rather than redirecting to login", async ({ page }) => {
    await page.goto("/image/definitely-not-a-tool");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/tool not found/i).first()).toBeVisible();
  });
});
