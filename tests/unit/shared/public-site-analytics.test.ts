// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  PUBLIC_SITE_UI_HOST,
  publicSiteAnalyticsConfig,
  publicSiteAnalyticsScript,
} from "../../../packages/shared/src/analytics/public-site.js";

/**
 * The public sites (snapotter.com and docs.snapotter.com) run the full PostHog
 * web SDK: autocapture, replay, heatmaps, web vitals. Both sites emit the same
 * inline script from this one module, so what it captures is decided in one
 * place and pinned here. The loader test runs the emitted script in jsdom,
 * because a typo in a hand-pasted snippet would break analytics silently on
 * every page while every static test stayed green.
 */

const KEY = "phc_test_key";
const HOST = "https://e.snapotter.com";

declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: the PostHog stub is an array with methods bolted on.
    posthog?: any;
  }
}

describe("publicSiteAnalyticsConfig", () => {
  it("captures what the public sites decided to capture", () => {
    expect(publicSiteAnalyticsConfig(HOST)).toEqual({
      api_host: HOST,
      ui_host: PUBLIC_SITE_UI_HOST,
      defaults: "2026-05-30",
      capture_pageview: "history_change",
      capture_pageleave: true,
      capture_heatmaps: true,
      capture_dead_clicks: true,
      capture_performance: { web_vitals: true },
      session_recording: { maskAllInputs: true },
      person_profiles: "identified_only",
    });
  });

  it("points the UI host at PostHog itself, never at the proxy", () => {
    expect(publicSiteAnalyticsConfig(HOST).ui_host).toBe("https://us.posthog.com");
  });

  it("strips a trailing slash so asset URLs do not double up", () => {
    expect(publicSiteAnalyticsConfig("https://e.snapotter.com/").api_host).toBe(HOST);
  });
});

describe("publicSiteAnalyticsScript", () => {
  beforeEach(() => {
    window.posthog = undefined;
    document.head.innerHTML = "<script></script>";
    document.body.innerHTML = "";
  });

  it("emits nothing without a key, so forks and PR previews stay silent", () => {
    expect(publicSiteAnalyticsScript({ key: "", host: HOST })).toBe("");
  });

  it("is a script body, not markup; the caller owns the tag", () => {
    expect(publicSiteAnalyticsScript({ key: KEY, host: HOST })).not.toMatch(/<\/?script/i);
  });

  it("loads the SDK from the proxy and queues init with the shared config", () => {
    new Function(publicSiteAnalyticsScript({ key: KEY, host: HOST }))();

    const loader = document.querySelector<HTMLScriptElement>("script[src]");
    expect(loader?.src).toBe(`${HOST}/static/array.js`);
    expect(loader?.async).toBe(true);
    // The stub names the default instance "posthog" and records [key, config, name].
    expect(window.posthog._i).toEqual([[KEY, publicSiteAnalyticsConfig(HOST), "posthog"]]);
  });

  it("queues a data-ph click as a capture until the SDK arrives", () => {
    new Function(publicSiteAnalyticsScript({ key: KEY, host: HOST }))();
    document.body.innerHTML = '<a href="#" data-ph="download_click"><span>Get it</span></a>';

    document.querySelector("span")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(window.posthog).toContainEqual(["capture", "download_click"]);
  });

  it("does not initialise twice when the script runs twice on one page", () => {
    const script = publicSiteAnalyticsScript({ key: KEY, host: HOST });
    new Function(script)();
    new Function(script)();

    expect(window.posthog._i).toHaveLength(1);
    expect(document.querySelectorAll("script[src]")).toHaveLength(1);
  });
});
