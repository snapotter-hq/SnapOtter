/**
 * Axe accessibility pass -- desktop (chromium project).
 *
 * Scoped set: home, one tool per modality, editor, settings, login.
 * Runs in the default locale (en) and one RTL locale (ar).
 *
 * The release gate requires zero axe violations in the scoped pages.
 */
import AxeBuilder from "@axe-core/playwright";
import { DESKTOP_A11Y_PAGES } from "./a11y-routes.js";
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

/**
 * Run axe on the current page and collect every violation. The caller gates
 * on the complete result so moderate debt cannot silently become permanent.
 */
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

// Each test scans 9+ pages with axe; the default 30s timeout is tight.
test.describe("Axe a11y audit -- desktop EN", () => {
  test.setTimeout(90_000);
  test("has no accessibility violations on scoped pages", async ({
    loggedInPage: page,
    browser,
  }) => {
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of DESKTOP_A11Y_PAGES.en) {
      if (p.needsAuth) {
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        if (p.openSettings) await openSettings(page);
        await auditPage(page, p.key, allViolations);
        if (p.openSettings) await page.keyboard.press("Escape");
      } else {
        // Login page: use a fresh context without auth
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const anonPage = await ctx.newPage();
        await anonPage.goto(p.path);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.waitForTimeout(500);
        await auditPage(anonPage, p.key, allViolations);
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

    expect(
      allViolations,
      `${allViolations.length} accessibility violation(s) found.\n` +
        allViolations
          .map(
            (v) =>
              `  ${v.key} [${v.impact}]: ${v.description}\n${v.targets.map((t) => `    - ${t}`).join("\n")}`,
          )
          .join("\n"),
    ).toHaveLength(0);
  });
});

test.describe("Axe a11y audit -- desktop AR (RTL)", () => {
  test.setTimeout(60_000);
  test("has no accessibility violations on RTL pages", async ({ loggedInPage: page, browser }) => {
    const allViolations: { key: string; impact: string; description: string; count: number }[] = [];

    for (const p of DESKTOP_A11Y_PAGES.ar) {
      if (p.needsAuth) {
        // Switch to Arabic locale
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
        // Set Arabic locale before navigating
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

    // Report
    const bySeverity: Record<string, number> = {};
    for (const v of allViolations) {
      bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
    }
    console.log("a11y violation counts by severity (desktop AR):", JSON.stringify(bySeverity));
    console.log(`total unique rules violated: ${allViolations.length}`);
    expect(
      allViolations,
      `${allViolations.length} accessibility violation(s) in AR locale.\n` +
        allViolations
          .map(
            (v) =>
              `  ${v.key} [${v.impact}]: ${v.description}\n${v.targets.map((t) => `    - ${t}`).join("\n")}`,
          )
          .join("\n"),
    ).toHaveLength(0);
  });
});
