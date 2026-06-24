import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.join(process.cwd(), ".playwright", ".auth", "user.json");

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

  // Fail fast on a misconfigured/stale e2e server. A correctly-configured e2e
  // API (SKIP_MUST_CHANGE_PASSWORD=true, fresh per-run DB) lands the admin on
  // "/". If we end up on /change-password or /login instead, the server on
  // :13490 is almost certainly a stale reused process (e.g. a leftover
  // `pnpm dev` without the e2e env, or a server bound to a mutated DB) that
  // playwright's `reuseExistingServer` picked up. Without this guard that state
  // silently poisons every loggedInPage test with cascading change-password
  // redirects, so surface it loudly with the fix.
  const landedPath = new URL(page.url()).pathname;
  if (landedPath !== "/") {
    throw new Error(
      `Auth setup landed on "${landedPath}" instead of "/". The e2e API on :13490 is likely a ` +
        `stale/misconfigured server reused by playwright. Kill any process on the e2e ports and re-run:\n` +
        `  lsof -ti :13490 :2349 | xargs kill -9`,
    );
  }

  // Save storage state (includes localStorage with the token)
  await page.context().storageState({ path: authFile });
});
