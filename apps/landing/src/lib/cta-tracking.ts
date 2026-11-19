// Named CTA events for the landing site (#5010). Autocapture alone can't tell
// the hero install path from the navbar's, since both share text and href, and
// its labels change with every locale and every markup refactor. So each CTA
// carries a stable `data-cta` (what it is) and `data-cta-location` (where it
// sits), plus an optional `data-cta-detail` (which category, which tool), and
// one delegated listener turns a click on it into a single named event.
//
// Events go through the page's own `window.posthog`, which only exists when the
// build had PUBLIC_POSTHOG_KEY (see components/Analytics.astro). That keeps
// PostHog the only destination, and posthog-js's opt_out_capturing applies to
// these exactly as it does to autocapture. Forks and PR previews have no
// `window.posthog`, so this is a no-op there.

export const CTA_EVENT = "landing_cta_clicked";

export interface CtaTarget {
  dataset: Record<string, string | undefined>;
  getAttribute(name: string): string | null;
}

interface ClickTarget {
  closest?: (selector: string) => CtaTarget | null;
}

interface PostHogLike {
  capture?: (event: string, properties: Record<string, string>) => void;
}

export function ctaEventProperties(el: CtaTarget, locale: string): Record<string, string> {
  const props: Record<string, string> = { cta: el.dataset.cta ?? "" };
  if (el.dataset.ctaLocation) props.location = el.dataset.ctaLocation;
  if (el.dataset.ctaDetail) props.detail = el.dataset.ctaDetail;
  const href = el.getAttribute("href");
  if (href) props.href = href;
  props.locale = locale;
  return props;
}

export function trackCtaClick(
  target: ClickTarget | null,
  posthog: PostHogLike | undefined,
  locale: string,
): void {
  if (typeof posthog?.capture !== "function") return;
  // Text nodes and the document have no closest(); nothing to track there.
  const el = typeof target?.closest === "function" ? target.closest("[data-cta]") : null;
  if (!el) return;
  posthog.capture(CTA_EVENT, ctaEventProperties(el, locale));
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

export function installCtaTracking(): void {
  // Capture phase, so the event is queued before a same-tab link navigates;
  // posthog-js flushes its queue with sendBeacon on unload.
  document.addEventListener(
    "click",
    (event) => {
      trackCtaClick(
        event.target as ClickTarget | null,
        window.posthog,
        document.documentElement.lang || "en",
      );
    },
    { capture: true },
  );
}
