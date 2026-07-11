import type { Page } from "@playwright/test";
import { expect, openSettings, test } from "./helpers";

// Proves the instance-wide analytics opt-out works end to end THROUGH THE UI.
// With the bake forced ON, GET /api/v1/config/analytics reports enabled by
// default. An admin flips the System > Privacy toggle off and clicks the real
// "Save Settings" button, and the effective config flips to disabled with every
// secret blanked. The System bulk save now drops the read-only instance_id and
// cookie_secret keys plus any "********" redacted sentinel before the PUT, so
// the Save button persists the opt-out. Previously it 400'd on instance_id
// (READONLY_SETTING) and nothing was written.
//
// The analytics-local Playwright config sets ANALYTICS_BAKED_OVERRIDE=on so the
// compile-time bake is forced ON for this run; without it the effective state
// would be OFF regardless of the toggle (dev/test bake is off by default).

const CONFIG_PATH = "/api/v1/config/analytics";
const ANALYTICS_SWITCH = "Anonymous Product Analytics";
const SAVE_BUTTON = /save settings/i;

interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  sentryDsnWeb: string;
  posthogSampleRate: number;
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
  // Always reset to ON so a reused dev server and the next spec start enabled,
  // even if an assertion above failed mid-test.
  test.afterEach(async ({ loggedInPage: page }) => {
    await setAnalyticsEnabled(page, "true");
    await expect.poll(async () => (await readConfig(page)).enabled, { timeout: 10_000 }).toBe(true);
  });

  test("admin opts out via the real Save button and the effective config flips off", async ({
    loggedInPage: page,
  }) => {
    // Forced bake ON + no opt-out yet => enabled by default.
    expect((await readConfig(page)).enabled).toBe(true);

    // Open System settings; the analytics toggle reads ON.
    await openSystemSection(page);
    const toggle = page.getByRole("switch", { name: ANALYTICS_SWITCH });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // Flip OFF, then persist with the real "Save Settings" button. This is the
    // crux: the bulk save must succeed despite GET returning the read-only
    // instance_id key and "********" secret sentinels.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: SAVE_BUTTON }).click();

    // The success message confirms the PUT returned 2xx (no 400 READONLY_SETTING).
    await expect(page.getByText("Settings saved.")).toBeVisible();

    // The settings route refreshes the gate synchronously on write, so the
    // effective config flips to disabled near-immediately, secrets blanked.
    await expect
      .poll(async () => (await readConfig(page)).enabled, { timeout: 10_000 })
      .toBe(false);
    expect(await readConfig(page)).toEqual({
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sentryDsnWeb: "",
      posthogSampleRate: 0,
      instanceId: "",
    });

    // Reopening Settings shows the toggle OFF (gate -> UI round-trip).
    await page.keyboard.press("Escape");
    await openSystemSection(page);
    await expect(page.getByRole("switch", { name: ANALYTICS_SWITCH })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.keyboard.press("Escape");
  });

  test("targeted opt-out PUT flips the gate off without the UI", async ({ loggedInPage: page }) => {
    // Independent of the dialog: a direct analyticsEnabled=false write also
    // disables the gate and blanks the secrets. Guards the gate behavior on its
    // own so a UI regression can't mask a gate regression.
    expect((await readConfig(page)).enabled).toBe(true);
    await setAnalyticsEnabled(page, "false");
    await expect
      .poll(async () => (await readConfig(page)).enabled, { timeout: 10_000 })
      .toBe(false);
  });
});
