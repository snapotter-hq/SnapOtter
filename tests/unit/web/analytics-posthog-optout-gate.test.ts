// @vitest-environment jsdom
//
// Real posthog-js: if opt_out_capturing() throws, the before_send gate must
// still keep posthog-js's own events ($pageview on SPA navigation, $pageleave
// on leaving) from going out after an opt-out (#2216, #423).
import { beforeAll, expect, it, vi } from "vitest";
import {
  installTransportSpies,
  leavePage,
  OFF,
  ON,
  pastFlush,
  requestsTo,
  sent,
} from "./posthog-egress-harness";

vi.mock("@sentry/react", () => ({ init: vi.fn(), getClient: () => null }));

beforeAll(() => installTransportSpies());

it("drops posthog-js's own events after an opt-out even if opting it out throws", async () => {
  const mod = await import("../../../apps/web/src/lib/analytics");
  await mod.applyInstanceAnalytics(ON);
  await pastFlush();

  const posthogJs = (await import("posthog-js")).default;
  vi.spyOn(Object.getPrototypeOf(posthogJs), "opt_out_capturing").mockImplementation(() => {
    throw new Error("storage blocked");
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await mod.applyInstanceAnalytics(OFF);
  sent.length = 0;
  window.history.pushState({}, "", "/image/resize");
  await pastFlush();
  leavePage();

  expect(requestsTo("/e")).toEqual([]);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("PostHog opt-out failed"),
    expect.anything(),
  );
}, 20_000);
