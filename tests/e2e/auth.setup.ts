import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
if (!authFile) {
  throw new Error("PLAYWRIGHT_AUTH_FILE was not initialized by playwright.config.ts");
}

setup("authenticate", async ({ page }) => {
  // Ensure directory exists
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
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 }).catch(() => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  // Fail fast on a misconfigured e2e service. A correctly configured API
  // (SKIP_MUST_CHANGE_PASSWORD=true, fresh per-run DB) lands the admin on "/".
  const landedPath = new URL(page.url()).pathname;
  if (landedPath !== "/") {
    throw new Error(
      `Auth setup landed on "${landedPath}" instead of "/" using web endpoint ` +
        `${process.env.PLAYWRIGHT_WEB_URL ?? "<unknown>"} and API endpoint ` +
        `${process.env.API_URL ?? "<unknown>"}. The isolated service is misconfigured.`,
    );
  }

  // Save storage state (includes localStorage with the token)
  await page.context().storageState({ path: authFile });
});
