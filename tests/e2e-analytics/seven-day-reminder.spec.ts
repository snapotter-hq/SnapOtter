import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Tests the 7-day reminder lifecycle. Since we can't wait 7 real days,
// we verify the DB state transitions via the API and confirm the UI
// behavior is consistent with shouldShowConsent() logic.

test.describe("7-day Reminder Lifecycle", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  let token: string;

  test("login and obtain auth token", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    // Accept consent if shown so we can use the API
    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
    expect(token).toBeTruthy();
  });

  test("remindLater via API sets remindAt 7 days in the future", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });
    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");

    const before = Date.now();
    const apiBase = process.env.API_URL || "http://localhost:13491";
    await page.request.put(`${apiBase}/api/v1/user/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { remindLater: true },
    });

    const sessionRes = await page.request.get(`${apiBase}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();

    expect(session.user.analyticsEnabled).toBeNull();
    expect(session.user.analyticsConsentRemindAt).toBeGreaterThanOrEqual(before);

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(session.user.analyticsConsentRemindAt).toBeGreaterThanOrEqual(before + sevenDays - 2000);
    expect(session.user.analyticsConsentRemindAt).toBeLessThanOrEqual(
      Date.now() + sevenDays + 2000,
    );
  });

  test("after remindLater, user can still accept via API", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });
    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
    const apiBase = process.env.API_URL || "http://localhost:13491";

    // Set remind later
    await page.request.put(`${apiBase}/api/v1/user/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { remindLater: true },
    });

    // Now accept
    await page.request.put(`${apiBase}/api/v1/user/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true },
    });

    const sessionRes = await page.request.get(`${apiBase}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();

    expect(session.user.analyticsEnabled).toBe(true);
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  test("after remindLater, user can explicitly decline via API", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });
    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
    const apiBase = process.env.API_URL || "http://localhost:13491";

    await page.request.put(`${apiBase}/api/v1/user/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { remindLater: true },
    });

    await page.request.put(`${apiBase}/api/v1/user/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: false },
    });

    const sessionRes = await page.request.get(`${apiBase}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();

    expect(session.user.analyticsEnabled).toBe(false);
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });
});
