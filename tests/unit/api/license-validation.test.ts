import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTERPRISE_FEATURES,
  PLAN_FEATURES,
  validateLicense,
} from "../../../packages/enterprise/src/license.js";

describe("validateLicense", () => {
  it("returns null for undefined input", () => {
    expect(validateLicense(undefined as unknown as string)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateLicense("")).toBeNull();
  });

  it("returns null for input without a dot separator", () => {
    expect(validateLicense("nodothere")).toBeNull();
  });

  it("returns null when dot is at position 0", () => {
    expect(validateLicense(".signature")).toBeNull();
  });

  it("returns null for invalid base64url payload", () => {
    expect(validateLicense("!!!invalid-base64.AAAA")).toBeNull();
  });

  it("returns null for valid base64url that is not JSON", () => {
    const notJson = Buffer.from("not json at all").toString("base64url");
    const fakeSig = Buffer.from("fakesig").toString("base64url");
    expect(validateLicense(`${notJson}.${fakeSig}`)).toBeNull();
  });

  it("returns null for valid JSON payload with wrong signature", () => {
    const payload = Buffer.from(
      JSON.stringify({
        org: "test",
        plan: "team",
        features: ["s3_storage"],
        seats: 5,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        issuedAt: new Date().toISOString(),
      }),
    ).toString("base64url");
    const wrongSig = Buffer.from("this-is-not-a-valid-signature").toString("base64url");
    expect(validateLicense(`${payload}.${wrongSig}`)).toBeNull();
  });

  it("returns null for payload with multiple dots", () => {
    const payload = Buffer.from(JSON.stringify({ org: "test" })).toString("base64url");
    const sig = Buffer.from("sig").toString("base64url");
    expect(validateLicense(`${payload}.${sig}.extra`)).toBeNull();
  });
});

describe("initEnterprise", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns valid:false and license:null when called with undefined", async () => {
    const { initEnterprise } = await import("../../../packages/enterprise/src/index.js");
    const result = initEnterprise(undefined);
    expect(result).toEqual({ valid: false, license: null });
  });

  it("returns valid:false and license:null when called with empty string", async () => {
    const { initEnterprise } = await import("../../../packages/enterprise/src/index.js");
    const result = initEnterprise("");
    expect(result).toEqual({ valid: false, license: null });
  });

  it("returns valid:false and license:null when called with an invalid key", async () => {
    const { initEnterprise } = await import("../../../packages/enterprise/src/index.js");
    const result = initEnterprise("bad-key-no-dot");
    expect(result).toEqual({ valid: false, license: null });
  });

  it("returns valid:false for a key with wrong signature", async () => {
    const { initEnterprise } = await import("../../../packages/enterprise/src/index.js");
    const payload = Buffer.from(
      JSON.stringify({
        org: "test",
        plan: "team",
        features: [],
        seats: 1,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        issuedAt: new Date().toISOString(),
      }),
    ).toString("base64url");
    const result = initEnterprise(`${payload}.badsig`);
    expect(result).toEqual({ valid: false, license: null });
  });

  it("sets activeLicense to null for invalid keys", async () => {
    const { initEnterprise, getActiveLicense } = await import(
      "../../../packages/enterprise/src/index.js"
    );
    initEnterprise("garbage.data");
    expect(getActiveLicense()).toBeNull();
  });
});

describe("isFeatureEnabled (via mock)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false when no license is active", async () => {
    const { mockNoEnterprise } = await import("../../helpers/enterprise-mock.js");
    mockNoEnterprise();
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    expect(isFeatureEnabled("saml_sso")).toBe(false);
    expect(isFeatureEnabled("s3_storage")).toBe(false);
  });

  it("returns true for features in the active license", async () => {
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["saml_sso", "s3_storage", "mfa"]);
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    expect(isFeatureEnabled("saml_sso")).toBe(true);
    expect(isFeatureEnabled("s3_storage")).toBe(true);
    expect(isFeatureEnabled("mfa")).toBe(true);
  });

  it("returns false for features NOT in the active license", async () => {
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["saml_sso"]);
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    expect(isFeatureEnabled("scim")).toBe(false);
    expect(isFeatureEnabled("mfa")).toBe(false);
    expect(isFeatureEnabled("webhooks")).toBe(false);
  });

  it("returns correct results when switching from active to no license", async () => {
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["audit_export"]);
    const mod1 = await import("@snapotter/enterprise");
    expect(mod1.isFeatureEnabled("audit_export")).toBe(true);

    vi.resetModules();
    const { mockNoEnterprise } = await import("../../helpers/enterprise-mock.js");
    mockNoEnterprise();
    const mod2 = await import("@snapotter/enterprise");
    expect(mod2.isFeatureEnabled("audit_export")).toBe(false);
  });
});

describe("isFeatureEnabled (direct, no mock)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false for all features when initEnterprise was not called", async () => {
    const { isFeatureEnabled } = await import("../../../packages/enterprise/src/index.js");
    for (const feature of ENTERPRISE_FEATURES) {
      expect(isFeatureEnabled(feature)).toBe(false);
    }
  });

  it("returns false for all features after initEnterprise with undefined", async () => {
    const { initEnterprise, isFeatureEnabled } = await import(
      "../../../packages/enterprise/src/index.js"
    );
    initEnterprise(undefined);
    for (const feature of ENTERPRISE_FEATURES) {
      expect(isFeatureEnabled(feature)).toBe(false);
    }
  });

  it("returns false for all features after initEnterprise with invalid key", async () => {
    const { initEnterprise, isFeatureEnabled } = await import(
      "../../../packages/enterprise/src/index.js"
    );
    initEnterprise("invalid.key");
    for (const feature of ENTERPRISE_FEATURES) {
      expect(isFeatureEnabled(feature)).toBe(false);
    }
  });
});

describe("PLAN_FEATURES", () => {
  it("team plan has exactly 8 features", () => {
    expect(PLAN_FEATURES.team).toHaveLength(8);
  });

  it("team plan contains the expected features", () => {
    const expected = [
      "saml_sso",
      "s3_storage",
      "multi_tenancy",
      "audit_export",
      "siem_forwarding",
      "sso_enforcement",
      "upgrade_management",
      "admin_alerts",
    ];
    for (const feature of expected) {
      expect(PLAN_FEATURES.team).toContain(feature);
    }
  });

  it("team plan does not include compliance-only features", () => {
    expect(PLAN_FEATURES.team).not.toContain("scim");
    expect(PLAN_FEATURES.team).not.toContain("webhooks");
    expect(PLAN_FEATURES.team).not.toContain("mfa");
    expect(PLAN_FEATURES.team).not.toContain("per_tool_permissions");
    expect(PLAN_FEATURES.team).not.toContain("tamper_resistant_audit");
    expect(PLAN_FEATURES.team).not.toContain("legal_hold");
    expect(PLAN_FEATURES.team).not.toContain("gdpr_lifecycle");
    expect(PLAN_FEATURES.team).not.toContain("team_retention_overrides");
    expect(PLAN_FEATURES.team).not.toContain("ip_allowlist");
    expect(PLAN_FEATURES.team).not.toContain("config_export_import");
  });

  it("enterprise plan has all 19 features", () => {
    expect(PLAN_FEATURES.enterprise).toHaveLength(19);
  });

  it("enterprise plan is a superset of team plan", () => {
    for (const feature of PLAN_FEATURES.team) {
      expect(PLAN_FEATURES.enterprise).toContain(feature);
    }
  });

  it("enterprise plan references the same array as ENTERPRISE_FEATURES", () => {
    expect(PLAN_FEATURES.enterprise).toBe(ENTERPRISE_FEATURES);
  });
});

describe("ENTERPRISE_FEATURES", () => {
  it("contains exactly 19 features", () => {
    expect(ENTERPRISE_FEATURES).toHaveLength(19);
  });

  it("has no duplicate entries", () => {
    const unique = new Set(ENTERPRISE_FEATURES);
    expect(unique.size).toBe(ENTERPRISE_FEATURES.length);
  });

  it("contains all expected feature strings", () => {
    const expected = [
      "saml_sso",
      "s3_storage",
      "scim",
      "multi_tenancy",
      "webhooks",
      "audit_export",
      "mfa",
      "per_tool_permissions",
      "siem_forwarding",
      "tamper_resistant_audit",
      "legal_hold",
      "gdpr_lifecycle",
      "team_retention_overrides",
      "sso_enforcement",
      "ip_allowlist",
      "config_export_import",
      "upgrade_management",
      "admin_alerts",
      "distributed_tracing",
    ];
    expect([...ENTERPRISE_FEATURES].sort()).toEqual([...expected].sort());
  });

  it("every entry is a non-empty string", () => {
    for (const feature of ENTERPRISE_FEATURES) {
      expect(typeof feature).toBe("string");
      expect(feature.length).toBeGreaterThan(0);
    }
  });
});
