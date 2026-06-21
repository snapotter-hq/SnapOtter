/**
 * Axe accessibility pass -- mobile device (mobile-chromium project).
 *
 * Mirrors the desktop a11y spec's scoped set on a real device emulation
 * (Pixel 7 via mobile-chromium). All tests tagged @mobile for project routing.
 *
 * Shares the same a11y-baseline.json as the desktop spec, with mobile-prefixed
 * page keys so desktop and mobile violations are tracked independently.
 */
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./helpers";

// ---- Baseline machinery (shared with a11y.spec.ts) ----

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

    if (!baseline.violations[key]) {
      newViolations.push(entry);
    }
  }
}

// ---- Scoped page set (mobile, EN + AR) ----

const PAGES_MOBILE_EN = [
  { key: "mobile-home-en", path: "/", needsAuth: true },
  { key: "mobile-image-resize-en", path: "/image/resize", needsAuth: true },
  { key: "mobile-video-convert-en", path: "/video/convert-video", needsAuth: true },
  { key: "mobile-audio-convert-en", path: "/audio/convert-audio", needsAuth: true },
  { key: "mobile-document-pdf-to-image-en", path: "/document/pdf-to-image", needsAuth: true },
  { key: "mobile-data-csv-excel-en", path: "/data/csv-excel", needsAuth: true },
  { key: "mobile-editor-en", path: "/editor", needsAuth: true },
  { key: "mobile-login-en", path: "/login", needsAuth: false },
];

const PAGES_MOBILE_AR = [
  { key: "mobile-home-ar", path: "/", needsAuth: true, locale: "ar" },
  { key: "mobile-image-resize-ar", path: "/image/resize", needsAuth: true, locale: "ar" },
  { key: "mobile-login-ar", path: "/login", needsAuth: false, locale: "ar" },
];

// ---- Tests ----

test.describe("@mobile Axe a11y audit -- mobile EN", () => {
  test.setTimeout(90_000);
  test("no new critical/serious violations on scoped pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const baseline = loadBaseline();
    const newViolations: { key: string; impact: string; description: string; count: number }[] = [];
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of PAGES_MOBILE_EN) {
      if (p.needsAuth) {
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await auditPage(page, p.key, baseline, newViolations, allViolations);
      } else {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const anonPage = await ctx.newPage();
        await anonPage.goto(p.path);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.waitForTimeout(500);
        await auditPage(anonPage, p.key, baseline, newViolations, allViolations);
        await ctx.close();
      }
    }

    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (mobile EN):", JSON.stringify(bySeverity));
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
      `${newCriticalSerious.length} NEW critical/serious a11y violation(s) on mobile.\n` +
        newCriticalSerious.map((v) => `  ${v.key} [${v.impact}]: ${v.description}`).join("\n"),
    ).toHaveLength(0);
  });
});

test.describe("@mobile Axe a11y audit -- mobile AR (RTL)", () => {
  test.setTimeout(60_000);
  test("no new critical/serious violations on RTL mobile pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const baseline = loadBaseline();
    const newViolations: { key: string; impact: string; description: string; count: number }[] = [];
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of PAGES_MOBILE_AR) {
      if (p.needsAuth) {
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

    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (mobile AR):", JSON.stringify(bySeverity));
    console.log(`NEW (not in baseline): ${newViolations.length}`);

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
      `${newCriticalSerious.length} NEW critical/serious a11y violation(s) on mobile AR.\n` +
        newCriticalSerious.map((v) => `  ${v.key} [${v.impact}]: ${v.description}`).join("\n"),
    ).toHaveLength(0);
  });
});
