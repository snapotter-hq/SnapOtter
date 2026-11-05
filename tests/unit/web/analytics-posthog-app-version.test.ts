// @vitest-environment jsdom
//
// Real posthog-js: the first $pageview must already carry app_version. It used
// to be registered as a super property only after an `await import(...)`, so a
// pageview captured between init and register went out without it (#4215).
// Transport is stubbed by the harness, so nothing leaves the test process.
import { APP_VERSION } from "@snapotter/shared";
import { beforeAll, expect, it, vi } from "vitest";
import {
  installTransportSpies,
  leavePage,
  ON,
  pastFlush,
  requestsTo,
} from "./posthog-egress-harness";

vi.mock("@sentry/react", () => ({ init: vi.fn(), getClient: () => null }));

beforeAll(() => installTransportSpies());

function capturedEvents(): Array<{ event: string; properties: Record<string, unknown> }> {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  for (const req of requestsTo("/e")) {
    // Beacon bodies are Blobs the harness can't read; fetch and XHR carry text.
    if (req.body === "[blob]") continue;
    const parsed = JSON.parse(req.body);
    events.push(...(parsed.batch ?? [parsed]));
  }
  return events;
}

it("stamps app_version on every event, the first $pageview included", async () => {
  const mod = await import("../../../apps/web/src/lib/analytics");
  await mod.applyInstanceAnalytics(ON);
  window.history.pushState({}, "", "/image/resize");
  await pastFlush();
  leavePage();

  const events = capturedEvents();
  const pageviews = events.filter((e) => e.event === "$pageview");
  expect(pageviews.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.properties.app_version, e.event).toBe(APP_VERSION);
  }
}, 20_000);
