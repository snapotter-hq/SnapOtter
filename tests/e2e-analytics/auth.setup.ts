import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(process.cwd(), "test-results", ".auth", "analytics-local-user.json");

setup("authenticate for analytics tests", async ({ page }) => {
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();

  await page.waitForURL("/", { timeout: 30_000 });
  await expect(page).toHaveURL("/");

  // This suite runs with analytics baked on against a fresh DB, so the admin
  // usage-survey overlay would cover the UI and swallow every click. Mark it
  // dismissed the same way the overlay itself does before any spec runs.
  const res = await page.request.put("/api/v1/settings", {
    data: { "onboarding.usageSurvey.dismissedAt": new Date().toISOString() },
  });
  expect(res.ok()).toBe(true);

  await page.context().storageState({ path: authFile });
});
