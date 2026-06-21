/**
 * Axe accessibility pass -- desktop (chromium project).
 *
 * Scoped set: home, one tool per modality, editor, settings, login.
 * Runs in the default locale (en) and one RTL locale (ar).
 *
 * Uses a baseline file (a11y-baseline.json) to avoid failing on known
 * violations while catching any NEW regressions. To update the baseline
 * after fixing violations, run with A11Y_UPDATE_BASELINE=1.
 */
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./helpers";

// ---- Baseline machinery ----

interface BaselineFile {
  _comment: string;
  violations: Record<string, { impact: string; description: string; count: number }>;
}

const BASELINE_PATH = path.join(__dirname, "a11y-baseline.json");

function loadBaseline(): BaselineFile {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
  } catch {
    return { _comment: "", violations: {} };
  }
}

function saveBaseline(baseline: BaselineFile): void {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

interface ViolationEntry {
  id: string;
  impact: string | undefined;
  description: string;
  nodes: { length: number }[];
}

function buildKey(pageKey: string, ruleId: string): string {
  return `${pageKey}:${ruleId}`;
}

/**
 * Run axe on the current page and assert no NEW critical/serious violations
 * beyond the committed baseline.
 */
async function auditPage(
  page: import("@playwright/test").Page,
  pageKey: string,
  baseline: BaselineFile,
  newViolations: { key: string; impact: string; description: string; count: number }[],
  allViolations: { key: string; impact: string; description: string; count: number }[],
) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "best-practice"])
    .analyze();

  for (const v of results.violations as ViolationEntry[]) {
    const key = buildKey(pageKey, v.id);
    const entry = {
      key,
      impact: v.impact ?? "unknown",
      description: v.description,
      count: v.nodes.length,
    };
    allViolations.push(entry);

    // If this violation is NOT in the baseline, it is new
    if (!baseline.violations[key]) {
      newViolations.push(entry);
    }
  }
}

// ---- Scoped page set ----

const PAGES_EN = [
  { key: "home-en", path: "/", needsAuth: true },
  { key: "image-resize-en", path: "/image/resize", needsAuth: true },
  { key: "video-convert-en", path: "/video/convert-video", needsAuth: true },
  { key: "audio-convert-en", path: "/audio/convert-audio", needsAuth: true },
  { key: "document-pdf-to-image-en", path: "/document/pdf-to-image", needsAuth: true },
  { key: "data-csv-excel-en", path: "/data/csv-excel", needsAuth: true },
  { key: "editor-en", path: "/editor", needsAuth: true },
  { key: "login-en", path: "/login", needsAuth: false },
];

const PAGES_AR = [
  { key: "home-ar", path: "/", needsAuth: true, locale: "ar" },
  { key: "image-resize-ar", path: "/image/resize", needsAuth: true, locale: "ar" },
  { key: "editor-ar", path: "/editor", needsAuth: true, locale: "ar" },
  { key: "login-ar", path: "/login", needsAuth: false, locale: "ar" },
];

// ---- Tests ----

// Each test scans 9+ pages with axe; the default 30s timeout is tight.
test.describe("Axe a11y audit -- desktop EN", () => {
  test.setTimeout(90_000);
  test("no new critical/serious violations on scoped pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const baseline = loadBaseline();
    const newViolations: { key: string; impact: string; description: string; count: number }[] = [];
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of PAGES_EN) {
      if (p.needsAuth) {
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await auditPage(page, p.key, baseline, newViolations, allViolations);
      } else {
        // Login page: use a fresh context without auth
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const anonPage = await ctx.newPage();
        await anonPage.goto(p.path);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.waitForTimeout(500);
        await auditPage(anonPage, p.key, baseline, newViolations, allViolations);
        await ctx.close();
      }
    }

    // Report all violations by severity
    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (desktop EN):", JSON.stringify(bySeverity));
    console.log(`total unique rules violated: ${allViolations.length}`);
    console.log(`baselined: ${allViolations.length - newViolations.length}`);
    console.log(`NEW (not in baseline): ${newViolations.length}`);

    if (newViolations.length > 0) {
      console.log("NEW violations:");
      for (const v of newViolations) {
        console.log(`  ${v.key} [${v.impact}] (${v.count} nodes): ${v.description}`);
      }
    }

    // Update baseline if requested (skip assertion when generating baseline)
    if (process.env.A11Y_UPDATE_BASELINE === "1") {
      for (const v of allViolations) {
        baseline.violations[v.key] = {
          impact: v.impact,
          description: v.description,
          count: v.count,
        };
      }
      saveBaseline(baseline);
      console.log("Baseline updated -- skipping assertion.");
      return;
    }

    // Gate: fail only on NEW critical or serious violations
    const newCriticalSerious = newViolations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      newCriticalSerious,
      `${newCriticalSerious.length} NEW critical/serious a11y violation(s) found. ` +
        `Run with A11Y_UPDATE_BASELINE=1 to baseline after review.\n` +
        newCriticalSerious.map((v) => `  ${v.key} [${v.impact}]: ${v.description}`).join("\n"),
    ).toHaveLength(0);
  });
});

test.describe("Axe a11y audit -- desktop AR (RTL)", () => {
  test.setTimeout(60_000);
  test("no new critical/serious violations on RTL pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const baseline = loadBaseline();
    const newViolations: { key: string; impact: string; description: string; count: number }[] = [];
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of PAGES_AR) {
      if (p.needsAuth) {
        // Switch to Arabic locale
        await page.evaluate(() => {
          localStorage.setItem("snapotter-locale", "ar");
        });
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await auditPage(page, p.key, baseline, newViolations, allViolations);
      } else {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const anonPage = await ctx.newPage();
        // Set Arabic locale before navigating
        await anonPage.goto("/");
        await anonPage.evaluate(() => {
          localStorage.setItem("snapotter-locale", "ar");
        });
        await anonPage.goto(p.path);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.waitForTimeout(500);
        await auditPage(anonPage, p.key, baseline, newViolations, allViolations);
        await ctx.close();
      }
    }

    // Reset locale
    await page.evaluate(() => {
      localStorage.setItem("snapotter-locale", "en");
    });

    // Report
    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (desktop AR):", JSON.stringify(bySeverity));
    console.log(`total unique rules violated: ${allViolations.length}`);
    console.log(`NEW (not in baseline): ${newViolations.length}`);

    if (newViolations.length > 0) {
      console.log("NEW violations:");
      for (const v of newViolations) {
        console.log(`  ${v.key} [${v.impact}] (${v.count} nodes): ${v.description}`);
      }
    }

    if (process.env.A11Y_UPDATE_BASELINE === "1") {
      for (const v of allViolations) {
        baseline.violations[v.key] = {
          impact: v.impact,
          description: v.description,
          count: v.count,
        };
      }
      saveBaseline(baseline);
      console.log("Baseline updated -- skipping assertion.");
      return;
    }

    const newCriticalSerious = newViolations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      newCriticalSerious,
      `${newCriticalSerious.length} NEW critical/serious a11y violation(s) in AR locale.\n` +
        newCriticalSerious.map((v) => `  ${v.key} [${v.impact}]: ${v.description}`).join("\n"),
    ).toHaveLength(0);
  });
});
