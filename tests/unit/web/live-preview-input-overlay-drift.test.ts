import { describe, expect, it } from "vitest";
import { LIVE_PREVIEW_INPUT_OVERLAY_TOOLS, TOOL_DISPLAY_MODES } from "@/lib/tool-display-modes";

/**
 * Issue #713: LIVE_PREVIEW_INPUT_OVERLAY_TOOLS switches the post-processing
 * viewer to the server result for live-preview tools whose overlay is an
 * input control. A member that is not actually a live-preview tool never
 * reaches the branch that reads the set, so a typo'd id silently
 * reintroduces the bug for that tool.
 */
describe("LIVE_PREVIEW_INPUT_OVERLAY_TOOLS drift (issue #713)", () => {
  it("contains only ids registered as live-preview tools", () => {
    expect(LIVE_PREVIEW_INPUT_OVERLAY_TOOLS.size).toBeGreaterThan(0);
    for (const id of LIVE_PREVIEW_INPUT_OVERLAY_TOOLS) {
      expect(
        TOOL_DISPLAY_MODES[id],
        `"${id}" is in LIVE_PREVIEW_INPUT_OVERLAY_TOOLS but is not a live-preview tool`,
      ).toBe("live-preview");
    }
  });
});
