import { test as base, expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "admin", password = "admin") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
}

export async function getSessionViaApi(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
  const res = await page.request.get("/api/auth/session", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function setConsentViaApi(
  page: Page,
  data: { enabled?: boolean; remindLater?: boolean },
) {
  const token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
  const apiBase = process.env.API_URL || "http://localhost:13491";
  await page.request.put(`${apiBase}/api/v1/user/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await page.goto("/");
    await use(page);
  },
});

export { expect };
