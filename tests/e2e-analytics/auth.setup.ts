import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(process.cwd(), "test-results", ".auth", "analytics-local-user.json");

setup("authenticate and accept analytics consent", async ({ page }) => {
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();

  // With ANALYTICS_ENABLED=true, the AuthGuard will redirect to /analytics-consent
  // for a fresh user. Accept consent so authenticated tests can proceed.
  try {
    const acceptBtn = page.getByRole("button", { name: /sure, sounds good/i });
    await acceptBtn.waitFor({ state: "visible", timeout: 10_000 });
    await acceptBtn.click();
    await page.waitForURL("/", { timeout: 30_000 });
  } catch {
    // Already on home page (consent previously accepted)
    await page.waitForURL("/", { timeout: 15_000 });
  }

  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: authFile });
});
