import { availableParallelism } from "node:os";
import { z } from "zod";

const envSchema = z.object({
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
  FILE_MAX_AGE_HOURS: z.coerce.number().default(72),
  CLEANUP_INTERVAL_MINUTES: z.coerce.number().default(60),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(0),
  MAX_BATCH_SIZE: z.coerce.number().default(0),
  CONCURRENT_JOBS: z.coerce.number().default(0),
  MAX_MEGAPIXELS: z.coerce.number().default(0),
  RATE_LIMIT_PER_MIN: z.coerce.number().default(0),
  DB_PATH: z.string().default("./data/ashim.db"),
  FILES_STORAGE_PATH: z.string().default("./data/files"),
  WORKSPACE_PATH: z.string().default("./tmp/workspace"),
  DEFAULT_THEME: z.enum(["light", "dark"]).default("light"),
  DEFAULT_LOCALE: z.string().default("en"),
  APP_NAME: z.string().default("ashim"),
  CORS_ORIGIN: z.string().default(""),
  MAX_USERS: z.coerce.number().default(0),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MAX_WORKER_THREADS: z.coerce.number().default(0),
  PROCESSING_TIMEOUT_S: z.coerce.number().default(0),
  MAX_PIPELINE_STEPS: z.coerce.number().default(0),
  MAX_CANVAS_PIXELS: z.coerce.number().default(0),
  MAX_SVG_SIZE_MB: z.coerce.number().default(0),
  MAX_LOGO_SIZE_KB: z.coerce.number().default(2048),
  MAX_SPLIT_GRID: z.coerce.number().default(100),
  MAX_PDF_PAGES: z.coerce.number().default(0),
  SESSION_DURATION_HOURS: z.coerce.number().default(168),
  LOGIN_ATTEMPT_LIMIT: z.coerce.number().default(10),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
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
