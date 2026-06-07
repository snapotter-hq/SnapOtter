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
    RATE_LIMIT_PER_MIN: z.coerce.number().default(1000),
    DB_PATH: z.string().default("./data/snapotter.db"),
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
    MAX_CANVAS_PIXELS: z.coerce.number().default(0),
    MAX_SVG_SIZE_MB: z.coerce.number().default(50),
    MAX_SPLIT_GRID: z.coerce.number().default(100),
    MAX_STORAGE_PER_USER_MB: z.coerce.number().default(5000),
    MAX_WORKSPACE_SIZE_GB: z.coerce.number().default(10),
    MAX_PDF_PAGES: z.coerce.number().default(0),
    SESSION_DURATION_HOURS: z.coerce.number().default(168),
    LOGIN_ATTEMPT_LIMIT: z.coerce.number().default(30),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
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
    EXTERNAL_URL: z.string().default(""),
    COOKIE_SECRET: z.string().default(""),
    ANALYTICS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    ANALYTICS_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),
    POSTHOG_API_KEY: z.string().default("phc_CVHjGivwWVzh76M5EjijTwP5LpiqWie3EbCzXU7w2Smy"),
    POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
    SENTRY_DSN: z
      .string()
      .default(
        "https://2fd53fc3b3fdc59d02cac044a4f90b71@o4511263372738560.ingest.us.sentry.io/4511264620085248",
      ),
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
