import { test as base, expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "admin", password = "admin") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await page.goto("/");
    await use(page);
  },
});

// openSettings() opens the Settings dialog via the top-nav avatar dropdown.
// The default layout has no left sidebar, so Settings is reached by opening the
// avatar menu (a button labelled with the username) and clicking Settings.
export async function openSettings(page: Page, username = "admin"): Promise<void> {
  await page.getByRole("button", { name: username, exact: true }).first().click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
}

export { expect };
