import { describe, expect, it } from "vitest";
import {
  getSettingPolicy,
  isConfigExportableSetting,
  prepareSetting,
} from "../../../apps/api/src/lib/settings-policy.js";

describe("settings policy registry", () => {
  it.each([
    { key: "defaultTheme", input: "dark", expected: "dark" },
    { key: "defaultLocale", input: "en", expected: "en" },
    { key: "tempFileMaxAgeHours", input: "1.5", expected: "1.5" },
    { key: "startupCleanup", input: true, expected: "true" },
    { key: "jobsRetentionDays", input: 30, expected: "30" },
    {
      key: "disabledTools",
      input: ["compress-image", "resize-image"],
      expected: '["compress-image","resize-image"]',
    },
  ])("normalizes valid $key values", ({ key, input, expected }) => {
    const result = prepareSetting(key, input);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(expected);
  });

  it.each([
    { key: "defaultTheme", input: "midnight" },
    { key: "defaultLocale", input: "xx-invalid" },
    { key: "loginAttemptLimit", input: "0" },
    { key: "passwordMinLength", input: "7" },
    { key: "disabledTools", input: "not-json" },
    { key: "ssoBreakGlassUsername", input: "invalid username" },
  ])("rejects invalid $key values", ({ key, input }) => {
    const result = prepareSetting(key, input);

    expect(result).toMatchObject({ success: false, code: "VALIDATION_ERROR" });
  });

  it("normalizes the legacy password-number key to the runtime digit key", () => {
    const result = prepareSetting("passwordRequireNumber", "false");

    expect(result).toMatchObject({
      success: true,
      key: "passwordRequireDigit",
      value: "false",
    });
  });

  it("exports canonical non-secret keys only", () => {
    expect(isConfigExportableSetting("passwordRequireDigit")).toBe(true);
    expect(isConfigExportableSetting("passwordRequireNumber")).toBe(false);
    expect(isConfigExportableSetting("siem_webhook_auth")).toBe(false);
    expect(isConfigExportableSetting("scim_token_hash")).toBe(false);
  });

  it("fails closed for unregistered keys", () => {
    expect(prepareSetting("future_security_credential", "value")).toMatchObject({
      success: false,
      code: "UNKNOWN_SETTING",
    });
  });

  it("keeps dedicated credentials and server state read-only", () => {
    for (const key of [
      "scim_token_hash",
      "siem_config",
      "webhook_destinations",
      "ipAllowlist",
      "audit_archival_state",
      "backup_last_completed",
    ]) {
      expect(getSettingPolicy(key)?.write).toBe("none");
    }
  });

  it("separates general, security, compliance, and full-admin authority", () => {
    expect(getSettingPolicy("defaultTheme")?.write).toBe("settings:write");
    expect(getSettingPolicy("loginAttemptLimit")?.write).toBe("security:manage");
    expect(getSettingPolicy("auditRetentionDays")?.write).toBe("compliance:manage");
    expect(getSettingPolicy("oidc_client_secret")?.write).toBe("full-admin");
  });
});
