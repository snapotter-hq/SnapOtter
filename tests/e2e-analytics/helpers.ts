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

export { expect };
