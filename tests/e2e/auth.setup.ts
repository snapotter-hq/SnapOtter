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

  // Prove the browser's /api proxy reaches THIS run's API rather than some other
  // checkout's server that happens to answer on a shared port. A session token
  // exists only in the run-owned database, so replaying the token the browser
  // just obtained against the resolved API endpoint is an identity check: it
  // passes only when both paths terminate at the same instance. Reaching "an
  // API" would still satisfy a health probe, which is how an earlier sweep
  // silently mutated an unrelated instance's settings, sessions and jobs.
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error("API_URL was not initialized by playwright.config.ts");
  }
  const proxiedToken = await page.evaluate(() => localStorage.getItem("snapotter-token"));
  if (!proxiedToken) {
    throw new Error("Login through the web endpoint produced no session token");
  }

  const identity = await page.request.get(`${apiUrl}/api/auth/session`, {
    headers: { authorization: `Bearer ${proxiedToken}` },
  });
  if (!identity.ok()) {
    throw new Error(
      `The session minted through ${process.env.PLAYWRIGHT_WEB_URL ?? "<unknown>"} is unknown to ` +
        `the run-owned API at ${apiUrl} (status ${identity.status()}). That web endpoint is ` +
        "proxying /api to a different instance.",
    );
  }

  // Negative control: without it the check above would also pass against an API
  // running with authentication disabled, which accepts any bearer value.
  const forged = await page.request.get(`${apiUrl}/api/auth/session`, {
    headers: { authorization: "Bearer not-a-real-session-token" },
  });
  if (forged.status() !== 401) {
    throw new Error(
      `The run-owned API at ${apiUrl} accepted a forged session token (status ${forged.status()}), ` +
        "so the identity check above proves nothing. Expected 401.",
    );
  }

  // Save storage state (includes localStorage with the token)
  await page.context().storageState({ path: authFile });
});
