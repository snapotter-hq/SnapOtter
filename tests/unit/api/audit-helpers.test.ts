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
  extractTargetId,
} from "../../../apps/api/src/lib/audit.js";
import { CORE_AUDIT_EVENTS } from "../../../packages/shared/src/audit-events.js";

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
      ["SCIM_USER_PROVISIONED", "user"],
      ["SCIM_USER_UPDATED", "user"],
      ["SCIM_USER_DEPROVISIONED", "user"],
      ["MFA_ENABLED", "user"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it("SCIM_GROUP_SYNCED -> team", () => {
      expect(deriveTargetType("SCIM_GROUP_SYNCED")).toBe("team");
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
      ["CONFIG_EXPORTED", "setting"],
      ["CONFIG_IMPORTED", "setting"],
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

    it.each([
      ["LEGAL_HOLD_CREATED", "compliance"],
      ["LEGAL_HOLD_APPLIED", "compliance"],
      ["LEGAL_HOLD_RELEASED", "compliance"],
      ["GDPR_EXPORT_INITIATED", "compliance"],
      ["GDPR_USER_PURGED", "compliance"],
      ["GDPR_TEAM_PURGED", "compliance"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it.each([
      ["SIEM_FORWARD_FAILED", "integration"],
      ["WEBHOOK_DELIVERED", "integration"],
    ])("%s -> %s", (event, expected) => {
      expect(deriveTargetType(event)).toBe(expected);
    });

    it("maps every event in CORE_AUDIT_EVENTS to a non-null targetType", () => {
      const unmapped = CORE_AUDIT_EVENTS.filter((event) => deriveTargetType(event) === null);
      expect(unmapped).toEqual([]);
    });

    it("returns null for unmapped event prefixes", () => {
      expect(deriveTargetType("UNKNOWN_EVENT")).toBeNull();
    });
  });

  describe("extractTargetId", () => {
    it.each([
      [{ targetUserId: "u-1" }, "u-1"],
      [{ newUserId: "nu-1" }, "nu-1"],
      [{ deletedUserId: "du-1" }, "du-1"],
      [{ keyId: "k-2" }, "k-2"],
      [{ roleId: "r-3" }, "r-3"],
      [{ targetTeamId: "tt-4" }, "tt-4"],
      [{ teamId: "t-5" }, "t-5"],
      [{ toolId: "resize" }, "resize"],
      [{ targetId: "lh-6" }, "lh-6"],
    ])("extracts %o -> %s", (details, expected) => {
      expect(extractTargetId(details)).toBe(expected);
    });

    it("follows precedence targetUserId > newUserId > deletedUserId > keyId > roleId > targetTeamId > teamId > toolId > targetId", () => {
      expect(
        extractTargetId({
          targetUserId: "u-1",
          newUserId: "nu-1",
          deletedUserId: "du-1",
          keyId: "k-2",
          roleId: "r-3",
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("u-1");
      expect(
        extractTargetId({
          newUserId: "nu-1",
          deletedUserId: "du-1",
          keyId: "k-2",
          roleId: "r-3",
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("nu-1");
      expect(
        extractTargetId({
          deletedUserId: "du-1",
          keyId: "k-2",
          roleId: "r-3",
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("du-1");
      expect(
        extractTargetId({
          keyId: "k-2",
          roleId: "r-3",
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("k-2");
      expect(
        extractTargetId({
          roleId: "r-3",
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("r-3");
      expect(
        extractTargetId({
          targetTeamId: "tt-4",
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("tt-4");
      expect(
        extractTargetId({
          teamId: "t-5",
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("t-5");
      expect(
        extractTargetId({
          toolId: "resize",
          targetId: "lh-6",
        }),
      ).toBe("resize");
    });

    it("returns null when no target identifier is present", () => {
      expect(extractTargetId({})).toBeNull();
      expect(extractTargetId({ userId: "actor-1", adminId: "admin-1" })).toBeNull();
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
