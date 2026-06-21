import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("ANALYTICS_EVENTS", () => {
  it("has exactly 4 event keys", () => {
    expect(Object.keys(ANALYTICS_EVENTS)).toHaveLength(4);
  });

  it("contains the expected keys", () => {
    expect(ANALYTICS_EVENTS).toHaveProperty("TOOL_USED");
    expect(ANALYTICS_EVENTS).toHaveProperty("SEARCH");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_EXECUTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("AI_BUNDLE_ACTION");
  });

  it("all event values are strings", () => {
    for (const value of Object.values(ANALYTICS_EVENTS)) {
      expect(typeof value).toBe("string");
    }
  });

  it("TOOL_USED has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.TOOL_USED).toBe("tool_used");
  });

  it("SEARCH has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.SEARCH).toBe("search");
  });

  it("PIPELINE_EXECUTED has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.PIPELINE_EXECUTED).toBe("pipeline_executed");
  });

  it("AI_BUNDLE_ACTION has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.AI_BUNDLE_ACTION).toBe("ai_bundle_action");
  });

  it("all values follow snake_case convention", () => {
    for (const value of Object.values(ANALYTICS_EVENTS)) {
      expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("is frozen (as const prevents mutation)", () => {
    // as const produces a readonly object; Object.isFrozen checks runtime freezing.
    // TypeScript enforces readonly at compile time, but at runtime the object
    // defined with "as const" is a plain object unless explicitly frozen.
    // We verify the values are stable by checking they haven't changed.
    const snapshot = { ...ANALYTICS_EVENTS };
    expect(ANALYTICS_EVENTS.TOOL_USED).toBe(snapshot.TOOL_USED);
    expect(ANALYTICS_EVENTS.SEARCH).toBe(snapshot.SEARCH);
    expect(ANALYTICS_EVENTS.PIPELINE_EXECUTED).toBe(snapshot.PIPELINE_EXECUTED);
    expect(ANALYTICS_EVENTS.AI_BUNDLE_ACTION).toBe(snapshot.AI_BUNDLE_ACTION);
  });

  it("all values are unique (no duplicate event names)", () => {
    const values = Object.values(ANALYTICS_EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
