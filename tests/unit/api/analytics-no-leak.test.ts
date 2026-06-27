// Proves the server-side invariant: trackEvent does not emit to PostHog when
// analytics is disabled by the runtime gate. Replaces the old source-string and
// denylist-regex assertions, which no longer match the gated implementation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Server-side analytics gating (behavioral)", () => {
  const origEnv = process.env.NODE_ENV;
  const origOverride = process.env.ANALYTICS_BAKED_OVERRIDE;

  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    if (origOverride === undefined) delete process.env.ANALYTICS_BAKED_OVERRIDE;
    else process.env.ANALYTICS_BAKED_OVERRIDE = origOverride;
    vi.restoreAllMocks();
  });

  it("trackEvent does not capture when the gate is off", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    const capture = vi.fn();
    vi.doMock("posthog-node", () => ({
      PostHog: vi.fn(() => ({ capture, shutdown: vi.fn() })),
    }));
    const { trackEvent } = await import("../../../apps/api/src/lib/analytics.js");
    await trackEvent("tool_used", { tool_id: "resize" }, "did-1");
    expect(capture).not.toHaveBeenCalled();
  });
});
