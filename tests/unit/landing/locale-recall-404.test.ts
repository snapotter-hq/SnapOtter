import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The locale-recall script in Base.astro rewrites an English URL to the stored
 * locale. On the 404 page that path is the default "/", so a visitor with a
 * stored preference who hits a broken link was sent to the localized homepage
 * instead of seeing the 404 (#940). Astro pages can't be rendered in vitest, so
 * the opt-out is pinned as text; the browser behaviour lives in
 * tests/e2e-landing/locale-recall-banner.spec.ts.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");

describe("locale recall on the 404 page", () => {
  it("Base emits the recall script only when localeRecall is on", () => {
    const layout = read("apps/landing/src/layouts/Base.astro");
    expect(layout).toMatch(/localeRecall\?: boolean/);
    expect(layout).toMatch(/localeRecall = true,/);

    const guarded = layout.match(/\{localeRecall && \(\s*<script[\s\S]*?<\/script>\s*\)\}/);
    expect(guarded, "recall script is wrapped in a localeRecall guard").not.toBeNull();
    expect(guarded?.[0]).toContain("recallPath: path");
  });

  it("the 404 page turns locale recall off", () => {
    const page = read("apps/landing/src/pages/404.astro");
    const base = page.slice(page.indexOf("<Base"), page.indexOf(">", page.indexOf("<Base")));
    expect(base).toContain("localeRecall={false}");
  });
});
