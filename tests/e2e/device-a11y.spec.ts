/**
 * Axe accessibility pass -- mobile device (mobile-chromium project).
 *
 * Mirrors the desktop a11y spec's scoped set on a real device emulation
 * (Pixel 7 via mobile-chromium). All tests tagged @mobile for project routing.
 *
 * The release gate requires zero axe violations in the scoped pages.
 */
import AxeBuilder from "@axe-core/playwright";
import { MOBILE_A11Y_PAGES } from "./a11y-routes.js";
import { expect, openSettings, test } from "./helpers";

interface ViolationEntry {
  id: string;
  impact: string | undefined;
  description: string;
  nodes: { target?: unknown[]; failureSummary?: string }[];
}

function buildKey(pageKey: string, ruleId: string): string {
  return `${pageKey}:${ruleId}`;
}

async function auditPage(
  page: import("@playwright/test").Page,
  pageKey: string,
  allViolations: {
    key: string;
    impact: string;
    description: string;
    count: number;
    targets: string[];
  }[],
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
      targets: v.nodes.map((n) => (n.target ?? []).join(" ")),
    };
    allViolations.push(entry);
  }
}

// ---- Tests ----

test.describe("@mobile Axe a11y audit -- mobile EN", () => {
  test.setTimeout(90_000);
  test("has no accessibility violations on scoped pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const allViolations: {
      key: string;
      impact: string;
      description: string;
      count: number;
      targets: string[];
    }[] = [];

    for (const p of MOBILE_A11Y_PAGES.en) {
      if (p.needsAuth) {
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        if (p.openSettings) await openSettings(page);
        await auditPage(page, p.key, allViolations);
        if (p.openSettings) await page.keyboard.press("Escape");
      } else {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const anonPage = await ctx.newPage();
        await anonPage.goto(p.path);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.waitForTimeout(500);
        await auditPage(anonPage, p.key, allViolations);
        await ctx.close();
      }
    }

    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (mobile EN):", JSON.stringify(bySeverity));
    console.log(`total unique rules violated: ${allViolations.length}`);
    expect(
      allViolations,
      `${allViolations.length} accessibility violation(s) on mobile.\n` +
        allViolations
          .map(
            (v) =>
              `  ${v.key} [${v.impact}]: ${v.description}\n${v.targets.map((t) => `    - ${t}`).join("\n")}`,
          )
          .join("\n"),
    ).toHaveLength(0);
  });
});

test.describe("@mobile Axe a11y audit -- mobile AR (RTL)", () => {
  test.setTimeout(60_000);
  test("has no accessibility violations on RTL mobile pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const allViolations: {
      key: string;
      impact: string;
      description: string;
      count: number;
      targets: string[];
    }[] = [];

    for (const p of MOBILE_A11Y_PAGES.ar) {
      if (p.needsAuth) {
        await page.evaluate(() => {
          localStorage.setItem("snapotter-locale", "ar");
        });
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        if (p.openSettings) await openSettings(page);
        await auditPage(page, p.key, allViolations);
        if (p.openSettings) await page.keyboard.press("Escape");
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
        await auditPage(anonPage, p.key, allViolations);
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
    expect(
      allViolations,
      `${allViolations.length} accessibility violation(s) on mobile AR.\n` +
        allViolations
          .map(
            (v) =>
              `  ${v.key} [${v.impact}]: ${v.description}\n${v.targets.map((t) => `    - ${t}`).join("\n")}`,
          )
          .join("\n"),
    ).toHaveLength(0);
  });
});
