import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "../../../apps/api/src/lib/analytics-allowlist.js";

// Mutation-focused coverage for analytics-allowlist.ts. This is the egress
// allow-list: only these exact keys per event may reach PostHog. The strategy
// per set is to feed EVERY allow-listed key plus a near-miss key and assert the
// output equals exactly the allow-listed keys. That pins every string literal in
// the sets (L5-L31): drop or rename any member and the near-miss/exact-match
// assertions break. isAllowedValue (L34-L40) is pinned per value shape.

// The full allow-list, mirrored here so a drift in the source set is caught.
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

// A primitive value each allowed key accepts (tool_ids must stay an array).
function sampleValue(key: string): unknown {
  if (key === "tool_ids") return ["resize", "crop"];
  if (key.endsWith("_count") || key.endsWith("_ms") || key.startsWith("bytes_")) return 1;
  if (key.startsWith("is_") || key === "gpu_present") return true;
  return "x";
}

describe("sanitizeEventProperties allow-list per event", () => {
  for (const [event, keys] of Object.entries(ALLOWED)) {
    it(`passes exactly the allow-listed keys for ${event} and drops a near-miss`, () => {
      const input: Record<string, unknown> = {};
      for (const key of keys) input[key] = sampleValue(key);
      // A near-miss that must NOT survive: real key with a typo suffix.
      input[`${keys[0]}_x`] = "leak";
      input.filename = "/uploads/secret.docx";

      const out = sanitizeEventProperties(event, input);

      const expected: Record<string, unknown> = {};
      for (const key of keys) expected[key] = sampleValue(key);
      expect(out).toEqual(expected);
      expect(out).not.toHaveProperty(`${keys[0]}_x`);
      expect(out).not.toHaveProperty("filename");
    });

    // Each individual key must be independently forwarded: kills a mutant that
    // deletes exactly one literal from the set.
    for (const key of keys) {
      it(`forwards ${event}.${key} on its own`, () => {
        const out = sanitizeEventProperties(event, { [key]: sampleValue(key) });
        expect(out).toEqual({ [key]: sampleValue(key) });
      });
    }
  }

  // Cross-event isolation: a key allowed for one event must be dropped for
  // another. Pins that the per-event sets are distinct, not a shared union.
  it("does not leak tool_used keys through auth_login", () => {
    const out = sanitizeEventProperties("auth_login", {
      method: "password",
      tool_id: "resize",
      bytes_in: 10,
    });
    expect(out).toEqual({ method: "password" });
  });

  it("does not leak the auth 'method' key through instance_started", () => {
    const out = sanitizeEventProperties("instance_started", { method: "password", arch: "arm64" });
    expect(out).toEqual({ arch: "arm64" });
  });

  it("returns an empty object for an unknown event (L47 guard)", () => {
    expect(sanitizeEventProperties("not_an_event", { arch: "arm64", method: "x" })).toEqual({});
  });
});

describe("isAllowedValue value shapes", () => {
  // L35: null is explicitly rejected even for an allow-listed key.
  it("drops a null value on an allow-listed key", () => {
    const out = sanitizeEventProperties("auth_login", { method: null });
    expect(out).toEqual({});
    expect(out).not.toHaveProperty("method");
  });

  // undefined is not a primitive we accept (typeof "undefined" fails L37) and is
  // not a string array (fails L39), so it is dropped.
  it("drops an undefined value on an allow-listed key", () => {
    const out = sanitizeEventProperties("auth_login", { method: undefined });
    expect(out).not.toHaveProperty("method");
  });

  // L37: string, number, boolean all pass. Assert each type survives.
  it("keeps string, number, and boolean primitives", () => {
    const out = sanitizeEventProperties("tool_used", {
      tool_id: "resize", // string
      duration_ms: 42, // number
      is_ai_tool: false, // boolean (false must survive, not be treated as falsy-drop)
    });
    expect(out).toEqual({ tool_id: "resize", duration_ms: 42, is_ai_tool: false });
  });

  it("keeps the numeric zero and false, not just truthy values", () => {
    const out = sanitizeEventProperties("tool_used", { bytes_in: 0, is_batch: false });
    expect(out).toEqual({ bytes_in: 0, is_batch: false });
  });

  // L39: arrays are allowed only when every element is a string.
  it("keeps tool_ids as an all-string array", () => {
    const out = sanitizeEventProperties("pipeline_executed", { tool_ids: ["a", "b"] });
    expect(out).toEqual({ tool_ids: ["a", "b"] });
  });

  it("keeps an empty array (vacuously all-string)", () => {
    const out = sanitizeEventProperties("pipeline_executed", { tool_ids: [] });
    expect(out).toEqual({ tool_ids: [] });
  });

  it("drops an array containing a non-string element", () => {
    const out = sanitizeEventProperties("pipeline_executed", {
      tool_ids: ["a", 2] as unknown as string[],
    });
    expect(out).not.toHaveProperty("tool_ids");
  });

  it("drops a plain object value on an allow-listed key", () => {
    const out = sanitizeEventProperties("ai_bundle_action", {
      bundle_id: "ocr",
      duration_ms: { nested: 1 } as unknown as number,
    });
    expect(out).toEqual({ bundle_id: "ocr" });
  });
});
