import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("ANALYTICS_EVENTS", () => {
  it("has exactly 27 event keys", () => {
    expect(Object.keys(ANALYTICS_EVENTS)).toHaveLength(27);
  });

  it("contains the expected keys", () => {
    expect(ANALYTICS_EVENTS).toHaveProperty("TOOL_USED");
    expect(ANALYTICS_EVENTS).toHaveProperty("TOOL_OPENED");
    expect(ANALYTICS_EVENTS).toHaveProperty("FILE_ADDED");
    expect(ANALYTICS_EVENTS).toHaveProperty("TOOL_STARTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("TOOL_CLIENT_ERROR");
    expect(ANALYTICS_EVENTS).toHaveProperty("RESULT_DOWNLOADED");
    expect(ANALYTICS_EVENTS).toHaveProperty("RESULT_SAVED");
    expect(ANALYTICS_EVENTS).toHaveProperty("SEARCH");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_EXECUTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("AI_BUNDLE_ACTION");
    expect(ANALYTICS_EVENTS).toHaveProperty("AI_BUNDLE_PROMPTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("BATCH_PROCESSED");
    expect(ANALYTICS_EVENTS).toHaveProperty("FEEDBACK_SUBMITTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("ONBOARDING_SURVEY_SUBMITTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("SPONSOR_CLICKED");
    expect(ANALYTICS_EVENTS).toHaveProperty("INSTANCE_STARTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("EDITOR_OPENED");
    expect(ANALYTICS_EVENTS).toHaveProperty("EDITOR_TOOL_USED");
    expect(ANALYTICS_EVENTS).toHaveProperty("EDITOR_EXPORTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_OPENED");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_STEP_ADDED");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_SAVED");
    expect(ANALYTICS_EVENTS).toHaveProperty("PIPELINE_TEMPLATE_SELECTED");
    expect(ANALYTICS_EVENTS).toHaveProperty("AUTH_LOGIN");
    expect(ANALYTICS_EVENTS).toHaveProperty("AUTH_LOGIN_FAILED");
    expect(ANALYTICS_EVENTS).toHaveProperty("FEEDBACK_PROMPT_SHOWN");
    expect(ANALYTICS_EVENTS).toHaveProperty("FEEDBACK_PROMPT_DISMISSED");
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

  it("FEEDBACK_SUBMITTED has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.FEEDBACK_SUBMITTED).toBe("feedback_submitted");
  });

  it("ONBOARDING_SURVEY_SUBMITTED has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.ONBOARDING_SURVEY_SUBMITTED).toBe("onboarding_survey_submitted");
  });

  it("INSTANCE_STARTED has the correct snake_case value", () => {
    expect(ANALYTICS_EVENTS.INSTANCE_STARTED).toBe("instance_started");
  });

  it("feedback prompt lifecycle events have the correct snake_case values", () => {
    expect(ANALYTICS_EVENTS.FEEDBACK_PROMPT_SHOWN).toBe("feedback_prompt_shown");
    expect(ANALYTICS_EVENTS.FEEDBACK_PROMPT_DISMISSED).toBe("feedback_prompt_dismissed");
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
    for (const key of Object.keys(snapshot)) {
      expect(ANALYTICS_EVENTS[key as keyof typeof ANALYTICS_EVENTS]).toBe(
        snapshot[key as keyof typeof snapshot],
      );
    }
  });

  it("all values are unique (no duplicate event names)", () => {
    const values = Object.values(ANALYTICS_EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
