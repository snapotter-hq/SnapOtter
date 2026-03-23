import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(1350),
  AUTH_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DEFAULT_USERNAME: z.string().default("admin"),
  DEFAULT_PASSWORD: z.string().default("admin"),
  STORAGE_MODE: z.enum(["local", "s3"]).default("local"),
  FILE_MAX_AGE_HOURS: z.coerce.number().default(24),
  CLEANUP_INTERVAL_MINUTES: z.coerce.number().default(30),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(100),
  MAX_BATCH_SIZE: z.coerce.number().default(200),
  CONCURRENT_JOBS: z.coerce.number().default(3),
  MAX_MEGAPIXELS: z.coerce.number().default(100),
  RATE_LIMIT_PER_MIN: z.coerce.number().default(100),
  DB_PATH: z.string().default("./data/stirling.db"),
  WORKSPACE_PATH: z.string().default("./tmp/workspace"),
  DEFAULT_THEME: z.enum(["light", "dark"]).default("light"),
  DEFAULT_LOCALE: z.string().default("en"),
  APP_NAME: z.string().default("Stirling Image"),
  CORS_ORIGIN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
