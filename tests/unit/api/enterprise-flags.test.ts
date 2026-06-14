import { ENTERPRISE_FEATURES, PLAN_FEATURES } from "@snapotter/enterprise";
import { describe, expect, it } from "vitest";

describe("enterprise feature flags", () => {
  it("includes all Phase 1 flags", () => {
    expect(ENTERPRISE_FEATURES).toContain("siem_forwarding");
    expect(ENTERPRISE_FEATURES).toContain("tamper_resistant_audit");
  });

  it("includes all Phase 2-4 flags", () => {
    expect(ENTERPRISE_FEATURES).toContain("legal_hold");
    expect(ENTERPRISE_FEATURES).toContain("gdpr_lifecycle");
    expect(ENTERPRISE_FEATURES).toContain("admin_alerts");
  });

  it("team plan includes operational features", () => {
    expect(PLAN_FEATURES.team).toContain("siem_forwarding");
    expect(PLAN_FEATURES.team).toContain("audit_export");
    expect(PLAN_FEATURES.team).toContain("upgrade_management");
    expect(PLAN_FEATURES.team).toContain("admin_alerts");
  });

  it("team plan does NOT include compliance features", () => {
    expect(PLAN_FEATURES.team).not.toContain("tamper_resistant_audit");
    expect(PLAN_FEATURES.team).not.toContain("legal_hold");
    expect(PLAN_FEATURES.team).not.toContain("gdpr_lifecycle");
  });

  it("enterprise plan includes everything", () => {
    for (const feature of ENTERPRISE_FEATURES) {
      expect(PLAN_FEATURES.enterprise).toContain(feature);
    }
  });

  it("has exactly 19 features total", () => {
    expect(ENTERPRISE_FEATURES).toHaveLength(19);
  });

  it("includes distributed_tracing in enterprise plan only", () => {
    expect(ENTERPRISE_FEATURES).toContain("distributed_tracing");
    expect(PLAN_FEATURES.enterprise).toContain("distributed_tracing");
    expect(PLAN_FEATURES.team).not.toContain("distributed_tracing");
  });
});
