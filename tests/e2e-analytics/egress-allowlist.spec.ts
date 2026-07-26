/**
 * Third-party egress allowlist.
 *
 * PostHog and Sentry are the only destinations this app may ever contact, and
 * only while analytics is effectively enabled. Map tiles, API-reference fonts,
 * editor fonts and the landing star count are all self-hosted or baked at build
 * time precisely so that no page load reaches an origin the operator did not
 * choose. This asserts that directly: every request that is not loopback is
 * recorded and aborted, and the allowlist is derived from the instance's own
 * effective analytics config rather than hard-coded.
 *
 * On a source build the bake is empty, so the allowlist is empty and ANY
 * third-party request fails this test. That is the case that catches a newly
 * added CDN font, analytics snippet or github.com fetch.
 */
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./helpers";

const ROUTES = ["/", "/image/resize", "/automate", "/files", "/editor", "/privacy"];

interface AnalyticsConfig {
  enabled: boolean;
  posthogHost: string;
  sentryDsn: string;
  sentryDsnWeb: string;
}

function originOf(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/**
 * Record and block every non-loopback request. Blocking rather than observing
 * keeps the check from becoming the leak it is testing for.
 */
async function captureExternalRequests(page: Page, sink: string[]): Promise<void> {
  await page.route("**/*", (route: Route) => {
    const url = new URL(route.request().url());
    if (isLoopback(url.hostname)) return route.continue();
    sink.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
}

async function visitEveryRoute(page: Page): Promise<void> {
  for (const path of ROUTES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
}

test.describe("Third-party egress", () => {
  test("no route reaches an origin outside the analytics allowlist", async ({ page }) => {
    const config = (await (
      await page.request.get("/api/v1/config/analytics")
    ).json()) as AnalyticsConfig;
    const allowed = new Set(
      [config.posthogHost, config.sentryDsn, config.sentryDsnWeb]
        .map(originOf)
        .filter((origin): origin is string => origin !== null),
    );

    const external: string[] = [];
    await captureExternalRequests(page, external);
    await visitEveryRoute(page);

    const disallowed = external.filter((entry) => {
      const origin = entry.split(" ")[1];
      return ![...allowed].some((permitted) => origin.startsWith(permitted));
    });

    expect(
      disallowed,
      "PostHog and Sentry are the only permitted destinations; everything else must be self-hosted",
    ).toEqual([]);
  });

  test("opting out leaves no destination the client could contact", async ({
    loggedInPage: page,
  }) => {
    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    const auth = token ? { authorization: `Bearer ${token}` } : {};
    const optOut = await page.request.put("/api/v1/settings", {
      headers: auth,
      data: { analyticsEnabled: "false" },
    });
    expect(optOut.ok(), `opt-out failed with ${optOut.status()}`).toBe(true);

    try {
      const config = (await (
        await page.request.get("/api/v1/config/analytics")
      ).json()) as AnalyticsConfig;
      // Blanked, not merely flagged off: a client that ignored `enabled` would
      // still have nowhere to send anything.
      expect(config.enabled).toBe(false);
      expect(config.posthogHost).toBe("");
      expect(config.sentryDsn).toBe("");
      expect(config.sentryDsnWeb).toBe("");

      const external: string[] = [];
      await captureExternalRequests(page, external);
      await visitEveryRoute(page);

      expect(external, "an opted-out instance must make no third-party request at all").toEqual([]);
    } finally {
      await page.request.put("/api/v1/settings", {
        headers: auth,
        data: { analyticsEnabled: "true" },
      });
    }
  });
});
