import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.join(process.cwd(), ".playwright", ".auth", "qa-user.json");

setup("authenticate for QA", async ({ page }) => {
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();

  // Wait for login to complete (the token lands in localStorage)
  await page.waitForFunction(() => localStorage.getItem("snapotter-token"), null, {
    timeout: 15_000,
  });

  // After login the app redirects to "/" on its own. Wait for that redirect to
  // settle before forcing navigation, otherwise page.goto races the in-flight
  // client-side redirect and aborts ("interrupted by another navigation").
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 }).catch(() => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  await page.context().storageState({ path: authFile });
});
