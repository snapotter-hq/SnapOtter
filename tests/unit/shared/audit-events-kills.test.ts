import { describe, expect, it } from "vitest";
import {
  ALL_AUDIT_EVENTS,
  registerAuditEvents,
} from "../../../packages/shared/src/audit-events.js";

// registerAuditEvents appends only events not already present. Pins the
// `!includes` dedup guard, the push, and the loop.
describe("registerAuditEvents", () => {
  it("appends a genuinely new event", () => {
    const novel = "CUSTOM_EVENT_ONE";
    expect(ALL_AUDIT_EVENTS).not.toContain(novel);
    registerAuditEvents([novel]);
    expect(ALL_AUDIT_EVENTS).toContain(novel);
  });

  it("does not duplicate an already-registered core event (kills the !includes guard)", () => {
    const before = ALL_AUDIT_EVENTS.filter((e) => e === "LOGIN_SUCCESS").length;
    registerAuditEvents(["LOGIN_SUCCESS"]);
    const after = ALL_AUDIT_EVENTS.filter((e) => e === "LOGIN_SUCCESS").length;
    expect(before).toBe(1);
    expect(after).toBe(1);
  });

  it("adds only the new entries from a mixed list, iterating every element", () => {
    registerAuditEvents(["LOGOUT", "CUSTOM_EVENT_TWO"]);
    expect(ALL_AUDIT_EVENTS.filter((e) => e === "LOGOUT").length).toBe(1);
    expect(ALL_AUDIT_EVENTS).toContain("CUSTOM_EVENT_TWO");
  });

  it("an empty list is a no-op", () => {
    const len = ALL_AUDIT_EVENTS.length;
    registerAuditEvents([]);
    expect(ALL_AUDIT_EVENTS.length).toBe(len);
  });
});
