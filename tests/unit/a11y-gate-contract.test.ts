import { expect, test } from "vitest";
import { DESKTOP_A11Y_PAGES, MOBILE_A11Y_PAGES } from "../e2e/a11y-routes.js";

const requiredStandaloneRoutes = [
  "/automate",
  "/files",
  "/privacy",
  "/change-password",
  "/__a11y-not-found",
];

for (const [surface, pages] of [
  ["desktop", DESKTOP_A11Y_PAGES],
  ["mobile", MOBILE_A11Y_PAGES],
] as const) {
  test(`${surface} audits every standalone route and settings in EN and AR`, () => {
    for (const locale of ["en", "ar"] as const) {
      const localePages = pages[locale];
      const paths = localePages.map((page) => page.path);
      expect(new Set(localePages.map((page) => page.key)).size).toBe(localePages.length);
      for (const route of requiredStandaloneRoutes) {
        expect(paths, `${surface} ${locale}: ${route}`).toContain(route);
      }
      expect(localePages.filter((page) => page.openSettings)).toEqual([
        expect.objectContaining({ path: "/", needsAuth: true }),
      ]);
    }
  });
}
