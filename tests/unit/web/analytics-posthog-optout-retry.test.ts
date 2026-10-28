// @vitest-environment jsdom
//
// Real posthog-js: an event whose send failed (503) is re-sent by posthog-js's
// retry queue. Opting out must stop that retry from going out (#2284).
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

// posthog-js retries a 5xx after at most 4.5 s of backoff, and its queue polls
// every 3 s, so a retry that is still queued goes out within 7.5 s of the opt-out.
const RETRY_WINDOW_MS = 9_000;

it("does not re-send a failed event after the tab opts out", async () => {
  // posthog-js keeps the fetch it finds at load, so the failing wrapper must be
  // in place before the start imports it.
  const recorded = globalThis.fetch;
  let failEvents = false;
  let eventAttempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const response = await recorded(url, init);
      const isEvents = new URL(String(url)).pathname.replace(/\/$/, "") === "/e";
      if (!isEvents || !failEvents) return response;
      eventAttempts += 1;
      return new Response("", { status: 503 });
    }),
  );

  const mod = await import("../../../apps/web/src/lib/analytics");
  await mod.applyInstanceAnalytics(ON);
  await pastFlush(); // the start's own initial pageview
  sent.length = 0;

  failEvents = true;
  mod.track("tool_opened", { tool_id: "resize" });
  await vi.waitFor(() => expect(eventAttempts).toBe(1));

  await mod.applyInstanceAnalytics(OFF);
  sent.length = 0;
  await new Promise((r) => setTimeout(r, RETRY_WINDOW_MS));
  leavePage();

  expect(requestsTo("/e")).toEqual([]);
}, 30_000);
