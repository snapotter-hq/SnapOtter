/**
 * Unit tests for audit event mapping and actor extraction logic.
 *
 * Since deriveTargetType is not exported from audit.ts, we reproduce the
 * mapping logic here so we can verify every event type maps correctly.
 * Actor ID and username extraction logic is tested via the same rules
 * used in auditLog().
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Reproduce the private deriveTargetType logic so we can test its mapping
// ---------------------------------------------------------------------------
type AuditEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "USER_CREATED"
  | "USER_DELETED"
  | "USER_UPDATED"
  | "FILE_UPLOADED"
  | "FILE_DELETED"
  | "API_KEY_CREATED"
  | "API_KEY_DELETED"
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  | "SETTINGS_UPDATED";

function deriveTargetType(event: AuditEvent): string | null {
  if (
    event.startsWith("USER_") ||
    event.startsWith("LOGIN") ||
    event.startsWith("PASSWORD") ||
    event === "LOGOUT"
  )
    return "user";
  if (event.startsWith("API_KEY")) return "api_key";
  if (event.startsWith("FILE")) return "file";
  if (event.startsWith("ROLE")) return "role";
  if (event === "SETTINGS_UPDATED") return "setting";
  return null;
}

// ---------------------------------------------------------------------------
// Reproduce the actor extraction logic from auditLog()
// ---------------------------------------------------------------------------
function extractActorId(details: Record<string, unknown>): string | null {
  return (details.userId as string) ?? (details.adminId as string) ?? null;
}

function extractActorUsername(details: Record<string, unknown>): string {
  return (
    (details.username as string) ??
    (details.newUsername as string) ??
    "system"
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("audit helpers", () => {
  describe("deriveTargetType", () => {
    it.each<[AuditEvent, string]>([
      ["LOGIN_SUCCESS", "user"],
      ["LOGIN_FAILED", "user"],
      ["LOGOUT", "user"],
      ["PASSWORD_CHANGED", "user"],
      ["PASSWORD_RESET", "user"],
      ["USER_CREATED", "user"],
      ["USER_DELETED", "user"],
      ["USER_UPDATED", "user"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each<[AuditEvent, string]>([
      ["FILE_UPLOADED", "file"],
      ["FILE_DELETED", "file"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each<[AuditEvent, string]>([
      ["API_KEY_CREATED", "api_key"],
      ["API_KEY_DELETED", "api_key"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each<[AuditEvent, string]>([
      ["ROLE_CREATED", "role"],
      ["ROLE_UPDATED", "role"],
      ["ROLE_DELETED", "role"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it("SETTINGS_UPDATED -> setting", () => {
      expect(deriveTargetType("SETTINGS_UPDATED")).toBe("setting");
    });
  });

  describe("extractActorId", () => {
    it("returns userId when present", () => {
      expect(extractActorId({ userId: "u-123" })).toBe("u-123");
    });

    it("falls back to adminId when userId is absent", () => {
      expect(extractActorId({ adminId: "a-456" })).toBe("a-456");
    });

    it("prefers userId over adminId when both are present", () => {
      expect(extractActorId({ userId: "u-123", adminId: "a-456" })).toBe(
        "u-123",
      );
    });

    it("returns null when neither userId nor adminId is present", () => {
      expect(extractActorId({})).toBeNull();
    });

    it("returns null for an empty details object", () => {
      expect(extractActorId({})).toBeNull();
    });
  });

  describe("extractActorUsername", () => {
    it("returns username when present", () => {
      expect(extractActorUsername({ username: "alice" })).toBe("alice");
    });

    it("falls back to newUsername when username is absent", () => {
      expect(extractActorUsername({ newUsername: "bob" })).toBe("bob");
    });

    it("prefers username over newUsername when both are present", () => {
      expect(
        extractActorUsername({ username: "alice", newUsername: "bob" }),
      ).toBe("alice");
    });

    it('returns "system" when neither username nor newUsername is present', () => {
      expect(extractActorUsername({})).toBe("system");
    });

    it('returns "system" for an empty details object', () => {
      expect(extractActorUsername({})).toBe("system");
    });
  });
});
