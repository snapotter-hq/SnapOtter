import { TOOLS } from "../../packages/shared/src/constants";
import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// Visual baseline per tool page, generated from the shared TOOLS catalog.
//
// Runs in the chromium-visual project only. Baselines are platform-suffixed:
// darwin baselines come from local runs, linux baselines from the
// update-visual-baselines workflow (which opens a PR with refreshed goldens).
// AI tool pages capture whatever the default install state shows, which in CI
// is the install prompt.
// ---------------------------------------------------------------------------

test.describe("Tool page visual baselines", () => {
  for (const tool of TOOLS) {
    test(`${tool.id} page matches baseline`, async ({ loggedInPage: page }) => {
      await page.goto(`/${tool.id}`);
      // Settle: the tool name renders after the lazy settings chunk loads.
      await expect(page.getByText(tool.name, { exact: false }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot(`tool-${tool.id}.png`, {
        fullPage: false,
        animations: "disabled",
      });
    });
  }
});
