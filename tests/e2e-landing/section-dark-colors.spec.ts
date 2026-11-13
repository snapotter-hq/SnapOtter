import { expect, test } from "@playwright/test";
import { waitForRevealsSettled } from "./helpers.js";

// #4297: an unlayered `.section-dark span` rule beat Tailwind's layered utilities,
// so spans styled with an explicit text colour rendered the muted band colour.
const EXPECTED = [
  { selector: ".section-dark span.text-primary-light", rgb: "rgb(240, 149, 80)" },
  { selector: ".section-dark span.text-dark-fg", rgb: "rgb(240, 235, 228)" },
];

for (const path of ["/", "/enterprise"]) {
  test(`landing ${path} dark bands keep utility text colours on spans`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await waitForRevealsSettled(page);
    for (const { selector, rgb } of EXPECTED) {
      const colors = await page
        .locator(selector)
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
      if (path === "/enterprise" || selector.includes("primary-light")) {
        expect(colors.length, `${selector} on ${path}`).toBeGreaterThan(0);
      }
      expect(
        colors.filter((c) => c !== rgb),
        `${selector} on ${path}`,
      ).toEqual([]);
    }
  });
}
