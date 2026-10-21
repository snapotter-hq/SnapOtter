/**
 * Unit tests for audit event mapping and actor extraction logic in apps/api/src/lib/audit.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: { auditLog: {} },
}));

import {
  deriveTargetType,
  extractActorId,
  extractActorUsername,
} from "../../../apps/api/src/lib/audit.js";

describe("audit helpers", () => {
  describe("deriveTargetType", () => {
    it.each([
      ["LOGIN_SUCCESS", "user"],
      ["LOGIN_FAILED", "user"],
      ["LOGIN_THROTTLED", "user"],
      ["LOGOUT", "user"],
      ["PASSWORD_CHANGED", "user"],
      ["PASSWORD_RESET", "user"],
      ["USER_CREATED", "user"],
      ["USER_DELETED", "user"],
      ["USER_UPDATED", "user"],
      ["OIDC_LOGIN_SUCCESS", "user"],
      ["SAML_LOGIN_SUCCESS", "user"],
      ["SCIM_USER_CREATED", "user"],
      ["MFA_ENABLED", "user"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["FILE_UPLOADED", "file"],
      ["FILE_DELETED", "file"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["API_KEY_CREATED", "api_key"],
      ["API_KEY_DELETED", "api_key"],
      ["API_KEY_AUTH_FAILED", "api_key"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["ROLE_CREATED", "role"],
      ["ROLE_UPDATED", "role"],
      ["ROLE_DELETED", "role"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["SETTINGS_UPDATED", "setting"],
      ["IP_ALLOWLIST_UPDATED", "setting"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["TOOL_EXECUTED", "tool"],
      ["BATCH_STARTED", "tool"],
      ["PIPELINE_EXECUTED", "tool"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it("LEGAL_HOLD_CREATED -> compliance", () => {
      expect(deriveTargetType("LEGAL_HOLD_CREATED")).toBe("compliance");
    });

    it.each([
      ["SIEM_FORWARD_FAILED", "integration"],
      ["WEBHOOK_DELIVERED", "integration"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it("returns null for unmapped event prefixes", () => {
      expect(deriveTargetType("UNKNOWN_EVENT")).toBeNull();
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
      expect(extractActorId({ userId: "u-123", adminId: "a-456" })).toBe("u-123");
    });

    it("returns null when neither userId nor adminId is present", () => {
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
      expect(extractActorUsername({ username: "alice", newUsername: "bob" })).toBe("alice");
    });

    it('returns "system" when neither username nor newUsername is present', () => {
      expect(extractActorUsername({})).toBe("system");
    });
  });
});
