import type { Page } from "@playwright/test";
import { expect, openSettings, test } from "./helpers";

// Proves the instance-wide analytics opt-out works end to end: with the bake
// forced ON, GET /api/v1/config/analytics reports enabled by default, an admin
// opt-out flips it to disabled (secrets blanked), and the System settings toggle
// reflects that state both ways.
//
// The analytics-local Playwright config sets ANALYTICS_BAKED_OVERRIDE=on so the
// compile-time bake is forced ON for this run; without it the effective state
// would be OFF regardless of the toggle (dev/test bake is off by default).
//
// NOTE on persistence: we write the opt-out with a targeted PUT of just
// analyticsEnabled rather than the System section's "Save Settings" button. That
// button re-POSTs every loaded setting, which includes the read-only instance_id
// and cookie_secret keys the API rejects (400 READONLY_SETTING). A targeted
// write has the exact effect the toggle is meant to have without tripping that
// pre-existing bulk-save limitation.

const CONFIG_PATH = "/api/v1/config/analytics";
const ANALYTICS_SWITCH = "Anonymous Product Analytics";

interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  sampleRate: number;
  instanceId: string;
}

async function readConfig(page: Page): Promise<AnalyticsConfig> {
  const res = await page.request.get(CONFIG_PATH);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function setAnalyticsEnabled(page: Page, value: "true" | "false"): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
  const res = await page.request.put("/api/v1/settings", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    data: { analyticsEnabled: value },
  });
  expect(res.ok(), `PUT analyticsEnabled=${value} failed: ${res.status()}`).toBeTruthy();
}

async function openSystemSection(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole("button", { name: /system settings/i }).click();
  await expect(page.getByRole("switch", { name: ANALYTICS_SWITCH })).toBeVisible();
}

test.describe("Analytics opt-out toggle", () => {
  test("opting out flips the effective config off and the UI reflects it", async ({
    loggedInPage: page,
  }) => {
    // Forced bake ON + no opt-out yet => enabled by default.
    expect((await readConfig(page)).enabled).toBe(true);

    // The System settings toggle exists and reads ON.
    await openSystemSection(page);
    await expect(page.getByRole("switch", { name: ANALYTICS_SWITCH })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");

    // Opt out instance-wide.
    await setAnalyticsEnabled(page, "false");

    // Effective config is now disabled with every secret blanked.
    await expect
      .poll(async () => (await readConfig(page)).enabled, { timeout: 10_000 })
      .toBe(false);
    expect(await readConfig(page)).toEqual({
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sampleRate: 0,
      instanceId: "",
    });

    // Reopening Settings shows the toggle OFF (gate -> UI round-trip).
    await openSystemSection(page);
    await expect(page.getByRole("switch", { name: ANALYTICS_SWITCH })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.keyboard.press("Escape");

    // Reset so other specs (and a reused dev server) see analytics back ON.
    await setAnalyticsEnabled(page, "true");
    await expect.poll(async () => (await readConfig(page)).enabled, { timeout: 10_000 }).toBe(true);
  });
});
