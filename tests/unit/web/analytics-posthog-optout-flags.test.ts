// @vitest-environment jsdom
//
// Real posthog-js: once remote config loads, it calls reloadFeatureFlags()
// every 5 minutes without checking the opt-out, and /flags carries the
// anonymous id and the raw first URL and referrer. The app uses no feature
// flags, so none of that may happen after an opt-out (#2216, #423).
//
// jsdom never runs the remote-config script that arms that timer, so the test
// calls what the timer calls.
import { beforeAll, expect, it, vi } from "vitest";
import { installTransportSpies, OFF, ON, requestsTo, sent } from "./posthog-egress-harness";

vi.mock("@sentry/react", () => ({ init: vi.fn(), getClient: () => null }));

beforeAll(() => installTransportSpies());

it("makes no /flags request after an opt-out when the refresh fires", async () => {
  const mod = await import("../../../apps/web/src/lib/analytics");
  await mod.applyInstanceAnalytics(ON);
  await mod.applyInstanceAnalytics(OFF);
  sent.length = 0;

  const posthogJs = (await import("posthog-js")).default;
  posthogJs.reloadFeatureFlags();
  await new Promise((r) => setTimeout(r, 100));

  expect(requestsTo("/flags")).toEqual([]);
});
