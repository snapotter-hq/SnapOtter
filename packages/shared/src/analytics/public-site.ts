// PostHog for the public sites: snapotter.com (Astro) and docs.snapotter.com
// (VitePress). Both emit the inline script this module builds, so what the
// sites capture is decided once, here, and pinned by
// tests/unit/shared/public-site-analytics.test.ts.
//
// This is the opposite posture from the self-hosted app
// (apps/web/src/lib/analytics.ts). A user's instance sends a strict allowlist
// of events and nothing else. Our own marketing and docs pages run the full
// SDK: autocapture, session replay, heatmaps, dead clicks, web vitals, with a
// first-party cookie and no banner. Decided on #793, recorded in TELEMETRY.md.

import { stripTrailingSlash } from "./proxy.js";

/** Where toolbar and "view in PostHog" links go. The proxy only carries ingestion. */
const UI_HOST = "https://us.posthog.com";

/** The posthog-js defaults preset the public sites were checked against. */
const SDK_DEFAULTS = "2026-05-30";

/**
 * The posthog-js init options both sites use. Persistence is left on the SDK
 * default (a first-party cookie plus localStorage), which is what the privacy
 * page discloses; change one and the other has to follow.
 */
export function publicSiteAnalyticsConfig(host: string) {
  return {
    api_host: stripTrailingSlash(host),
    ui_host: UI_HOST,
    defaults: SDK_DEFAULTS,
    // history_change also fires the initial $pageview, and VitePress routes
    // client-side, so one setting serves both sites.
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_heatmaps: true,
    capture_dead_clicks: true,
    capture_performance: { web_vitals: true },
    // No forms on either site today; masking inputs is the cheap guarantee
    // that a future search box or contact form never ends up in a replay.
    session_recording: { maskAllInputs: true },
    // Nobody identifies on a marketing page. Anonymous events are what we
    // want, and they cost a fraction of person-profile events.
    person_profiles: "identified_only",
    // Ad-click ids (gclid, fbclid, ...) are masked in URLs; UTM tags are kept,
    // so attribution survives and the privacy page's "never to identify you"
    // stays true.
    mask_personal_data_properties: true,
  } as const;
}

export type PublicSiteAnalyticsConfig = ReturnType<typeof publicSiteAnalyticsConfig>;

/**
 * PostHog's stub loader, as published in the snippet docs. It records the
 * init call, queues every SDK call made before array.js arrives, and inserts
 * the async script tag that fetches the SDK from `api_host`; the managed
 * proxy serves /static as well as ingestion.
 */
const LOADER =
  '!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);';

/** Keep a value from ever closing the inline script tag it is embedded in. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The script body both sites place in `<head>`. Empty when there is no key,
 * so forks and PR previews emit nothing at all (the landing Playwright build
 * passes a placeholder key aimed at an unroutable host, so it can assert the
 * snippet lands in every page). CTA clicks need no code of their own:
 * autocapture records every click with the element's text and href, and a
 * named event is a PostHog Action on top.
 */
export function publicSiteAnalyticsScript(input: { key: string; host: string }): string {
  if (!input.key) return "";
  const config = publicSiteAnalyticsConfig(input.host);
  // Our own once-guard, independent of PostHog's. VitePress re-appends head
  // scripts on the first client-side navigation (its SSR adoption compares
  // the raw config string with the minified node and gives up), so without
  // this the docs ran posthog.init twice per session and logged a warning.
  return `if(!window.__snapotterAnalytics){window.__snapotterAnalytics=1;\n${LOADER}\nposthog.init(${inlineJson(input.key)},${inlineJson(config)});}`;
}
