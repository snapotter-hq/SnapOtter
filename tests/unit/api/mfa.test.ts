import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";
import {
  createTotp,
  hashRecoveryCodes,
  isMfaRequiredForUser,
  resolveExternalLoginMfaOutcome,
  verifyRecoveryCode,
  verifyTotpCode,
} from "../../../apps/api/src/plugins/mfa.js";

describe("MFA", () => {
  describe("createTotp", () => {
    it("generates a valid TOTP URI", () => {
      const totp = createTotp("testuser");
      const uri = totp.toString();
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("SnapOtter");
      expect(uri).toContain("testuser");
      expect(uri).toContain("algorithm=SHA1");
      expect(uri).toContain("digits=6");
      expect(uri).toContain("period=30");
    });

    it("generates a TOTP with a valid secret", () => {
      const totp = createTotp("testuser");
      expect(totp.secret.base32).toMatch(/^[A-Z2-7]+=*$/);
      // 20-byte secret = 32 base32 chars
      expect(totp.secret.base32.length).toBe(32);
    });

    it("uses a provided secret when given", () => {
      const knownSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const totp = createTotp("testuser", knownSecret);
      expect(totp.secret.base32).toBe(knownSecret);
    });

    it("generates unique secrets across calls", () => {
      const a = createTotp("user1");
      const b = createTotp("user2");
      expect(a.secret.base32).not.toBe(b.secret.base32);
    });
  });

  describe("verifyTotpCode", () => {
    it("verifies a correct TOTP code", () => {
      const totp = createTotp("testuser");
      const secret = totp.secret.base32;
      const code = totp.generate();
      expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it("rejects an incorrect TOTP code", () => {
      const totp = createTotp("testuser");
      const secret = totp.secret.base32;
      expect(verifyTotpCode(secret, "000000")).toBe(false);
    });

    it("rejects an empty code", () => {
      const totp = createTotp("testuser");
      const secret = totp.secret.base32;
      expect(verifyTotpCode(secret, "")).toBe(false);
    });

    it("rejects a code from a different secret", () => {
      const totp1 = createTotp("user1");
      const totp2 = createTotp("user2");
      const code = totp1.generate();
      expect(verifyTotpCode(totp2.secret.base32, code)).toBe(false);
    });

    it("accepts codes within the 1-step window", () => {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "SnapOtter",
        label: "test",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });

      // Generate code for the current period
      const code = totp.generate();
      expect(verifyTotpCode(secret.base32, code)).toBe(true);
    });
  });

  describe("hashRecoveryCodes", () => {
    it("hashes recovery codes into comma-separated SHA-256 hashes", () => {
      const codes = ["abcd1234", "efgh5678"];
      const result = hashRecoveryCodes(codes);
      const parts = result.split(",");
      expect(parts).toHaveLength(2);
      // Each hash should be 64 hex chars (256 bits)
      for (const hash of parts) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("produces deterministic hashes", () => {
      const codes = ["code1", "code2", "code3"];
      const a = hashRecoveryCodes(codes);
      const b = hashRecoveryCodes(codes);
      expect(a).toBe(b);
    });

    it("handles a single code", () => {
      const result = hashRecoveryCodes(["onlycode"]);
      expect(result).not.toContain(",");
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("verifyRecoveryCode", () => {
    it("verifies a valid recovery code", () => {
      const codes = ["aaaa1111", "bbbb2222", "cccc3333"];
      const hashList = hashRecoveryCodes(codes);
      const result = verifyRecoveryCode("bbbb2222", hashList);
      expect(result.valid).toBe(true);
    });

    it("rejects an invalid recovery code", () => {
      const codes = ["aaaa1111", "bbbb2222"];
      const hashList = hashRecoveryCodes(codes);
      const result = verifyRecoveryCode("invalid0", hashList);
      expect(result.valid).toBe(false);
      expect(result.remaining).toBe(hashList);
    });

    it("consumes a recovery code on use", () => {
      const codes = ["aaaa1111", "bbbb2222", "cccc3333"];
      const hashList = hashRecoveryCodes(codes);
      const result = verifyRecoveryCode("bbbb2222", hashList);
      expect(result.valid).toBe(true);
      // Remaining should have 2 hashes
      const remaining = result.remaining.split(",");
      expect(remaining).toHaveLength(2);
      // The used code should no longer verify
      const secondTry = verifyRecoveryCode("bbbb2222", result.remaining);
      expect(secondTry.valid).toBe(false);
    });

    it("returns empty remaining when last code is used", () => {
      const codes = ["onlycode"];
      const hashList = hashRecoveryCodes(codes);
      const result = verifyRecoveryCode("onlycode", hashList);
      expect(result.valid).toBe(true);
      expect(result.remaining).toBe("");
    });

    it("preserves other codes when one is consumed", () => {
      const codes = ["first000", "second00", "third000"];
      const hashList = hashRecoveryCodes(codes);

      // Use the first code
      const r1 = verifyRecoveryCode("first000", hashList);
      expect(r1.valid).toBe(true);

      // Second and third should still work
      const r2 = verifyRecoveryCode("second00", r1.remaining);
      expect(r2.valid).toBe(true);

      const r3 = verifyRecoveryCode("third000", r2.remaining);
      expect(r3.valid).toBe(true);
      expect(r3.remaining).toBe("");
    });
  });

  describe("isMfaRequiredForUser", () => {
    it("returns false for optional policy", () => {
      expect(isMfaRequiredForUser("optional", "admin")).toBe(false);
      expect(isMfaRequiredForUser("optional", "editor")).toBe(false);
      expect(isMfaRequiredForUser("optional", "user")).toBe(false);
    });

    it("returns true for required policy regardless of role", () => {
      expect(isMfaRequiredForUser("required", "admin")).toBe(true);
      expect(isMfaRequiredForUser("required", "editor")).toBe(true);
      expect(isMfaRequiredForUser("required", "user")).toBe(true);
    });

    it("returns true for admins_only policy when role is admin", () => {
      expect(isMfaRequiredForUser("admins_only", "admin")).toBe(true);
    });

    it("returns false for admins_only policy when role is not admin", () => {
      expect(isMfaRequiredForUser("admins_only", "editor")).toBe(false);
      expect(isMfaRequiredForUser("admins_only", "user")).toBe(false);
    });
  });

  describe("resolveExternalLoginMfaOutcome", () => {
    // Exhaustive over the full input space: 3 policies x 2 roles x 2
    // totpEnabled states. Role only matters via isMfaRequiredForUser, which
    // branches solely on role === "admin", so {admin, user} covers it.
    it.each([
      ["optional", "user", false, "proceed"],
      ["optional", "user", true, "challenge"],
      ["optional", "admin", false, "proceed"],
      ["optional", "admin", true, "challenge"],
      ["admins_only", "user", false, "proceed"],
      ["admins_only", "user", true, "challenge"],
      ["admins_only", "admin", false, "enrollment_required"],
      ["admins_only", "admin", true, "challenge"],
      // required+user+enrolled is the exact shape of the #533 bug: an
      // enrolled non-admin user under a required policy must be challenged,
      // not hard-blocked.
      ["required", "user", false, "enrollment_required"],
      ["required", "user", true, "challenge"],
      ["required", "admin", false, "enrollment_required"],
      ["required", "admin", true, "challenge"],
    ] as const)("policy=%s role=%s totpEnabled=%s -> %s", (policy, role, totpEnabled, expected) => {
      expect(resolveExternalLoginMfaOutcome(policy, role, totpEnabled)).toBe(expected);
    });

    it("enrollment takes priority: an enrolled user is challenged even under a required policy", () => {
      expect(resolveExternalLoginMfaOutcome("required", "admin", true)).not.toBe(
        "enrollment_required",
      );
    });
  });
});
