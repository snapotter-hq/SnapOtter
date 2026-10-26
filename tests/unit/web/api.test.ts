import { describe, expect, it } from "vitest";
import { parseApiError } from "../../../apps/web/src/lib/api";

describe("parseApiError", () => {
  it("includes path in array details", () => {
    const body = {
      error: "Invalid settings",
      details: [
        { path: "padColor", message: "Invalid" },
        { path: ["steps", 0, "settings", "width"], message: "Expected number" },
      ],
    };
    expect(parseApiError(body, 400)).toBe(
      "Invalid settings: padColor: Invalid; steps.0.settings.width: Expected number",
    );
  });
});
