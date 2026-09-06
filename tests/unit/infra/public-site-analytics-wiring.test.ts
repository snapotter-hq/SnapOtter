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

describe("landing site", () => {
  it("emits the shared script from the head, not the end of the body", () => {
    const layout = read("apps/landing/src/layouts/Base.astro");
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    const body = layout.slice(layout.indexOf("<body"));

    expect(head).toContain("<Analytics />");
    expect(body).not.toContain("<Analytics />");
  });

  it("builds the script from the shared module, gated on the public key", () => {
    const component = read("apps/landing/src/components/Analytics.astro");

    expect(component).toContain("publicSiteAnalyticsScript");
    expect(component).toContain("import.meta.env.PUBLIC_POSTHOG_KEY");
    expect(component).toContain("import.meta.env.PUBLIC_POSTHOG_HOST");
    expect(component).toContain("set:html");
  });

  it("gets the key and the proxy host at build time in the deploy workflow", () => {
    const workflow = read(".github/workflows/deploy-landing.yml");

    expect(workflow).toContain("PUBLIC_POSTHOG_KEY: $" + "{{ secrets.SNAPOTTER_POSTHOG_KEY }}");
    expect(workflow).toContain("PUBLIC_POSTHOG_HOST: https://e.snapotter.com");
  });
});

describe("docs site", () => {
  it("emits the shared script from the head, gated on the public key", () => {
    const config = read("apps/docs/.vitepress/config.mts");

    expect(config).toContain("publicSiteAnalyticsScript");
    expect(config).toContain("process.env.PUBLIC_POSTHOG_KEY");
    expect(config).toContain("process.env.PUBLIC_POSTHOG_HOST");
  });

  it("gets the key and the proxy host at build time in the deploy workflow", () => {
    const workflow = read(".github/workflows/deploy-docs.yml");
    const buildStep = workflow.slice(
      workflow.indexOf("name: Build Docs"),
      workflow.indexOf("name: Deploy to Cloudflare Pages"),
    );

    expect(buildStep).toContain("PUBLIC_POSTHOG_KEY: $" + "{{ secrets.SNAPOTTER_POSTHOG_KEY }}");
    expect(buildStep).toContain("PUBLIC_POSTHOG_HOST: https://e.snapotter.com");
  });
});
