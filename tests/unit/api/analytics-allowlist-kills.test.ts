import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "../../../apps/api/src/lib/analytics-allowlist.js";

// Feed every allow-listed key through the sanitizer and assert it survives. Each
// assertion pins one string literal in the ALLOWED sets: a mutant that blanks
// "duration_ms" (etc.) removes it from the set, so the value is dropped and the
// matching case fails. Covers the L8-L12 and L28-L31 survivor clusters.
const ALLOWED: Record<string, string[]> = {
  tool_used: [
    "tool_id",
    "status",
    "duration_ms",
    "category",
    "is_ai_tool",
    "is_batch",
    "input_format",
    "output_format",
    "bytes_in",
    "bytes_out",
    "execution_hint",
    "error_code",
    "error_kind",
  ],
  pipeline_executed: ["step_count", "tool_ids", "is_batch", "file_count", "duration_ms", "status"],
  ai_bundle_action: ["bundle_id", "action", "duration_ms"],
  instance_started: ["arch", "os_platform", "deploy_mode", "gpu_present"],
  auth_login: ["method"],
  auth_login_failed: ["method"],
};

describe("analytics-allowlist: each allow-listed key is kept", () => {
  for (const [event, keys] of Object.entries(ALLOWED)) {
    for (const key of keys) {
      it(`${event}.${key} survives sanitization`, () => {
        const value = key === "tool_ids" ? ["id-a", "id-b"] : "value";
        const out = sanitizeEventProperties(event, { [key]: value });
        expect(out[key]).toEqual(value);
      });
    }
  }

  it("keeps every key of an event at once (nothing silently dropped)", () => {
    const props: Record<string, unknown> = {};
    for (const key of ALLOWED.tool_used) props[key] = key === "tool_ids" ? ["x"] : "v";
    const out = sanitizeEventProperties("tool_used", props);
    expect(Object.keys(out).sort()).toEqual([...ALLOWED.tool_used].sort());
  });

  it("drops a key that belongs to a different event's set", () => {
    // tool_id is allowed for tool_used but not for auth_login.
    expect(sanitizeEventProperties("auth_login", { tool_id: "x", method: "oidc" })).toEqual({
      method: "oidc",
    });
  });
});
