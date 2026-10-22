import { availableParallelism } from "node:os";
import { z } from "zod";
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from "./trust-proxy.js";

/**
 * Whether a URL is https, read from the parsed scheme rather than a string
 * prefix, which an uppercase "HTTPS://" slips past (#1775). False for a value
 * that doesn't parse.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Whether a URL parses with an http: or https: scheme and a non-empty host.
 * A scheme-less value with a port ("keycloak.lan:8080/realms/x") parses with
 * protocol "keycloak.lan:" and an empty host, so both checks are needed (#1912, #2869).
 */
function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && url.host.length > 0;
  } catch {
    return false;
  }
}

/**
 * Canonicalise EXTERNAL_URL to `${url.protocol}//${url.host}${url.pathname}`
 * with trailing slashes stripped when it is an http(s) URL with no credentials,
 * query string, or fragment (#1876). Scheme and host are lowercased (IDN hosts
 * punycoded), default ports (:80, :443) are dropped, and backslashes and dot
 * segments in the path are resolved, while the path's case is preserved so
 * BASE_PATH matching does not change. Anything else keeps its trimmed,
 * slash-stripped form so the SSO boot check still rejects it with its own
 * message.
 */
function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !/[?#]/.test(trimmed)
    ) {
      return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
    }
  } catch {
    // Keep the trimmed form so the SSO boot check still rejects it.
  }
  return trimmed;
}

const envSchema = z
  .object({
    PORT: z.coerce.number().default(1349),
    BASE_PATH: z
      .string()
      .default("")
      .transform((value) => value.replace(/\/$/, ""))
      .refine((value) => /^(\/[a-zA-Z0-9_-]+)*$/.test(value), {
        message:
          "BASE_PATH must be empty, /, or a path such as /snapotter (letters, digits, - and _)",
      })
      // Unprefixed requests stay routable (health checks, stripping proxies), so
      // a prefix that is also an app path would strip /api/v1/health itself.
      .refine((value) => !/^\/(api|assets)(\/|$)/.test(value), {
        message: "BASE_PATH cannot start with /api or /assets; those are SnapOtter's own paths",
      }),
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
    MAX_UPLOAD_SIZE_MB: z.coerce.number().default(100),
    MAX_BATCH_SIZE: z.coerce.number().default(100),
    CONCURRENT_JOBS: z.coerce.number().default(0),
    MAX_MEGAPIXELS: z.coerce.number().default(0),
    GIF_BG_MAX_FRAMES: z.coerce.number().default(150),
    RATE_LIMIT_PER_MIN: z.coerce.number().default(1000),
    API_KEYS_RATE_LIMIT_PER_MIN: z.coerce.number().default(30),
    DATABASE_URL: z.string().default("postgres://snapotter:snapotter@localhost:5432/snapotter"),
    // Privileged connection used only during boot, for migrations and for
    // granting the runtime role. When empty the app runs single-role: DATABASE_URL
    // does both jobs, exactly as it did before the split. Managed Postgres
    // (RDS, Supabase) usually cannot create roles, so single-role stays supported.
    DATABASE_MIGRATION_URL: z.string().default(""),
    // How long to wait for Postgres/Redis to accept connections at startup before
    // giving up. A dependency ordered but not yet ready (fresh boot) recovers within
    // this window instead of crash-looping. 0 = try once, fail fast.
    DB_STARTUP_TIMEOUT_MS: z.coerce.number().default(30_000),
    SQLITE_MIGRATE_PATH: z.string().default(""),
    DATA_DIR: z.string().default("./data"),
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
    // Max single-file AI jobs one user may have queued/processing at once. The
    // AI pool runs at concurrency 1, so this stops one user from starving it.
    // 0 = unlimited. Batch/pipeline AI are bounded separately and not counted.
    MAX_AI_JOBS_PER_USER: z.coerce.number().default(5),
    // Optional per-process address-space cap (MB) for the native media/doc
    // engines (ffmpeg, ghostscript, qpdf, libreoffice, pandoc, pdfcpu). 0 =
    // disabled (the container memory limit is the primary backstop). Not applied
    // to the AI sidecar (torch/CUDA reserve huge virtual space). See
    // packages/shared/src/subprocess-limit.ts.
    SUBPROCESS_MEMORY_LIMIT_MB: z.coerce.number().default(0),
    MAX_PDF_PAGES: z.coerce.number().default(0),
    MAX_VIDEO_DURATION_S: z.coerce.number().default(0),
    MAX_AUDIO_DURATION_S: z.coerce.number().default(0),
    MAX_VIDEO_BITRATE_KBPS: z.coerce.number().default(0),
    LIBREOFFICE_TIMEOUT_S: z.coerce.number().default(120),
    PREVIEW_TIMEOUT_S: z.coerce.number().default(300),
    SESSION_DURATION_HOURS: z.coerce.number().default(168),
    LOGIN_ATTEMPT_LIMIT: z.coerce.number().default(10),
    // Per-username sliding-window throttle on failed password logins: once a
    // username accumulates LOGIN_THROTTLE_MAX_FAILURES failures within
    // LOGIN_THROTTLE_WINDOW_S seconds, further attempts get 429 until the
    // oldest failures age out. 0 disables. DB-overridable via the
    // loginThrottleMaxFailures / loginThrottleWindowSeconds settings. Bounds
    // are enforced here so a bad value fails loudly at boot instead of
    // silently neutering the throttle (a window of 0 would wipe the window on
    // every recorded failure while the feature looks armed).
    LOGIN_THROTTLE_MAX_FAILURES: z.coerce.number().int().min(0).default(10),
    LOGIN_THROTTLE_WINDOW_S: z.coerce.number().int().min(1).default(900),
    // One default everywhere. A source build that never goes through the
    // Docker layer resolves to the same trust list the image bakes, so `pnpm
    // dev` and a bare `node` deployment cannot end up on a different
    // authentication boundary than a container. See lib/trust-proxy.ts.
    TRUST_PROXY: z.string().default(DEFAULT_TRUST_PROXY),
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
    OIDC_DEFAULT_ROLE: z
      .string()
      .trim()
      .default("user")
      .transform((v) => v || "user"),
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
    SAML_ENTITY_ID: z.string().trim().default(""),
    SAML_CALLBACK_URL: z.string().trim().default(""),
    SAML_IDP_SSO_URL: z.string().trim().default(""),
    SAML_IDP_CERTIFICATE: z.string().trim().default(""),
    SAML_AUTO_CREATE_USERS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SAML_AUTO_LINK_USERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SAML_DEFAULT_ROLE: z
      .string()
      .trim()
      .default("user")
      .transform((v) => v || "user"),
    SAML_PROVIDER_NAME: z.string().trim().default(""),
    SAML_USERNAME_ATTRIBUTE: z.string().trim().default(""),
    SAML_EMAIL_ATTRIBUTE: z
      .string()
      .trim()
      .default("email")
      .transform((v) => v || "email"),
    // Callback and logout URLs append a path to this, so a trailing slash
    // would double up into "//api/auth/..." (#1599), and non-canonical
    // spellings (uppercase scheme or host, default port, backslash, dot
    // segments) would give one origin several redirect URIs (#1876).
    EXTERNAL_URL: z.string().default("").transform(normalizeExternalUrl),
    COOKIE_SECRET: z.string().default(""),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    SYNC_WAIT_MS: z.coerce.number().default(8000),
    JOB_TIMEOUT_FAST_S: z.coerce.number().default(120),
    JOB_TIMEOUT_LONG_S: z.coerce.number().default(7200),
    GDPR_EXPORT_TIMEOUT_MS: z.coerce.number().default(900_000),
    // AI bundle install watchdog. A wedged installer (dead download socket,
    // hung pip) otherwise holds the venv writer lock forever and blocks every
    // other install. STALL = max time with no progress frame before a kill;
    // MAX = absolute wall-clock ceiling. 0 disables that check.
    INSTALL_STALL_MS: z.coerce.number().default(1_200_000),
    INSTALL_MAX_MS: z.coerce.number().default(7_200_000),
    JOBS_RETENTION_DAYS: z.coerce.number().default(30),
    AUDIT_RETENTION_DAYS: z.coerce.number().default(0),
    LOG_DIR: z.string().default("./data/logs"),
    SCRATCH_PATH: z.string().default(""),
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
      } else if (!isHttpOrHttpsUrl(data.OIDC_ISSUER_URL)) {
        // Plain http stays allowed for LAN and dev setups (#1879 warns at boot).
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "OIDC_ISSUER_URL must be an http(s) URL such as https://auth.example.com/realms/myrealm",
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
      } else if (!isHttpOrHttpsUrl(data.SAML_IDP_SSO_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SAML_IDP_SSO_URL must be an http(s) URL such as https://idp.example.com/sso",
          path: ["SAML_IDP_SSO_URL"],
        });
      }
      if (data.SAML_CALLBACK_URL && !isHttpOrHttpsUrl(data.SAML_CALLBACK_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "SAML_CALLBACK_URL must be an http(s) URL such as https://example.com/api/auth/saml/callback",
          path: ["SAML_CALLBACK_URL"],
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
    // SSO callbacks are built from EXTERNAL_URL while the state and session
    // cookies are scoped to BASE_PATH, so the two must name the same path or
    // every SSO login fails with a generic state mismatch.
    if ((data.OIDC_ENABLED || data.SAML_ENABLED) && data.EXTERNAL_URL) {
      let externalPath: string | null = null;
      try {
        const url = new URL(data.EXTERNAL_URL);
        if (url.username || url.password) {
          // Credentials would be copied into every redirect_uri, ACS URL, and
          // entity ID sent to the IdP (#1775).
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["EXTERNAL_URL"],
            message:
              "EXTERNAL_URL must not contain a username or password; use the public URL alone, such as https://example.com/snapotter",
          });
        } else if (
          // A path appended after a query string or fragment never reaches the
          // callback route, and an IdP can only redirect to http(s). The raw
          // check also catches a bare trailing "?" or "#", which URL drops.
          (url.protocol === "http:" || url.protocol === "https:") &&
          !/[?#]/.test(data.EXTERNAL_URL)
        ) {
          externalPath = url.pathname.replace(/\/$/, "");
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["EXTERNAL_URL"],
            message:
              "EXTERNAL_URL must be an http(s) URL with no query string or fragment, such as https://example.com/snapotter",
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["EXTERNAL_URL"],
          message: "EXTERNAL_URL must be an absolute URL such as https://example.com/snapotter",
        });
      }
      if (externalPath !== null && externalPath !== data.BASE_PATH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["EXTERNAL_URL"],
          message: `EXTERNAL_URL path "${externalPath || "/"}" must match BASE_PATH "${data.BASE_PATH || "/"}" when SSO is enabled`,
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
    // Reject a hop-count TRUST_PROXY here, before anything connects, rather
    // than letting it throw out of Fastify() after migrations and Redis are
    // already up. parseTrustProxy stays the single source of truth.
    try {
      parseTrustProxy(data.TRUST_PROXY);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(rawEnv);
}

/**
 * Log once at boot when SSO is on and EXTERNAL_URL was rewritten to its
 * canonical form (#1876). Trailing slashes and surrounding whitespace are
 * stripped either way (#1599), so only a change to the URL itself (uppercase
 * scheme or host, an explicit :80/:443 default port, a backslash, dot
 * segments, or an IDN host) warns. An IdP that registered the previous
 * spelling from SP metadata or an allowlist needs the canonical URL, or
 * SAML_ENTITY_ID pinned to the previous entity ID.
 */
export function warnIfExternalUrlCanonicalized(
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
  rawEnv: NodeJS.ProcessEnv = process.env,
  parsedEnv: Pick<Env, "OIDC_ENABLED" | "SAML_ENABLED" | "EXTERNAL_URL"> = loadEnv(rawEnv),
): void {
  if (!parsedEnv.OIDC_ENABLED && !parsedEnv.SAML_ENABLED) return;
  const configured = (rawEnv.EXTERNAL_URL ?? "").trim().replace(/\/+$/, "");
  if (!configured || configured === parsedEnv.EXTERNAL_URL) return;
  log.warn(
    { configuredExternalUrl: configured, canonicalExternalUrl: parsedEnv.EXTERNAL_URL },
    `EXTERNAL_URL "${configured}" was canonicalized to "${parsedEnv.EXTERNAL_URL}". SSO redirect URIs, SAML metadata, and post_logout_redirect_uri now use the canonical URL; update your identity provider or set SAML_ENTITY_ID="${configured}/api/auth/saml/metadata" to keep the previous SAML entity ID.`,
  );
}

export function resolveConcurrency(env: Env): number {
  if (Number.isFinite(env.CONCURRENT_JOBS) && env.CONCURRENT_JOBS >= 1) {
    return Math.floor(env.CONCURRENT_JOBS);
  }
  return Math.max(2, availableParallelism() - 1);
}

export function resolveWorkerThreads(env: Env): number {
  if (Number.isFinite(env.MAX_WORKER_THREADS) && env.MAX_WORKER_THREADS >= 1) {
    return Math.floor(env.MAX_WORKER_THREADS);
  }
  return Math.max(2, availableParallelism() - 1);
}
