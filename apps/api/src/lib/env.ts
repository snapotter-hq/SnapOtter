import { availableParallelism } from "node:os";
import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(1349),
    AUTH_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    DEFAULT_USERNAME: z.string().default("admin"),
    DEFAULT_PASSWORD: z.string().default("admin"),
    SKIP_MUST_CHANGE_PASSWORD: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    STORAGE_MODE: z.enum(["local", "s3"]).default("local"),
    S3_BUCKET: z.string().default(""),
    S3_REGION: z.string().default("us-east-1"),
    S3_ENDPOINT: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    S3_PREFIX: z.string().default(""),
    SNAPOTTER_LICENSE_KEY: z.string().default(""),
    FILE_MAX_AGE_HOURS: z.coerce.number().default(72),
    CLEANUP_INTERVAL_MINUTES: z.coerce.number().default(60),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().default(0),
    MAX_BATCH_SIZE: z.coerce.number().default(0),
    CONCURRENT_JOBS: z.coerce.number().default(0),
    MAX_MEGAPIXELS: z.coerce.number().default(0),
    RATE_LIMIT_PER_MIN: z.coerce.number().default(300),
    DATABASE_URL: z.string().default("postgres://snapotter:snapotter@localhost:5432/snapotter"),
    SQLITE_MIGRATE_PATH: z.string().default(""),
    FILES_STORAGE_PATH: z.string().default("./data/files"),
    WORKSPACE_PATH: z.string().default("./tmp/workspace"),
    DEFAULT_THEME: z.enum(["light", "dark", "system"]).default("light"),
    DEFAULT_LOCALE: z.string().default("en"),
    DEFAULT_TOOL_VIEW: z.enum(["sidebar", "fullscreen"]).default("sidebar"),
    CORS_ORIGIN: z.string().default(""),
    MAX_USERS: z.coerce.number().default(0),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    MAX_WORKER_THREADS: z.coerce.number().default(0),
    PROCESSING_TIMEOUT_S: z.coerce.number().default(0),
    MAX_PIPELINE_STEPS: z.coerce.number().default(20),
    MAX_PIPELINE_STEP_PIXELS: z.coerce.number().default(67_108_864),
    MAX_CANVAS_PIXELS: z.coerce.number().default(0),
    MAX_SVG_SIZE_MB: z.coerce.number().default(50),
    MAX_SPLIT_GRID: z.coerce.number().default(100),
    MAX_STORAGE_PER_USER_MB: z.coerce.number().default(5000),
    MAX_WORKSPACE_SIZE_GB: z.coerce.number().default(10),
    MAX_PDF_PAGES: z.coerce.number().default(0),
    MAX_VIDEO_DURATION_S: z.coerce.number().default(0),
    MAX_AUDIO_DURATION_S: z.coerce.number().default(0),
    MAX_VIDEO_BITRATE_KBPS: z.coerce.number().default(0),
    LIBREOFFICE_TIMEOUT_S: z.coerce.number().default(120),
    SESSION_DURATION_HOURS: z.coerce.number().default(168),
    LOGIN_ATTEMPT_LIMIT: z.coerce.number().default(10),
    TRUST_PROXY: z.string().default("false"),
    OIDC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    OIDC_ISSUER_URL: z.string().default(""),
    OIDC_CLIENT_ID: z.string().default(""),
    OIDC_CLIENT_SECRET: z.string().default(""),
    OIDC_SCOPES: z.string().default("openid profile email"),
    OIDC_AUTO_CREATE_USERS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    OIDC_DEFAULT_ROLE: z.string().default("user"),
    OIDC_AUTO_LINK_USERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    OIDC_PROVIDER_NAME: z.string().default(""),
    OIDC_CLOCK_TOLERANCE: z.coerce.number().min(0).max(300).default(30),
    OIDC_USERNAME_CLAIM: z.string().default("preferred_username"),
    SAML_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SAML_ENTITY_ID: z.string().default(""),
    SAML_CALLBACK_URL: z.string().default(""),
    SAML_IDP_SSO_URL: z.string().default(""),
    SAML_IDP_CERTIFICATE: z.string().default(""),
    SAML_AUTO_CREATE_USERS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SAML_AUTO_LINK_USERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SAML_DEFAULT_ROLE: z.string().default("user"),
    SAML_PROVIDER_NAME: z.string().default(""),
    SAML_USERNAME_ATTRIBUTE: z.string().default(""),
    SAML_EMAIL_ATTRIBUTE: z.string().default("email"),
    EXTERNAL_URL: z.string().default(""),
    COOKIE_SECRET: z.string().default(""),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    SYNC_WAIT_MS: z.coerce.number().default(8000),
    JOB_TIMEOUT_FAST_S: z.coerce.number().default(120),
    JOB_TIMEOUT_LONG_S: z.coerce.number().default(7200),
    JOBS_RETENTION_DAYS: z.coerce.number().default(30),
    AUDIT_RETENTION_DAYS: z.coerce.number().default(0),
    LOG_DIR: z.string().default("./data/logs"),
    SCRATCH_PATH: z.string().default(""),
    ANALYTICS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    ANALYTICS_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),
    POSTHOG_API_KEY: z.string().default(""),
    POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
    SENTRY_DSN: z.string().default(""),
    DATA_ENCRYPTION_KEY: z.string().default(""),
    DATA_ENCRYPTION_KEY_PREVIOUS: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.STORAGE_MODE === "s3") {
      if (!data.S3_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "S3_BUCKET is required when STORAGE_MODE=s3",
          path: ["S3_BUCKET"],
        });
      }
      if (!data.S3_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "S3_ACCESS_KEY_ID is required when STORAGE_MODE=s3",
          path: ["S3_ACCESS_KEY_ID"],
        });
      }
      if (!data.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "S3_SECRET_ACCESS_KEY is required when STORAGE_MODE=s3",
          path: ["S3_SECRET_ACCESS_KEY"],
        });
      }
    }
    if (data.OIDC_ENABLED) {
      if (!data.OIDC_ISSUER_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "OIDC_ISSUER_URL is required when OIDC_ENABLED=true",
          path: ["OIDC_ISSUER_URL"],
        });
      }
      if (!data.OIDC_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "OIDC_CLIENT_ID is required when OIDC_ENABLED=true",
          path: ["OIDC_CLIENT_ID"],
        });
      }
      if (!data.OIDC_CLIENT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "OIDC_CLIENT_SECRET is required when OIDC_ENABLED=true",
          path: ["OIDC_CLIENT_SECRET"],
        });
      }
      if (!data.EXTERNAL_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EXTERNAL_URL is required when OIDC_ENABLED=true",
          path: ["EXTERNAL_URL"],
        });
      }
    }
    if (data.SAML_ENABLED) {
      if (!data.SAML_IDP_SSO_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SAML_IDP_SSO_URL is required when SAML_ENABLED=true",
          path: ["SAML_IDP_SSO_URL"],
        });
      }
      if (!data.SAML_IDP_CERTIFICATE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SAML_IDP_CERTIFICATE is required when SAML_ENABLED=true",
          path: ["SAML_IDP_CERTIFICATE"],
        });
      }
      if (!data.EXTERNAL_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EXTERNAL_URL is required when SAML_ENABLED=true",
          path: ["EXTERNAL_URL"],
        });
      }
    }
    if (data.DATA_ENCRYPTION_KEY) {
      if (!/^[0-9a-fA-F]{64}$/.test(data.DATA_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATA_ENCRYPTION_KEY"],
          message: "DATA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
        });
      }
    }
    if (data.DATA_ENCRYPTION_KEY_PREVIOUS) {
      if (!/^[0-9a-fA-F]{64}$/.test(data.DATA_ENCRYPTION_KEY_PREVIOUS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATA_ENCRYPTION_KEY_PREVIOUS"],
          message: "DATA_ENCRYPTION_KEY_PREVIOUS must be a 64-character hex string (32 bytes)",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

export function resolveConcurrency(env: Env): number {
  if (env.CONCURRENT_JOBS > 0) return env.CONCURRENT_JOBS;
  return Math.max(2, availableParallelism() - 1);
}

export function resolveWorkerThreads(env: Env): number {
  if (env.MAX_WORKER_THREADS > 0) return env.MAX_WORKER_THREADS;
  return Math.max(2, availableParallelism() - 1);
}
