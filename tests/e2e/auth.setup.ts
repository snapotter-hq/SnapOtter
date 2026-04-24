import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(process.cwd(), "test-results", ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  // Ensure directory exists
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();

  // Wait for login to complete and grab the token in one step
  const handle = await page.waitForFunction(() => localStorage.getItem("snapotter-token"), null, {
    timeout: 15_000,
  });
  const token = await handle.jsonValue();

  // Dismiss analytics consent via API so it won't block any test
  const apiBase = process.env.API_URL || "http://localhost:13490";
  await page.request.put(`${apiBase}/api/v1/user/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { enabled: false },
  });

  // Now navigate to "/" - consent guard is satisfied
  await page.goto("/");
  await expect(page).toHaveURL("/");

  // Save storage state (includes localStorage with the token)
  await page.context().storageState({ path: authFile });
});
