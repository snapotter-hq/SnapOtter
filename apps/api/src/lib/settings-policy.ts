import { type Permission, SUPPORTED_LOCALES } from "@snapotter/shared";
import { type ZodIssue, z } from "zod";
import { env } from "../config.js";

export type SettingAuthority = Permission | "full-admin" | "none";

export interface SettingPolicy {
  read: SettingAuthority;
  write: SettingAuthority;
  encrypted?: boolean;
  redacted?: boolean;
  schema?: z.ZodType<string, z.ZodTypeDef, unknown>;
  storageKey?: string;
}

const booleanSetting = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => String(value));

function integerSetting(
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): z.ZodType<string, z.ZodTypeDef, unknown> {
  return z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "number" ? value : Number(value)))
    .refine(Number.isSafeInteger, "Must be an integer")
    .refine((value) => value >= minimum, `Must be at least ${minimum}`)
    .refine((value) => value <= maximum, `Must be at most ${maximum}`)
    .transform(String);
}

function finiteNumberSetting(minimumExclusive: number): z.ZodType<string, z.ZodTypeDef, unknown> {
  return z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "number" ? value : Number(value)))
    .refine(Number.isFinite, "Must be a finite number")
    .refine((value) => value > minimumExclusive, `Must be greater than ${minimumExclusive}`)
    .transform(String);
}

const timestampSetting = z
  .string()
  .max(100)
  .refine((value) => Number.isFinite(Date.parse(value)), "Must be an ISO-8601 timestamp")
  .transform((value) => new Date(value).toISOString());

const disabledToolsSetting = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    z.array(z.string().min(1).max(200)).max(5000),
  )
  .transform((value) => JSON.stringify(value));

const localeCodes = new Set(SUPPORTED_LOCALES.map((locale) => locale.code));
const localeSetting = z
  .string()
  .refine((value) => localeCodes.has(value), "Must be a supported locale");

const breakGlassUsernameSetting = z
  .string()
  .max(50)
  .refine(
    (value) => value === "" || /^[A-Za-z0-9_.-]{3,50}$/.test(value),
    "Must be empty or a valid username",
  );

const boundedSecretSetting = z.string().max(65_536);

const general = (schema: z.ZodType<string, z.ZodTypeDef, unknown>): SettingPolicy => ({
  read: "settings:read",
  write: "settings:write",
  schema,
});

const security = (
  schema: z.ZodType<string, z.ZodTypeDef, unknown>,
  storageKey?: string,
): SettingPolicy => ({
  read: "security:manage",
  write: "security:manage",
  schema,
  ...(storageKey ? { storageKey } : {}),
});

const compliance = (schema: z.ZodType<string, z.ZodTypeDef, unknown>): SettingPolicy => ({
  read: "compliance:manage",
  write: "compliance:manage",
  schema,
});

const fullAdminSecret = (schema: z.ZodType<string, z.ZodTypeDef, unknown>): SettingPolicy => ({
  encrypted: true,
  read: "full-admin",
  redacted: true,
  write: "full-admin",
  schema,
});

const readonly = (options: Pick<SettingPolicy, "encrypted" | "redacted"> = {}): SettingPolicy => ({
  read: "full-admin",
  write: "none",
  ...options,
});

/**
 * Closed registry for every first-party key accepted by the generic settings API.
 * Security-sensitive keys must be added here deliberately so a new runtime
 * consumer cannot silently inherit the coarse settings:write permission.
 */
const SETTING_POLICIES: Readonly<Record<string, SettingPolicy>> = {
  defaultTheme: general(z.enum(["light", "dark", "system"])),
  defaultLocale: general(localeSetting),
  defaultToolView: general(z.enum(["sidebar", "fullscreen"])),
  fileUploadLimitMb: general(finiteNumberSetting(0)),
  tempFileMaxAgeHours: general(finiteNumberSetting(0)),
  startupCleanup: general(booleanSetting),
  analyticsEnabled: general(booleanSetting),
  jobsRetentionDays: general(integerSetting(0)),
  disabledTools: general(disabledToolsSetting),
  enableExperimentalTools: general(booleanSetting),
  rateLimitPerUser: general(integerSetting(0)),
  maxConcurrentJobsPerUser: general(integerSetting(0)),
  "feedback.install.submittedAt": general(timestampSetting),
  "feedback.install.snoozedUntil": general(timestampSetting),
  "feedback.install.dismissedAt": general(timestampSetting),
  "onboarding.usageSurvey.answeredAt": general(timestampSetting),
  "onboarding.usageSurvey.dismissedAt": general(timestampSetting),
  "sqlite_import.dismissedAt": general(timestampSetting),

  loginAttemptLimit: security(integerSetting(1)),
  sessionIdleTimeoutMinutes: security(integerSetting(0)),
  maxSessionsPerUser: security(integerSetting(0)),
  mfaPolicy: security(z.enum(["optional", "admins_only", "required"])),
  ssoEnforcement: security(booleanSetting),
  ssoBreakGlassUsername: security(breakGlassUsernameSetting),
  passwordMinLength: security(integerSetting(8, 128)),
  passwordRequireUppercase: security(booleanSetting),
  passwordRequireLowercase: security(booleanSetting),
  passwordRequireDigit: security(booleanSetting),
  passwordRequireNumber: security(booleanSetting, "passwordRequireDigit"),
  passwordRequireSpecial: security(booleanSetting),

  auditRetentionDays: compliance(integerSetting(0)),
  auditArchiveMonths: compliance(integerSetting(0)),
  auditToolOperations: compliance(booleanSetting),
  tamperResistantAudit: compliance(booleanSetting),

  oidc_client_secret: fullAdminSecret(boundedSecretSetting),
  saml_idp_certificate: fullAdminSecret(boundedSecretSetting),
  siem_webhook_auth: fullAdminSecret(boundedSecretSetting),

  cookie_secret: readonly({ encrypted: true, redacted: true }),
  instance_id: readonly(),
  sqlite_import: readonly(),
  "onboarding.firstProcessedAt": readonly(),
  scim_token_hash: readonly({ encrypted: true, redacted: true }),
  siem_config: readonly({ redacted: true }),
  webhook_destinations: readonly({ redacted: true }),
  ipAllowlist: readonly(),
  backup_last_completed: readonly(),
  audit_archival_state: readonly(),
  siem_last_forwarded_at: readonly(),
  siem_consecutive_failures: readonly(),
};

export function getSettingPolicy(key: string): SettingPolicy | undefined {
  return SETTING_POLICIES[key];
}

export function isConfigExportableSetting(key: string): boolean {
  const policy = getSettingPolicy(key);
  return Boolean(
    policy &&
      policy.write !== "none" &&
      !policy.redacted &&
      (!policy.storageKey || policy.storageKey === key),
  );
}

export type SettingsRuntimeValidation =
  | { success: true }
  | {
      success: false;
      statusCode: 400 | 403;
      code: "DEPENDENCY_VALIDATION_FAILED" | "FEATURE_NOT_LICENSED";
      error: string;
      validationErrors?: string[];
    };

/** Validate constraints that depend on runtime state rather than value shape. */
export async function validateSettingsRuntimeConstraints(
  settings: ReadonlyArray<{ key: string; value: string }>,
): Promise<SettingsRuntimeValidation> {
  const enforcesMfa = settings.some(
    ({ key, value }) => key === "mfaPolicy" && (value === "admins_only" || value === "required"),
  );
  if (enforcesMfa) {
    let mfaLicensed = false;
    try {
      const { isFeatureEnabled } = await import("@snapotter/enterprise");
      mfaLicensed = isFeatureEnabled("mfa");
    } catch {
      // Enterprise package not available.
    }

    if (!mfaLicensed) {
      return {
        success: false,
        statusCode: 403,
        error: "MFA requires an enterprise license",
        code: "FEATURE_NOT_LICENSED",
      };
    }
  }

  const enforcesSso = settings.some(
    ({ key, value }) => key === "ssoEnforcement" && value === "true",
  );
  if (enforcesSso && !env.OIDC_ENABLED && !env.SAML_ENABLED) {
    const validationErrors = [
      "ssoEnforcement is enabled but no OIDC or SAML provider is configured",
    ];
    return {
      success: false,
      statusCode: 400,
      error: "Dependency validation failed",
      code: "DEPENDENCY_VALIDATION_FAILED",
      validationErrors,
    };
  }

  return { success: true };
}

export type PreparedSetting =
  | {
      success: true;
      key: string;
      value: string;
      policy: SettingPolicy;
    }
  | {
      success: false;
      code: "UNKNOWN_SETTING" | "VALIDATION_ERROR";
      error: string;
      details?: ZodIssue[];
    };

export function prepareSetting(key: string, value: unknown): PreparedSetting {
  const policy = getSettingPolicy(key);
  if (!policy) {
    return {
      success: false,
      code: "UNKNOWN_SETTING",
      error: `Unknown setting "${key}"`,
    };
  }

  if (!policy.schema) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return {
      success: true,
      key: policy.storageKey ?? key,
      value: serialized ?? "",
      policy,
    };
  }

  const parsed = policy.schema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: `Invalid value for setting "${key}"`,
      details: parsed.error.issues,
    };
  }

  return {
    success: true,
    key: policy.storageKey ?? key,
    value: parsed.data,
    policy,
  };
}
