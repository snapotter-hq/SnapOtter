/**
 * Mutation-focused unit tests for apps/api/src/lib/settings-policy.ts.
 *
 * The existing settings-policy.test.ts covers the basics. This file pins the
 * survived / no-coverage mutants:
 *   - validateSettingsRuntimeConstraints: the MFA license gate (admins_only /
 *     required only), the SSO-enforcement gate (value === "true" AND neither
 *     OIDC nor SAML configured), and the exact statusCode / code it returns.
 *   - prepareSetting: the no-schema branch (storageKey remap + JSON.stringify of
 *     non-strings), the storageKey remap on the schema branch, and the
 *     UNKNOWN_SETTING / VALIDATION_ERROR discriminators.
 *   - isConfigExportableSetting: each clause of the compound predicate
 *     (write !== "none", !redacted, storageKey === key).
 *   - the Zod builder refinements reached only through prepareSetting: integer
 *     min/max boundaries, finite-number exclusive lower bound, ISO-timestamp
 *     normalization, disabledTools JSON round-trip, and boolean coercion.
 *
 * Container-free: enterprise and config are mocked; the policy registry and Zod
 * schemas are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mfaLicensed: false,
  enterpriseThrows: false,
  oidcEnabled: false,
  samlEnabled: false,
}));

vi.mock("@snapotter/enterprise", () => ({
  isFeatureEnabled: (feature: string) => {
    if (state.enterpriseThrows) throw new Error("enterprise unavailable");
    return feature === "mfa" ? state.mfaLicensed : false;
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    get OIDC_ENABLED() {
      return state.oidcEnabled;
    },
    get SAML_ENABLED() {
      return state.samlEnabled;
    },
  },
}));

import {
  getSettingPolicy,
  isConfigExportableSetting,
  prepareSetting,
  validateSettingsRuntimeConstraints,
} from "../../../apps/api/src/lib/settings-policy.js";

beforeEach(() => {
  state.mfaLicensed = false;
  state.enterpriseThrows = false;
  state.oidcEnabled = false;
  state.samlEnabled = false;
});

// ── prepareSetting: discriminators + storageKey remap + no-schema path ────

describe("prepareSetting", () => {
  it("rejects an unregistered key with UNKNOWN_SETTING", () => {
    const result = prepareSetting("no_such_key", "x");
    expect(result).toMatchObject({ success: false, code: "UNKNOWN_SETTING" });
    if (!result.success) expect(result.error).toContain("no_such_key");
  });

  it("rejects an invalid value with VALIDATION_ERROR and carries Zod issues", () => {
    const result = prepareSetting("defaultTheme", "neon");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(result.details)).toBe(true);
      expect(result.details?.length).toBeGreaterThan(0);
    }
  });

  it("remaps to the policy storageKey on success (passwordRequireNumber -> passwordRequireDigit)", () => {
    const result = prepareSetting("passwordRequireNumber", "true");
    expect(result).toMatchObject({ success: true, key: "passwordRequireDigit", value: "true" });
  });

  it("keeps the original key when the policy has no storageKey", () => {
    const result = prepareSetting("defaultTheme", "dark");
    expect(result).toMatchObject({ success: true, key: "defaultTheme", value: "dark" });
  });

  it("passes a string through unchanged on the no-schema (readonly-writable) path", () => {
    // 'sqlite_import' has no schema; it also has write:"none", but prepareSetting
    // does not enforce write here - it serializes. A string stays as-is.
    const result = prepareSetting("sqlite_import", "hello");
    expect(result).toMatchObject({ success: true, value: "hello" });
  });

  it("JSON-stringifies a non-string value on the no-schema path", () => {
    const result = prepareSetting("sqlite_import", { a: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('{"a":1}');
  });
});

// ── Zod builder refinements via prepareSetting ────────────────────────────

describe("prepareSetting Zod refinements", () => {
  it("accepts an integer exactly at the minimum (loginAttemptLimit min is 1)", () => {
    expect(prepareSetting("loginAttemptLimit", "1")).toMatchObject({ success: true, value: "1" });
  });

  it("rejects an integer one below the minimum (0 < 1)", () => {
    expect(prepareSetting("loginAttemptLimit", "0")).toMatchObject({ success: false });
  });

  it("accepts passwordMinLength at its lower and upper bounds (8 and 128)", () => {
    expect(prepareSetting("passwordMinLength", "8")).toMatchObject({ success: true, value: "8" });
    expect(prepareSetting("passwordMinLength", "128")).toMatchObject({
      success: true,
      value: "128",
    });
  });

  it("rejects passwordMinLength just outside each bound (7 and 129)", () => {
    expect(prepareSetting("passwordMinLength", "7")).toMatchObject({ success: false });
    expect(prepareSetting("passwordMinLength", "129")).toMatchObject({ success: false });
  });

  it("rejects a non-integer for an integer setting", () => {
    expect(prepareSetting("jobsRetentionDays", "3.5")).toMatchObject({ success: false });
  });

  it("coerces a numeric input for an integer setting to its string form", () => {
    expect(prepareSetting("jobsRetentionDays", 30)).toMatchObject({ success: true, value: "30" });
  });

  it("rejects a finite-number setting at exactly the exclusive lower bound (0)", () => {
    // finiteNumberSetting(0) requires value > 0, so 0 must fail.
    expect(prepareSetting("fileUploadLimitMb", "0")).toMatchObject({ success: false });
  });

  it("accepts a finite-number setting just above the exclusive bound", () => {
    expect(prepareSetting("fileUploadLimitMb", "0.1")).toMatchObject({
      success: true,
      value: "0.1",
    });
  });

  it("rejects a non-finite finite-number setting", () => {
    expect(prepareSetting("fileUploadLimitMb", "Infinity")).toMatchObject({ success: false });
  });

  it("coerces boolean true/false to their string forms", () => {
    expect(prepareSetting("analyticsEnabled", true)).toMatchObject({
      success: true,
      value: "true",
    });
    expect(prepareSetting("analyticsEnabled", false)).toMatchObject({
      success: true,
      value: "false",
    });
  });

  it("accepts the string boolean forms and rejects other strings", () => {
    expect(prepareSetting("analyticsEnabled", "true")).toMatchObject({ success: true });
    expect(prepareSetting("analyticsEnabled", "yes")).toMatchObject({ success: false });
  });

  it("normalizes a timestamp setting to an ISO-8601 string", () => {
    const result = prepareSetting("feedback.install.submittedAt", "2026-01-02T03:04:05.000Z");
    expect(result).toMatchObject({
      success: true,
      value: "2026-01-02T03:04:05.000Z",
    });
  });

  it("rejects an unparseable timestamp", () => {
    expect(prepareSetting("feedback.install.submittedAt", "not-a-date")).toMatchObject({
      success: false,
    });
  });

  it("round-trips disabledTools through JSON (array in -> stringified array out)", () => {
    const result = prepareSetting("disabledTools", ["a", "b"]);
    expect(result).toMatchObject({ success: true, value: '["a","b"]' });
  });

  it("parses a JSON-string disabledTools value and re-serializes it", () => {
    const result = prepareSetting("disabledTools", '["x","y"]');
    expect(result).toMatchObject({ success: true, value: '["x","y"]' });
  });

  it("rejects a non-JSON disabledTools string", () => {
    expect(prepareSetting("disabledTools", "just-a-string")).toMatchObject({ success: false });
  });

  it("accepts an empty break-glass username and a valid one, rejects an invalid one", () => {
    expect(prepareSetting("ssoBreakGlassUsername", "")).toMatchObject({ success: true, value: "" });
    expect(prepareSetting("ssoBreakGlassUsername", "break.glass_1")).toMatchObject({
      success: true,
    });
    expect(prepareSetting("ssoBreakGlassUsername", "has spaces")).toMatchObject({ success: false });
  });

  it("accepts a supported locale and rejects an unsupported one", () => {
    expect(prepareSetting("defaultLocale", "en")).toMatchObject({ success: true, value: "en" });
    expect(prepareSetting("defaultLocale", "zz")).toMatchObject({ success: false });
  });

  it("enforces the mfaPolicy enum", () => {
    expect(prepareSetting("mfaPolicy", "required")).toMatchObject({ success: true });
    expect(prepareSetting("mfaPolicy", "sometimes")).toMatchObject({ success: false });
  });
});

// ── isConfigExportableSetting: each clause of the predicate ───────────────

describe("isConfigExportableSetting", () => {
  it("is true for a plain writable non-redacted key whose storageKey matches", () => {
    expect(isConfigExportableSetting("defaultTheme")).toBe(true);
    expect(isConfigExportableSetting("loginAttemptLimit")).toBe(true);
  });

  it("is false for an unknown key", () => {
    expect(isConfigExportableSetting("totally_unknown")).toBe(false);
  });

  it("is false when write is 'none' (readonly keys)", () => {
    expect(isConfigExportableSetting("instance_id")).toBe(false);
    expect(isConfigExportableSetting("ipAllowlist")).toBe(false);
  });

  it("is false for redacted full-admin secrets", () => {
    expect(isConfigExportableSetting("oidc_client_secret")).toBe(false);
    expect(isConfigExportableSetting("siem_webhook_auth")).toBe(false);
  });

  it("is false when the policy remaps to a different storageKey", () => {
    // passwordRequireNumber -> storageKey passwordRequireDigit, so key !== storageKey.
    expect(isConfigExportableSetting("passwordRequireNumber")).toBe(false);
  });

  it("is true for the canonical key that owns its storageKey", () => {
    expect(isConfigExportableSetting("passwordRequireDigit")).toBe(true);
  });
});

// ── validateSettingsRuntimeConstraints: MFA + SSO gates ───────────────────

describe("validateSettingsRuntimeConstraints: MFA licensing", () => {
  it("blocks mfaPolicy=required with 403 FEATURE_NOT_LICENSED when MFA is unlicensed", async () => {
    state.mfaLicensed = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "mfaPolicy", value: "required" },
    ]);
    expect(result).toMatchObject({
      success: false,
      statusCode: 403,
      code: "FEATURE_NOT_LICENSED",
    });
  });

  it("blocks mfaPolicy=admins_only when unlicensed", async () => {
    state.mfaLicensed = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "mfaPolicy", value: "admins_only" },
    ]);
    expect(result).toMatchObject({ success: false, statusCode: 403 });
  });

  it("allows an enforcing mfaPolicy when MFA is licensed", async () => {
    state.mfaLicensed = true;
    const result = await validateSettingsRuntimeConstraints([
      { key: "mfaPolicy", value: "required" },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("does not gate mfaPolicy=optional (not an enforcing value)", async () => {
    state.mfaLicensed = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "mfaPolicy", value: "optional" },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("treats enterprise import failure as unlicensed and blocks", async () => {
    state.enterpriseThrows = true;
    const result = await validateSettingsRuntimeConstraints([
      { key: "mfaPolicy", value: "required" },
    ]);
    expect(result).toMatchObject({ success: false, code: "FEATURE_NOT_LICENSED" });
  });
});

describe("validateSettingsRuntimeConstraints: SSO enforcement", () => {
  it("blocks ssoEnforcement=true with 400 DEPENDENCY_VALIDATION_FAILED when no provider is configured", async () => {
    state.oidcEnabled = false;
    state.samlEnabled = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "ssoEnforcement", value: "true" },
    ]);
    expect(result).toMatchObject({
      success: false,
      statusCode: 400,
      code: "DEPENDENCY_VALIDATION_FAILED",
    });
    if (!result.success) {
      expect(result.validationErrors?.[0]).toContain("ssoEnforcement");
    }
  });

  it("allows ssoEnforcement=true when OIDC is configured", async () => {
    state.oidcEnabled = true;
    state.samlEnabled = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "ssoEnforcement", value: "true" },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("allows ssoEnforcement=true when only SAML is configured", async () => {
    state.oidcEnabled = false;
    state.samlEnabled = true;
    const result = await validateSettingsRuntimeConstraints([
      { key: "ssoEnforcement", value: "true" },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("does not gate ssoEnforcement when the value is not exactly 'true'", async () => {
    state.oidcEnabled = false;
    state.samlEnabled = false;
    const result = await validateSettingsRuntimeConstraints([
      { key: "ssoEnforcement", value: "false" },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("returns success for an empty settings batch", async () => {
    const result = await validateSettingsRuntimeConstraints([]);
    expect(result).toEqual({ success: true });
  });
});

// ── policy registry sanity (authority separation is behavior, not incidental) ─

describe("getSettingPolicy authority separation", () => {
  it("maps each tier to its distinct write authority", () => {
    expect(getSettingPolicy("defaultTheme")?.write).toBe("settings:write");
    expect(getSettingPolicy("loginAttemptLimit")?.write).toBe("security:manage");
    expect(getSettingPolicy("auditRetentionDays")?.write).toBe("compliance:manage");
    expect(getSettingPolicy("oidc_client_secret")?.write).toBe("full-admin");
    expect(getSettingPolicy("instance_id")?.write).toBe("none");
  });

  it("marks full-admin secrets as encrypted and redacted", () => {
    const policy = getSettingPolicy("saml_idp_certificate");
    expect(policy?.encrypted).toBe(true);
    expect(policy?.redacted).toBe(true);
  });

  it("returns undefined for an unregistered key", () => {
    expect(getSettingPolicy("nope")).toBeUndefined();
  });
});
