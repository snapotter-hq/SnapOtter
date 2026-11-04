import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENTERPRISE_FEATURES, PLAN_FEATURES } from "@snapotter/enterprise";
import { describe, expect, it } from "vitest";

const apiSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/src");

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

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

  it("has exactly 18 features total", () => {
    expect(ENTERPRISE_FEATURES).toHaveLength(18);
  });

  it("every feature has at least one gate call site in apps/api/src (#4324)", () => {
    const source = listTsFiles(apiSrc)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const ungated = ENTERPRISE_FEATURES.filter(
      (feature) =>
        !new RegExp(
          `(?:isEnterpriseFeatureEnabled|isFeatureEnabled)\\(\\s*["']${feature}["']`,
        ).test(source),
    );
    expect(ungated).toEqual([]);
  });

  it("includes distributed_tracing in enterprise plan only", () => {
    expect(ENTERPRISE_FEATURES).toContain("distributed_tracing");
    expect(PLAN_FEATURES.enterprise).toContain("distributed_tracing");
    expect(PLAN_FEATURES.team).not.toContain("distributed_tracing");
  });
});
