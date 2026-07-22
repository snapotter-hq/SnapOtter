import { describe, expect, it } from "vitest";
import { changedSettings, writableSettings } from "@/lib/settings-payload";

describe("writableSettings", () => {
  it("strips server-managed read-only keys that the PUT rejects", () => {
    expect(
      writableSettings({
        instance_id: "abc",
        cookie_secret: "shh",
        scim_token_hash: "hash",
        siem_config: "{}",
        webhook_destinations: "[]",
        ipAllowlist: "[]",
        audit_archival_state: "state",
        defaultTheme: "dark",
      }),
    ).toEqual({ defaultTheme: "dark" });
  });

  it("strips masked secret placeholders so a real secret is never overwritten by the mask", () => {
    expect(writableSettings({ oidc_client_secret: "********", fileUploadLimitMb: "100" })).toEqual({
      fileUploadLimitMb: "100",
    });
  });
});

describe("changedSettings", () => {
  it("returns only keys whose value differs from the original snapshot", () => {
    const original = { analyticsEnabled: "true", defaultTheme: "system" };
    const current = { analyticsEnabled: "true", defaultTheme: "dark" };
    expect(changedSettings(original, current)).toEqual({ defaultTheme: "dark" });
  });

  it("omits an unchanged analyticsEnabled so a stale save cannot revert an instance-wide opt-out", () => {
    const original = { analyticsEnabled: "true", fileUploadLimitMb: "100" };
    const current = { analyticsEnabled: "true", fileUploadLimitMb: "250" };
    expect("analyticsEnabled" in changedSettings(original, current)).toBe(false);
  });

  it("includes a key the user actually toggled", () => {
    expect(changedSettings({ analyticsEnabled: "true" }, { analyticsEnabled: "false" })).toEqual({
      analyticsEnabled: "false",
    });
  });

  it("includes keys added since the snapshot was taken", () => {
    expect(changedSettings({}, { defaultLocale: "fr" })).toEqual({ defaultLocale: "fr" });
  });
});
