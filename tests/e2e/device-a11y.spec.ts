/**
 * Axe accessibility pass -- mobile device (mobile-chromium project).
 *
 * Mirrors the desktop a11y spec's scoped set on a real device emulation
 * (Pixel 7 via mobile-chromium). All tests tagged @mobile for project routing.
 *
 * The release gate requires zero axe violations in the scoped pages.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./helpers";

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

// ---- Scoped page set (mobile, EN + AR) ----

const PAGES_MOBILE_EN = [
  { key: "mobile-home-en", path: "/", needsAuth: true },
  { key: "mobile-image-resize-en", path: "/image/resize", needsAuth: true },
  { key: "mobile-video-convert-en", path: "/video/convert-video", needsAuth: true },
  { key: "mobile-audio-convert-en", path: "/audio/convert-audio", needsAuth: true },
  { key: "mobile-pdf-pdf-to-image-en", path: "/pdf/pdf-to-image", needsAuth: true },
  { key: "mobile-files-csv-excel-en", path: "/files/csv-excel", needsAuth: true },
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

    for (const p of PAGES_MOBILE_EN) {
      if (p.needsAuth) {
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await auditPage(page, p.key, allViolations);
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

    for (const p of PAGES_MOBILE_AR) {
      if (p.needsAuth) {
        await page.evaluate(() => {
          localStorage.setItem("snapotter-locale", "ar");
        });
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await auditPage(page, p.key, allViolations);
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
