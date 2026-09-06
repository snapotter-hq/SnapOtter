// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  publicSiteAnalyticsConfig,
  publicSiteAnalyticsScript,
} from "../../../packages/shared/src/analytics/public-site.js";

/**
 * The public sites (snapotter.com and docs.snapotter.com) run the full PostHog
 * web SDK: autocapture, replay, heatmaps, web vitals. Both sites emit the same
 * inline script from this one module, so what it captures is decided in one
 * place and pinned here. The loader tests run the emitted script in jsdom,
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

function runInPage(script: string): void {
  // The loader inserts the SDK tag before the first <script> in the document.
  // In production that is the inline snippet itself; here it has to be seeded,
  // and without it the loader throws on `parentNode` rather than passing.
  document.head.innerHTML = "<script></script>";
  new Function(script)();
}

describe("publicSiteAnalyticsConfig", () => {
  it("captures what the public sites decided to capture", () => {
    expect(publicSiteAnalyticsConfig(HOST)).toEqual({
      api_host: HOST,
      ui_host: "https://us.posthog.com",
      defaults: "2026-05-30",
      capture_pageview: "history_change",
      capture_pageleave: true,
      capture_heatmaps: true,
      capture_dead_clicks: true,
      capture_performance: { web_vitals: true },
      session_recording: { maskAllInputs: true },
      person_profiles: "identified_only",
      mask_personal_data_properties: true,
    });
  });

  it("strips a trailing slash so asset URLs do not double up", () => {
    expect(publicSiteAnalyticsConfig("https://e.snapotter.com/").api_host).toBe(HOST);
  });
});

describe("publicSiteAnalyticsScript", () => {
  beforeEach(() => {
    window.posthog = undefined;
    // biome-ignore lint/suspicious/noExplicitAny: our once-guard lives on window.
    (window as any).__snapotterAnalytics = undefined;
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("emits nothing without a key, so forks and PR previews stay silent", () => {
    expect(publicSiteAnalyticsScript({ key: "", host: HOST })).toBe("");
  });

  it("is a script body, not markup; the caller owns the tag", () => {
    expect(publicSiteAnalyticsScript({ key: KEY, host: HOST })).not.toMatch(/<\/?script/i);
  });

  it("cannot be broken out of by a hostile key", () => {
    const hostile = "</script><img src=x>";
    const script = publicSiteAnalyticsScript({ key: hostile, host: HOST });

    expect(script).not.toMatch(/<\/script/i);
    runInPage(script);
    expect(window.posthog._i[0][0]).toBe(hostile);
  });

  it("loads the SDK from the proxy and queues init with the shared config", () => {
    runInPage(publicSiteAnalyticsScript({ key: KEY, host: HOST }));

    const loader = document.querySelector<HTMLScriptElement>("script[src]");
    expect(loader?.src).toBe(`${HOST}/static/array.js`);
    expect(loader?.async).toBe(true);
    // The stub names the default instance "posthog" and records [key, config, name].
    expect(window.posthog._i).toEqual([[KEY, publicSiteAnalyticsConfig(HOST), "posthog"]]);
  });

  it("does not initialise twice when the script runs twice on one page", () => {
    const script = publicSiteAnalyticsScript({ key: KEY, host: HOST });
    runInPage(script);
    new Function(script)();

    expect(window.posthog._i).toHaveLength(1);
    expect(document.querySelectorAll("script[src]")).toHaveLength(1);
  });

  it("leaves a loaded SDK alone when VitePress re-runs the head script", () => {
    // VitePress appends the head script again on the first client-side
    // navigation. By then array.js has replaced the stub, and PostHog's own
    // guard only covers the loader, so a second posthog.init would run and
    // warn. Our guard has to cover the init call too.
    const script = publicSiteAnalyticsScript({ key: KEY, host: HOST });
    runInPage(script);
    const init = vi.fn();
    window.posthog = { __SV: 1, init };

    new Function(script)();

    expect(init).not.toHaveBeenCalled();
  });
});
