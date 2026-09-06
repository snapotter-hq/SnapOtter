import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The shared PostHog script only does anything if each site actually emits it
 * and each deploy actually passes the key. Both are one-line facts that a
 * refactor can drop without any test noticing, so they are pinned as text.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");

/** The text of one workflow step, so an env var on the wrong step does not pass. */
function step(workflow: string, name: string, nextName: string): string {
  const start = workflow.indexOf(`name: ${name}`);
  const end = workflow.indexOf(`name: ${nextName}`);
  expect(start, `step "${name}"`).toBeGreaterThanOrEqual(0);
  expect(end, `step "${nextName}" after "${name}"`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("landing site", () => {
  it("emits the shared script from the head, not the end of the body", () => {
    const layout = read("apps/landing/src/layouts/Base.astro");
    const headStart = layout.indexOf("<head>");
    const bodyStart = layout.indexOf("<body");
    expect(headStart).toBeGreaterThanOrEqual(0);
    expect(bodyStart).toBeGreaterThan(headStart);

    expect(layout.slice(headStart, layout.indexOf("</head>"))).toContain("<Analytics />");
    expect(layout.slice(bodyStart)).not.toContain("<Analytics />");
  });

  it("builds the script from the shared module, gated on the public key", () => {
    const component = read("apps/landing/src/components/Analytics.astro");

    expect(component).toContain("publicSiteAnalyticsScript");
    expect(component).toContain("import.meta.env.PUBLIC_POSTHOG_KEY");
    expect(component).toContain("import.meta.env.PUBLIC_POSTHOG_HOST");
    expect(component).toContain("set:html");
  });

  it("gets the key and the proxy host on the build step of the deploy workflow", () => {
    const workflow = read(".github/workflows/deploy-landing.yml");
    const build = step(workflow, "Build Landing Page", "Guard against lowercased locale URLs");

    expect(build).toContain("PUBLIC_POSTHOG_KEY: $" + "{{ secrets.SNAPOTTER_POSTHOG_KEY }}");
    expect(build).toContain("PUBLIC_POSTHOG_HOST: https://e.snapotter.com");
  });

  it("discloses PostHog and its cookie on the privacy page", () => {
    // publicSiteAnalyticsConfig leaves persistence on the SDK default, which
    // sets a first-party cookie. The policy text has to say so, in every locale.
    const en = JSON.parse(read("apps/landing/src/i18n/en.json")) as Record<string, string>;

    expect(en["privacy.website.item1"]).toMatch(/PostHog/);
    expect(en["privacy.website.item1"]).toMatch(/cookie/);
    expect(en["privacy.website.item1"]).not.toMatch(/do not use tracking cookies/i);
  });
});

describe("docs site", () => {
  it("emits the shared script first in the head, gated on the public key", () => {
    const config = read("apps/docs/.vitepress/config.mts");

    expect(config).toContain("publicSiteAnalyticsScript");
    expect(config).toContain("process.env.PUBLIC_POSTHOG_KEY");
    expect(config).toContain("process.env.PUBLIC_POSTHOG_HOST");
    expect(config).toMatch(/head:\s*\[\s*\.\.\.analyticsHead,/);
    expect(config).toContain('["script", {}, analyticsScript]');
  });

  it("gets the key and the proxy host on the build step of the deploy workflow", () => {
    const workflow = read(".github/workflows/deploy-docs.yml");
    const build = step(workflow, "Build Docs", "Deploy to Cloudflare Pages");

    expect(build).toContain("PUBLIC_POSTHOG_KEY: $" + "{{ secrets.SNAPOTTER_POSTHOG_KEY }}");
    expect(build).toContain("PUBLIC_POSTHOG_HOST: https://e.snapotter.com");
  });
});

describe("both deploys", () => {
  for (const file of ["deploy-landing.yml", "deploy-docs.yml"]) {
    it(`${file} redeploys when the shared capture posture changes`, () => {
      // Without this a change to what the sites capture waits for the daily
      // cron, and nobody sees it go live.
      const workflow = read(`.github/workflows/${file}`);
      expect(workflow).toContain('"packages/shared/src/analytics/public-site.ts"');
    });

    it(`${file} checks the shipped page for the snippet after the egress guard`, () => {
      // The key going missing from the build env is the failure that already
      // happened once; a green deploy with dark analytics must not repeat it.
      const workflow = read(`.github/workflows/${file}`);
      const guard = workflow.indexOf("name: Verify the live site loads nothing third-party");
      const smoke = workflow.indexOf("name: Verify the live site carries the PostHog snippet");
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(smoke).toBeGreaterThan(guard);
      expect(workflow.slice(smoke)).toContain('posthog.init("phc_');
      expect(workflow.slice(smoke)).not.toMatch(/continue-on-error/);
    });
  }
});
