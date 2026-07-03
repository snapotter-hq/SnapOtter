// Drives the REAL in-app AI bundle install flow (Settings > AI Features > Install
// All) against a running Docker container, exactly as a user would click through
// it. This is the primary AI-install path per docs/prompts/engineering/QA_PROMPT.md
// Phase 2 -- the curl-based /api/v1/admin/features/<bundle>/install route is a
// verification/fallback path only, never the primary install.
//
// This script only KICKS OFF the install and captures pre/mid-install evidence; the
// installs continue server-side once triggered. Poll status separately with:
//   curl -s $QA_BASE_URL/api/v1/features -H "Authorization: Bearer $TOKEN" | jq
// then run verify-ai-install-complete.mts once every bundle reports installed.
//
// Usage:
//   QA_BASE_URL=http://localhost:13599 QA_USERNAME=admin QA_PASSWORD=admin \
//     apps/api/node_modules/.bin/tsx tests/qa/install-ai-bundles-ui.mts
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "http://localhost:13499";
const USERNAME = process.env.QA_USERNAME || "admin";
const PASSWORD = process.env.QA_PASSWORD || "admin";
const SHOT_DIR = path.join("tests", "e2e", "screenshots", "qa", "ai-install");
fs.mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: import("@playwright/test").Page, name: string) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  screenshot: ${file}`);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Don't interpolate the env-derived base URL / username into the log
  // (clear-text logging of environment values is flagged by static analysis).
  console.log("Logging in...");
  await page.goto(BASE);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (page.url().includes("/login")) {
    await page.locator("#username").waitFor({ timeout: 10_000 });
    await page.locator("#username").fill(USERNAME);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /^log ?in$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  } else {
    console.log("  already authenticated (no login form shown)");
  }

  // Bail loudly if we land on the forced password-change screen -- the caller
  // should set SKIP_MUST_CHANGE_PASSWORD=true for automated runs.
  if (page.url().includes("/change-password")) {
    throw new Error(
      "Landed on /change-password -- set SKIP_MUST_CHANGE_PASSWORD=true on the container for automated QA runs",
    );
  }

  console.log("Opening Settings > AI Features...");
  await page.getByRole("button", { name: USERNAME, exact: true }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByText("AI Features", { exact: true }).click();
  await page.waitForTimeout(1000);

  await shot(page, "01-pre-install");

  // Record pre-install state from the DOM text (cheap sanity check the download
  // is provably on-demand, not pre-baked).
  const preText = await page.locator("body").innerText();
  const notInstalledCount = (preText.match(/Not installed/g) || []).length;
  console.log(`  bundles showing "Not installed" before click: ${notInstalledCount}`);

  console.log("Clicking Install All...");
  const installAllBtn = page.getByRole("button", { name: /install all/i });
  await installAllBtn.click();
  await page.waitForTimeout(3000);
  await shot(page, "02-mid-install-immediate");

  // Give the queue a bit longer to actually start downloading before the second
  // "mid-download" screenshot the prompt asks for.
  await page.waitForTimeout(30_000);
  await shot(page, "03-mid-install-30s");

  const midText = await page.locator("body").innerText();
  const installingCount = (midText.match(/\d+%/g) || []).length;
  const queuedCount = (midText.match(/Queued/g) || []).length;
  console.log(`  bundles showing a % progress at +33s: ${installingCount}`);
  console.log(`  bundles showing "Queued" at +33s: ${queuedCount}`);

  console.log(
    "Install kicked off and left running server-side. Poll /api/v1/features until every bundle is installed, then run verify-ai-install-complete.mts.",
  );

  await browser.close();
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
