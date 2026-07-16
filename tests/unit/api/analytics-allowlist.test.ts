import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "../../../apps/api/src/lib/analytics-allowlist.js";

describe("sanitizeEventProperties", () => {
  it("keeps the enriched allow-listed keys for tool_used and drops free-text/PII", () => {
    const out = sanitizeEventProperties("tool_used", {
      tool_id: "resize",
      status: "failed",
      duration_ms: 12,
      category: "image",
      is_ai_tool: false,
      is_batch: true,
      input_format: "heic",
      output_format: "png",
      bytes_in: 4096,
      bytes_out: 2048,
      execution_hint: "fast",
      error_kind: "input",
      error_code: "corrupt-header",
      error_message: "stack with /uploads/secret.docx",
      params: { watermark_text: "CONFIDENTIAL" },
    });
    expect(out).toEqual({
      tool_id: "resize",
      status: "failed",
      duration_ms: 12,
      category: "image",
      is_ai_tool: false,
      is_batch: true,
      input_format: "heic",
      output_format: "png",
      bytes_in: 4096,
      bytes_out: 2048,
      execution_hint: "fast",
      error_kind: "input",
      error_code: "corrupt-header",
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

  it("keeps only allow-listed keys for instance_started", () => {
    const out = sanitizeEventProperties("instance_started", {
      arch: "arm64",
      os_platform: "linux",
      deploy_mode: "embedded",
      gpu_present: false,
      hostname: "leaked-hostname",
    });
    expect(out).toEqual({
      arch: "arm64",
      os_platform: "linux",
      deploy_mode: "embedded",
      gpu_present: false,
    });
    expect(out).not.toHaveProperty("hostname");
  });
});
