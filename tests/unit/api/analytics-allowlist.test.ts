import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "../../../apps/api/src/lib/analytics-allowlist.js";

describe("sanitizeEventProperties", () => {
  it("keeps only allow-listed keys for tool_used", () => {
    const out = sanitizeEventProperties("tool_used", {
      tool_id: "resize",
      status: "completed",
      duration_ms: 12,
      category: "image",
      is_ai_tool: false,
      error_message: "stack with /uploads/secret.docx",
      params: { watermark_text: "CONFIDENTIAL" },
    });
    expect(out).toEqual({
      tool_id: "resize",
      status: "completed",
      duration_ms: 12,
      category: "image",
      is_ai_tool: false,
    });
    expect(out).not.toHaveProperty("error_message");
    expect(out).not.toHaveProperty("params");
  });

  it("drops non-primitive values", () => {
    const out = sanitizeEventProperties("ai_bundle_action", {
      bundle_id: "ocr",
      action: "installed",
      duration_ms: { nested: 1 } as unknown as number,
    });
    expect(out).toEqual({ bundle_id: "ocr", action: "installed" });
  });

  it("returns no properties for an unknown event", () => {
    const out = sanitizeEventProperties("totally_new_event", { anything: "x" });
    expect(out).toEqual({});
  });
});
