import { createPublicKey, verify } from "node:crypto";

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAmbsNwJdTomjfwc7i9+s7xgSq+MIrDxvYPTki2SOwhI8=
-----END PUBLIC KEY-----`;

export const ENTERPRISE_FEATURES = [
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
] as const;

export type EnterpriseFeature = (typeof ENTERPRISE_FEATURES)[number];

export const PLAN_FEATURES: Record<string, readonly EnterpriseFeature[]> = {
  team: [
    "saml_sso",
    "s3_storage",
    "multi_tenancy",
    "audit_export",
    "siem_forwarding",
    "sso_enforcement",
    "upgrade_management",
    "admin_alerts",
  ],
  enterprise: ENTERPRISE_FEATURES,
};

export interface LicensePayload {
  org: string;
  plan: "team" | "enterprise";
  features: EnterpriseFeature[];
  seats: number;
  expiresAt: string;
  issuedAt: string;
}

export function validateLicense(key: string): LicensePayload | null {
  try {
    const dotIndex = key.indexOf(".");
    if (dotIndex < 1) return null;

    const payloadBytes = Buffer.from(key.slice(0, dotIndex), "base64url");
    const signature = Buffer.from(key.slice(dotIndex + 1), "base64url");

    const publicKey = createPublicKey(PUBLIC_KEY_PEM);
    const valid = verify(null, payloadBytes, publicKey, signature);
    if (!valid) return null;

    const payload = JSON.parse(payloadBytes.toString("utf-8")) as LicensePayload;

    if (new Date(payload.expiresAt) < new Date()) return null;

    return payload;
  } catch {
    return null;
  }
}
