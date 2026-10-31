// @vitest-environment jsdom
//
// Real posthog-js: nothing captured before an analytics opt-out may be held
// back and sent after it (#2216, #423). Batching used to hold events for up to
// 3 s and flush them by timer or sendBeacon regardless of the opt-out.
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

it("sends an event when it's captured, and nothing after the opt-out", async () => {
  const mod = await import("../../../apps/web/src/lib/analytics");
  await mod.applyInstanceAnalytics(ON);
  await pastFlush(); // the start's own initial pageview
  sent.length = 0;

  mod.track("tool_opened", { tool_id: "resize" });
  // A send under way (posthog-js gzips the body asynchronously) gets a moment.
  await new Promise((r) => setTimeout(r, 100));
  // Sent now, not held for a later flush.
  expect(requestsTo("/e").length).toBeGreaterThan(0);

  await mod.applyInstanceAnalytics(OFF);
  sent.length = 0;
  await pastFlush();
  leavePage();

  expect(requestsTo("/e")).toEqual([]);
}, 20_000);
