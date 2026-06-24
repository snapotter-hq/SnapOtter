#!/usr/bin/env node
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PRIVATE_KEY_PATH = ".license-signing-key";

// Keep in sync with PLAN_FEATURES in packages/enterprise/src/license.ts.
// isFeatureEnabled() checks the signed license's own `features` array, so a stale
// list here silently leaves gated features 403ing even with a valid enterprise key.
const PLAN_FEATURES = {
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
  enterprise: [
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
  ],
};

const command = process.argv[2];

if (command === "keygen") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(PRIVATE_KEY_PATH, privateKey, "utf-8");
  console.log("Private key saved to", PRIVATE_KEY_PATH);
  console.log("\nPublic key (paste into packages/enterprise/src/license.ts):\n");
  console.log(publicKey);
} else if (command === "sign") {
  const args = process.argv.slice(3);
  const get = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const org = get("org");
  const plan = get("plan") || "enterprise";
  const seats = parseInt(get("seats") || "0", 10);
  const expires = get("expires");

  if (!org || !expires) {
    console.error(
      "Usage: generate-license.mjs sign --org <name> --expires <YYYY-MM-DD> [--plan team|enterprise] [--seats N]",
    );
    process.exit(1);
  }

  if (!existsSync(PRIVATE_KEY_PATH)) {
    console.error(
      `Private key not found at ${PRIVATE_KEY_PATH}. Run 'generate-license.mjs keygen' first.`,
    );
    process.exit(1);
  }

  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise;
  const payload = {
    org,
    plan,
    features,
    seats,
    expiresAt: new Date(expires).toISOString(),
    issuedAt: new Date().toISOString(),
  };

  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  const privateKeyPem = readFileSync(PRIVATE_KEY_PATH, "utf-8");
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payloadBytes, privateKey);

  const licenseKey = `${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;

  console.log("License payload:", JSON.stringify(payload, null, 2));
  console.log("\nLicense key:\n");
  console.log(licenseKey);
} else {
  console.log("SnapOtter License Key Generator\n");
  console.log("Commands:");
  console.log("  keygen                     Generate a new Ed25519 signing keypair");
  console.log("  sign                       Sign a license key\n");
  console.log("Sign options:");
  console.log("  --org <name>               Organization name (required)");
  console.log("  --expires <YYYY-MM-DD>     Expiration date (required)");
  console.log("  --plan <team|enterprise>   License plan (default: enterprise)");
  console.log("  --seats <N>                Seat count (default: 0 = unlimited)");
}
