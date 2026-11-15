// @vitest-environment jsdom

/** tool_client_error names the tool route it crashed on, when there is one (#4216). */

import { afterEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();

vi.mock("@/lib/analytics", () => ({
  isAnalyticsActive: () => true,
  getRenderErrorDestination: () => "drop",
  track: (...args: unknown[]) => track(...args),
}));

const { reportRenderError } = await import("@/lib/report-render-error");
const { TOOLS } = await import("@snapotter/shared");

afterEach(() => {
  track.mockReset();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("tool_client_error properties", () => {
  it("carries tool_id and phase on a tool route", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tool = TOOLS[0];
    window.history.replaceState(null, "", tool.route);
    reportRenderError(new TypeError("x is not a function"));
    expect(track).toHaveBeenCalledWith("tool_client_error", {
      error_name: "TypeError",
      phase: "render",
      tool_id: tool.id,
    });
  });

  it("omits tool_id off a tool route", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState(null, "", "/settings");
    reportRenderError(new TypeError("x is not a function"));
    expect(track).toHaveBeenCalledWith("tool_client_error", {
      error_name: "TypeError",
      phase: "render",
    });
  });
});
