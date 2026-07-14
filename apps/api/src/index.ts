import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { trace } from "@opentelemetry/api";
import { getDispatcherStatus, initDispatcher, isGpuAvailable } from "@snapotter/ai";
import { ANALYTICS_EVENTS, APP_VERSION, SafeError } from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import Fastify from "fastify";
import { env } from "./config.js";
import { closeDb, db, schema } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startCancelListener, stopCancelListener } from "./jobs/cancel.js";
import { assertRedisCompatible, closeRedis, pingRedis } from "./jobs/connection.js";
import { closeFlowProducer, closeQueueEvents, warmQueueEvents } from "./jobs/enqueue.js";
import { closeQueues, perPoolHealth, queueCounts } from "./jobs/queues.js";
import { enqueueSystemJob, SYSTEM_JOBS, scheduleSystemJobs } from "./jobs/system-jobs.js";
import { closeWorkers, startWorkers } from "./jobs/worker.js";
import { initAnalytics, shutdownAnalytics, trackEvent } from "./lib/analytics.js";
import { shouldRunStartupCleanup } from "./lib/cleanup.js";
import { buildCsp } from "./lib/csp.js";
import { reportError } from "./lib/error-report.js";
import { stripInternalPaths } from "./lib/errors.js";
import {
  acquireInstallLock,
  ensureAiDirs,
  getAiDir,
  getInstallLockFdForChild,
  isFeatureInstalled,
  releaseInstallLock,
  startInterruptedInstallRecovery,
  stopInterruptedInstallRecovery,
} from "./lib/feature-status.js";
import { logger } from "./lib/logger.js";
import { requestDuration } from "./lib/metrics.js";
import { purgeOcrRuntimeDownloads, runOcrRuntimeMaintenance } from "./lib/ocr-runtime-install.js";
import { getSettingString } from "./lib/settings-helpers.js";
import { assertStorageWritable } from "./lib/storage-writable.js";
import { gatherSystemProperties } from "./lib/system-info.js";
import { requirePermission } from "./permissions.js";
import {
  authMiddleware,
  authRoutes,
  ensureAnonymousUser,
  ensureBuiltinRoles,
  ensureDefaultAdmin,
  ensureDefaultTeam,
  getAuthUser,
} from "./plugins/auth.js";
import { registerMfa } from "./plugins/mfa.js";
import { oidcRoutes } from "./plugins/oidc.js";
import { registerSaml } from "./plugins/saml.js";
import { registerStatic } from "./plugins/static.js";
import { registerUpload } from "./plugins/upload.js";
import { adminOpsRoutes } from "./routes/admin-ops.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { registerBatchRoutes } from "./routes/batch.js";
import { configRoutes } from "./routes/config.js";
import { docsRoutes } from "./routes/docs.js";
import { registerEnterpriseRoutes } from "./routes/enterprise/index.js";
import { registerFeatureRoutes } from "./routes/features.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { registerFetchUrlsRoute } from "./routes/fetch-urls.js";
import { filePreviewRoutes } from "./routes/file-preview.js";
import { fileRoutes } from "./routes/files.js";
import { registerMemeTemplates } from "./routes/meme-templates.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { registerProgressRoutes } from "./routes/progress.js";
import { rolesRoutes } from "./routes/roles.js";
import { settingsRoutes } from "./routes/settings.js";
import { teamsRoutes } from "./routes/teams.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { userFileRoutes } from "./routes/user-files.js";
import { shutdownTracing } from "./tracing.js";

// Run before anything else
try {
  await runMigrations();
} catch (err) {
  const safeUrl = env.DATABASE_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    `FATAL: Cannot connect to Postgres at ${safeUrl}. Is the database running? (docker compose up, or set DATABASE_URL)`,
  );
  console.error(err);
  process.exit(1);
}
console.log("Database initialized");

// Verify Redis is reachable (required for BullMQ job queues)
try {
  await pingRedis();
} catch (err) {
  const safeUrl = env.REDIS_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    `FATAL: Cannot connect to Redis at ${safeUrl}. Is Redis running? (docker compose up, or set REDIS_URL)`,
  );
  console.error(err);
  process.exit(1);
}

// BullMQ v5 requires Redis >= 6.2. Fail fast with an actionable message instead
// of crash-looping later on ReplyErrors from an incompatible server.
try {
  await assertRedisCompatible();
} catch (err) {
  const detected = err instanceof SafeError && err.code ? ` (detected ${err.code})` : "";
  console.error(`FATAL: ${(err as Error).message}${detected}`);
  process.exit(1);
}
console.log("Redis connected");

// Verify the local storage directories are writable before serving. A non-root
// container launched against a volume it cannot write (TrueNAS, Kubernetes
// runAsUser / OpenShift, or a bind mount owned by another user) would otherwise
// boot "healthy" and fail with a cryptic EACCES on the first file operation.
try {
  await assertStorageWritable();
  console.log("Storage directories writable");
} catch (err) {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
}

// Auto-import / detect a 1.x SQLite database on boot (before default user creation).
// The orchestrator owns detection (explicit path, "off" sentinel, or DATA_DIR probe),
// the four boot states, and the persisted marker. See db/sqlite-import.ts.
{
  const { runBootImport } = await import("./db/sqlite-import.js");
  await runBootImport({
    SQLITE_MIGRATE_PATH: env.SQLITE_MIGRATE_PATH,
    DATA_DIR: env.DATA_DIR,
    FILES_STORAGE_PATH: env.FILES_STORAGE_PATH,
  });
}

// Seed built-in roles (admin, editor, user) that legacy SQLite migrations
// inserted via data statements.  The pg baseline is DDL-only, so roles are
// seeded here at boot time.  onConflictDoNothing makes this idempotent.
await ensureBuiltinRoles();
await ensureDefaultTeam();

if (env.AUTH_ENABLED) {
  await ensureDefaultAdmin();
} else {
  await ensureAnonymousUser();
}

async function ensureInstanceId() {
  const [existing] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "instance_id"));
  if (!existing) {
    await db.insert(schema.settings).values({ key: "instance_id", value: randomUUID() });
  }
}

await ensureInstanceId();

async function ensureDefaultSettings() {
  const defaults: Record<string, string> = {
    defaultTheme: env.DEFAULT_THEME,
    defaultLocale: env.DEFAULT_LOCALE,
    defaultToolView: env.DEFAULT_TOOL_VIEW,
  };
  for (const [key, value] of Object.entries(defaults)) {
    const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (!existing) {
      await db.insert(schema.settings).values({ key, value });
    }
  }
}

await ensureDefaultSettings();

if (!env.COOKIE_SECRET) {
  const [existing] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "cookie_secret"));
  if (existing) {
    (env as Record<string, unknown>).COOKIE_SECRET = existing.value;
  } else {
    const generated = randomUUID() + randomUUID();
    await db.insert(schema.settings).values({ key: "cookie_secret", value: generated });
    (env as Record<string, unknown>).COOKIE_SECRET = generated;
  }
}

await initAnalytics();
const { primeAnalyticsGate } = await import("./lib/analytics-gate.js");
await primeAnalyticsGate();
// ignoreSampleRate: this once-per-boot census must not be thinned by the
// volume sample rate that exists to throttle high-frequency usage events.
await trackEvent(ANALYTICS_EVENTS.INSTANCE_STARTED, { ...gatherSystemProperties() }, undefined, {
  ignoreSampleRate: true,
});

// Enterprise features (license-gated)
let enterpriseLicense: { org: string; plan: string } | null = null;
try {
  const { initEnterprise } = await import("@snapotter/enterprise");
  const result = initEnterprise(env.SNAPOTTER_LICENSE_KEY || undefined);
  if (result.valid && result.license) {
    enterpriseLicense = result.license;
  } else if (env.SNAPOTTER_LICENSE_KEY) {
    console.warn("[WARN] Invalid or expired enterprise license key");
  }
} catch {
  // Enterprise package not available
}

// S3 storage is a licensed feature (s3_storage). packages/enterprise now ships in
// every image, so STORAGE_MODE=s3 would otherwise function without any license check.
// Enforce the gate at boot so an unlicensed deploy fails fast rather than silently
// writing data to S3 it isn't entitled to use.
if (env.STORAGE_MODE === "s3") {
  let s3Licensed = false;
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    s3Licensed = isFeatureEnabled("s3_storage");
  } catch {
    s3Licensed = false;
  }
  if (!s3Licensed) {
    console.error(
      "[FATAL] STORAGE_MODE=s3 requires a license that includes the s3_storage feature. " +
        "Set a valid SNAPOTTER_LICENSE_KEY (team or enterprise plan) or use STORAGE_MODE=local.",
    );
    process.exit(1);
  }
}

// Start the cooperative cancellation listener (Redis pub/sub)
await startCancelListener();
const { startAnalyticsGateListener } = await import("./lib/analytics-gate.js");
await startAnalyticsGateListener();

// Set up AI feature directories and recover from interrupted installs. Both are
// best-effort and must never block boot: ensureAiDirs swallows its own errors,
// and recovery (clearing stale locks and partial downloads) is wrapped here so a
// malformed installed.json or unreadable models dir degrades to a warning rather
// than a fatal startup crash (Sentry NODE-12).
ensureAiDirs();
let initialOcrRuntimeReconciliation: Promise<boolean> | undefined;
startInterruptedInstallRecovery({
  onRecovered: () => {
    if (!acquireInstallLock("__startup_ocr_reconcile__")) return false;
    const installLockFd = getInstallLockFdForChild();
    const reconciliation = (async () => {
      try {
        await runOcrRuntimeMaintenance("reconcile", { aiDataDir: getAiDir(), installLockFd });
        if (isFeatureInstalled("ocr")) {
          await purgeOcrRuntimeDownloads(getAiDir(), installLockFd);
        }
        return true;
      } catch (error) {
        console.warn(
          `[ocr-runtime] Startup reconciliation failed; retrying: ${(error as Error).message}`,
        );
        return false;
      } finally {
        releaseInstallLock();
      }
    })();
    initialOcrRuntimeReconciliation ??= reconciliation;
    return reconciliation;
  },
});
if (initialOcrRuntimeReconciliation) await initialOcrRuntimeReconciliation;

function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  const asNum = Number(value);
  if (!Number.isNaN(asNum)) return asNum;
  return value; // CIDR list
}

const app = Fastify({
  genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
  loggerInstance: logger,
  bodyLimit: env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : 1073741824,
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  routerOptions: { maxParamLength: 500 },
  // Self-hosted boots can be slow: venv bootstrap, AI-model verification, and
  // SPA static serving all touch disk, and some deployments sit on slow or
  // contended volumes. avvio's default 10s pluginTimeout fataled boot at
  // '@fastify/static' on those hosts (Sentry NODE-14). 60s tolerates slow
  // startup I/O while still surfacing a genuinely deadlocked plugin.
  pluginTimeout: 60_000,
});

// Image processing (especially AI batch) can run for tens of minutes.
// Node.js defaults to a 5-minute requestTimeout which kills long-running
// connections. Set a generous default; per-route overrides disable it entirely.
app.server.requestTimeout = 30 * 60 * 1000;
app.server.headersTimeout = 60 * 1000;

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
  try {
    const str = typeof body === "string" ? body : (body as Buffer).toString();
    done(null, str.length > 0 ? JSON.parse(str) : {});
  } catch {
    const parseErr = new Error("Malformed JSON in request body") as Error & { statusCode: number };
    parseErr.statusCode = 400;
    done(parseErr, undefined);
  }
});

app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode === 429) {
    request.log.warn({ url: request.url, method: request.method }, "Rate limit exceeded");
  } else if (statusCode >= 500) {
    request.log.error(
      { err: error, url: request.url, method: request.method },
      "Unhandled request error",
    );
    void reportError(error, {
      source: "http",
      route: request.routeOptions?.url ?? undefined,
      method: request.method,
      statusCode,
    });
  } else {
    request.log.warn({ err: error, url: request.url, method: request.method }, "Request error");
  }
  reply.status(statusCode).send({
    error: statusCode >= 500 ? "Internal server error" : stripInternalPaths(error.message),
    ...(statusCode < 500 && { details: stripInternalPaths(error.message) }),
  });
});

// Plugins
await app.register(cors, {
  origin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : process.env.NODE_ENV === "production"
      ? false
      : [/^http:\/\/localhost:\d+$/],
});

// Security headers -- applied in all environments. HSTS is ignored over plain
// HTTP so it is safe (and desirable) to send it in dev/staging too. CSP catches
// injection issues early when applied during development.
app.addHook("onSend", async (_request, reply) => {
  reply.header("x-request-id", _request.id);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  reply.header("Content-Security-Policy", buildCsp(_request.url.startsWith("/api/docs")));
});

// Record HTTP request duration for Prometheus (bounded cardinality: 5 route groups * 5 status classes)
app.addHook("onResponse", (request, reply, done) => {
  const duration = reply.elapsedTime / 1000;

  const url = request.url;
  let routeGroup = "other";
  if (url.startsWith("/api/v1/tools/") || url.startsWith("/api/v1/jobs/")) routeGroup = "tools";
  else if (url.startsWith("/api/auth/") || url.startsWith("/api/v1/enterprise/"))
    routeGroup = "auth";
  else if (url.startsWith("/api/v1/admin/") || url.startsWith("/api/v1/settings"))
    routeGroup = "admin";
  else if (url.startsWith("/api/v1/files")) routeGroup = "files";
  else if (url.startsWith("/api/v1/scim/")) routeGroup = "scim";

  const statusClass = `${Math.floor(reply.statusCode / 100)}xx`;

  requestDuration.observe({ route_group: routeGroup, status_class: statusClass }, duration);
  done();
});

// Always register rate-limit plugin so per-route limits (login brute-force protection) work.
// max=0 means "unlimited" (50k/min) -- @fastify/rate-limit treats literal 0 as "block all".
await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN > 0 ? env.RATE_LIMIT_PER_MIN : 50_000,
  timeWindow: "1 minute",
  allowList: (request) => !request.url.startsWith("/api/"),
});

// Block TRACE method (returns 401 instead of 405 without this)
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "TRACE") {
    reply.header("Allow", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
    return reply.status(405).send({ error: "Method not allowed" });
  }
});

// Multipart upload support
await registerUpload(app);

// Cookie support (required for OIDC state and session cookies)
await app.register(cookie, {
  secret: env.COOKIE_SECRET,
  hook: "onRequest",
});

// IP allowlist (enterprise -- must run before auth to reject early)
import { registerIpAllowlist } from "./plugins/ip-allowlist.js";
import { registerPerUserRateLimit } from "./plugins/per-user-rate-limit.js";

await registerIpAllowlist(app);

// Public config routes (no auth required)
await configRoutes(app);

// Per-user preferences (any authenticated user)
await preferencesRoutes(app);

// Auth middleware (must be registered before routes it protects)
await authMiddleware(app);

// Per-user rate limiting (after auth so request.user is populated)
await registerPerUserRateLimit(app);

// Enrich active OTel span with tool_id and user_id when available
app.addHook("preHandler", (request, _reply, done) => {
  const span = trace.getActiveSpan();
  if (span) {
    const params = request.params as Record<string, string> | undefined;
    if (params?.toolId) span.setAttribute("snapotter.tool_id", params.toolId);
    const user = getAuthUser(request);
    if (user) span.setAttribute("snapotter.user_id", user.id);
  }
  done();
});

// Auth routes
await authRoutes(app);

// OIDC routes
await oidcRoutes(app);

// SAML routes
await registerSaml(app);

// MFA routes (TOTP enrollment, verification, disable)
await registerMfa(app);

// File upload/download routes
await fileRoutes(app);

// User file library routes (persistent file management with versioning)
await userFileRoutes(app);

// File preview routes (server-side video/audio preview generation)
await filePreviewRoutes(app);

// Meme template listing and static serving (before tool routes which have catch-all)
await registerMemeTemplates(app);

// Tool routes (generic factory-based)
await registerToolRoutes(app);

// Batch processing routes (must be after tool routes so the registry is populated)
await registerBatchRoutes(app);

// URL fetch routes (server-side image fetching with SSRF protection)
await registerFetchUrlsRoute(app);

// Pipeline routes (must be after tool routes so the registry is populated)
await registerPipelineRoutes(app);

// Progress SSE routes
await registerProgressRoutes(app);

// API key management routes
await apiKeyRoutes(app);

// Settings routes
await settingsRoutes(app);

// Analytics config and consent routes
await analyticsRoutes(app);

// Explicit customer feedback capture (respects the analytics gate)
await feedbackRoutes(app);

// Feature management routes (AI feature bundle install/uninstall)
await registerFeatureRoutes(app);

// Teams routes
await teamsRoutes(app);

// Audit log routes
await auditLogRoutes(app);

// Roles management routes
await rolesRoutes(app);

// Admin ops routes (runtime log level, Prometheus metrics)
await adminOpsRoutes(app);

// Enterprise routes (license-gated features)
await registerEnterpriseRoutes(app);

// API docs (Scalar)
await docsRoutes(app);

// Disk space check for readiness probe (local storage mode only)
async function checkDiskSpace(path: string, minBytes: number): Promise<boolean> {
  try {
    const stats = await statfs(path);
    return stats.bfree * stats.bsize > minBytes;
  } catch {
    return true; // Path doesn't exist or not applicable -- skip check
  }
}

// Public health check (checks core dependencies)
app.get("/api/v1/health", async (_request, reply) => {
  let dbOk = false;
  try {
    await db.select().from(schema.settings).limit(1);
    dbOk = true;
  } catch {
    /* db unreachable */
  }

  const status = dbOk ? "healthy" : "unhealthy";
  const code = dbOk ? 200 : 503;
  return reply.code(code).send({
    status,
    version: APP_VERSION,
  });
});

// Admin health check (full diagnostics)
app.get("/api/v1/admin/health", async (request, reply) => {
  const admin = await requirePermission("system:health")(request, reply);
  if (!admin) return;

  let dbOk = false;
  try {
    await db.select().from(schema.settings).limit(1);
    dbOk = true;
  } catch {
    /* db unreachable */
  }
  let queueStats = { active: 0, pending: 0 };
  let pools: Record<string, unknown> = {};
  try {
    const counts = await queueCounts();
    queueStats = { active: counts.active, pending: counts.waiting };
    pools = await perPoolHealth();
  } catch {
    /* redis unreachable */
  }

  // Storage total across all users
  let libraryStorage = "0";
  try {
    const storageResult = await db
      .select({
        totalBytes: sql<string>`coalesce(sum(${schema.users.storageUsed}), 0)::text`,
      })
      .from(schema.users);
    libraryStorage = storageResult[0]?.totalBytes ?? "0";
  } catch {
    /* db error */
  }

  // Backup recency
  let lastBackup: string | null = null;
  try {
    const backupResult = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, "backup_last_completed"))
      .limit(1);
    lastBackup = backupResult.length > 0 ? backupResult[0].value : null;
  } catch {
    /* db error */
  }

  return {
    status: dbOk ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: `${process.uptime().toFixed(0)}s`,
    storage: { mode: env.STORAGE_MODE, available: "N/A" },
    database: dbOk ? "ok" : "error",
    queue: queueStats,
    pools,
    libraryStorage,
    lastBackup,
    ai: { gpu: isGpuAvailable(), dispatcher: getDispatcherStatus() },
    enterprise: enterpriseLicense
      ? { active: true, org: enterpriseLicense.org, plan: enterpriseLicense.plan }
      : { active: false },
  };
});

// Public config endpoint (for frontend to know if auth is required)
app.get("/api/v1/config/auth", async () => {
  const config: Record<string, unknown> = {
    authEnabled: env.AUTH_ENABLED,
  };
  if (env.OIDC_ENABLED) {
    config.oidcEnabled = true;
    config.oidcProviderName = env.OIDC_PROVIDER_NAME || null;
    config.oidcLoginUrl = "/api/auth/oidc/login";
  }

  // SAML SSO requires both env flag and enterprise license
  let samlLicensed = false;
  if (env.SAML_ENABLED) {
    try {
      const { isFeatureEnabled } = await import("@snapotter/enterprise");
      samlLicensed = isFeatureEnabled("saml_sso");
    } catch {
      // Enterprise package not available
    }
  }
  if (env.SAML_ENABLED && samlLicensed) {
    config.samlEnabled = true;
    config.samlProviderName = env.SAML_PROVIDER_NAME || "SSO";
    config.samlLoginUrl = "/api/auth/saml/login";
  }

  config.ssoEnforced = (await getSettingString("ssoEnforcement", "false")) === "true";

  return config;
});

// Readiness probe (no auth -- used by load balancers / k8s)
app.get("/api/v1/readyz", async (_request, reply) => {
  let postgres = false;
  let redis = false;
  try {
    await db.select().from(schema.settings).limit(1);
    postgres = true;
  } catch {
    /* db unreachable */
  }
  try {
    redis = await pingRedis();
  } catch {
    /* redis unreachable */
  }

  // Disk space: fail readiness if below 500 MB on storage paths (local mode only)
  const diskOk =
    env.STORAGE_MODE !== "s3"
      ? (await checkDiskSpace(env.WORKSPACE_PATH, 500 * 1024 * 1024)) &&
        (await checkDiskSpace(env.FILES_STORAGE_PATH, 500 * 1024 * 1024))
      : true;

  // S3 reachability (S3 mode only)
  let s3Ok = true;
  if (env.STORAGE_MODE === "s3") {
    try {
      const { loadS3Storage } = await import("@snapotter/enterprise");
      const s3 = await loadS3Storage();
      await s3.checkConnection();
    } catch {
      s3Ok = false;
    }
  }

  const ok = postgres && redis && diskOk && s3Ok;
  return reply.code(ok ? 200 : 503).send({ ok, postgres, redis, disk: diskOk, s3: s3Ok });
});

// Cancel a job (authenticated)
app.post(
  "/api/v1/jobs/:jobId/cancel",
  { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
  async (
    request: import("fastify").FastifyRequest<{ Params: { jobId: string } }>,
    reply: import("fastify").FastifyReply,
  ) => {
    const { requireAuth } = await import("./plugins/auth.js");
    const user = requireAuth(request, reply);
    if (!user) return;

    const { requestCancel } = await import("./jobs/cancel.js");
    const { jobId } = request.params;
    const canceled = await requestCancel(jobId);
    return reply.send({ canceled });
  },
);

// Serve SPA in production
if (process.env.NODE_ENV === "production") {
  await registerStatic(app);
}

// Schedule repeatable system jobs (storage TTL, session purge, retention)
await scheduleSystemJobs();
if (await shouldRunStartupCleanup()) {
  await enqueueSystemJob(SYSTEM_JOBS.storageTtl);
}

// Start BullMQ worker pools (after route registration so the tool registry is full)
startWorkers();

// Reconcile orphaned job rows. A jobs row created without a tool_id/pool (e.g. an
// SSE-progress placeholder for a clientJobId whose client then disconnected) is
// never enqueued to BullMQ, so unlike a genuinely interrupted job (which BullMQ's
// stalled-detection requeues) it would sit in 'processing'/'queued' forever --
// inflating the per-user concurrent-job count and the upgrade-check in-flight gate.
// Only rows with an empty tool_id are touched, so real jobs are never affected.
void db
  .execute(
    sql`UPDATE jobs SET status = 'failed', error = '{"message":"Orphaned job reconciled at startup"}'::jsonb, completed_at = now() WHERE status IN ('processing','queued') AND (tool_id IS NULL OR tool_id = '')`,
  )
  .then((r) => {
    const n = (r as { rowCount?: number }).rowCount ?? 0;
    if (n > 0) app.log.info({ count: n }, "Reconciled orphaned job rows at startup");
  })
  .catch((err) => app.log.warn({ err }, "Orphaned-job reconciliation failed"));

// Warm the per-pool QueueEvents consumers so the first synchronous tool request
// after boot does not pay the lazy-connect cost (and cannot miss a fast job's
// completion event). Non-blocking: a slow/unreachable Redis must not stall boot;
// the consumers fall back to lazy creation on first use if this has not finished.
void warmQueueEvents().catch((err) => {
  app.log.warn({ err }, "QueueEvents warm-up failed; consumers will connect lazily");
});

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const dispatcherResult = await initDispatcher();
  const gpuLine = dispatcherResult.ready
    ? dispatcherResult.gpu
      ? "[INFO] GPU detected -- AI tools will use CUDA acceleration"
      : "[WARN] No GPU detected -- AI tools will use CPU (slower)"
    : "[WARN] AI sidecar did not start -- AI tools will use per-request Python (slower)";
  console.log(
    [
      `SnapOtter v${APP_VERSION} running on port ${env.PORT}`,
      gpuLine,
      `[INFO] Rate limit: ${env.RATE_LIMIT_PER_MIN > 0 ? `${env.RATE_LIMIT_PER_MIN}/min` : "disabled"}`,
      `[INFO] Upload limit: ${env.MAX_UPLOAD_SIZE_MB > 0 ? `${env.MAX_UPLOAD_SIZE_MB} MB` : "unlimited"}`,
      `[INFO] Trust proxy: ${env.TRUST_PROXY}`,
      `[INFO] Storage: ${env.STORAGE_MODE}${env.STORAGE_MODE === "s3" ? ` (${env.S3_BUCKET})` : ""}`,
      enterpriseLicense
        ? `[INFO] Enterprise license: ${enterpriseLicense.org} (${enterpriseLicense.plan})`
        : "[INFO] Edition: Community",
    ].join("\n"),
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 30000;
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopInterruptedInstallRecovery();
  console.log(`\n${signal} received, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await app.close();
    console.log("HTTP server closed");
  } catch (err) {
    console.error("Error closing HTTP server:", err);
  }

  // Stop accepting queued work and let active jobs finish before tearing down
  // any service those jobs may still be using.
  try {
    await closeWorkers();
  } catch (err) {
    console.error("Error closing workers:", err);
  }

  try {
    const { shutdownDispatcher, shutdownDocsDispatcher, shutdownOcrDispatcher } = await import(
      "@snapotter/ai"
    );
    shutdownDispatcher();
    await Promise.all([shutdownDocsDispatcher(), shutdownOcrDispatcher()]);
    console.log("Python dispatchers shut down");
  } catch {
    // AI package may not be available
  }

  try {
    const { shutdownBrowser } = await import("./lib/browser-service.js");
    await shutdownBrowser();
    console.log("Browser service shut down");
  } catch {
    // Browser service may not have been initialized
  }

  try {
    await shutdownAnalytics();
    console.log("Analytics flushed");
  } catch {
    // analytics shutdown is best-effort
  }

  try {
    await shutdownTracing();
  } catch {
    // tracing shutdown is best-effort
  }

  try {
    await closeFlowProducer();
    await closeQueueEvents();
    await closeQueues();
    await stopCancelListener();
    const { stopAnalyticsGateListener } = await import("./lib/analytics-gate.js");
    await stopAnalyticsGateListener();
    await closeRedis();
    console.log("Redis connections closed");
  } catch (err) {
    console.error("Error closing Redis connections:", err);
  }

  try {
    await closeDb();
    console.log("Database connection closed");
  } catch (err) {
    console.error("Error closing database:", err);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
