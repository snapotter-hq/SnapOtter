/**
 * Application settings routes (key-value store).
 *
 * GET  /api/v1/settings      — Get all settings as a key-value object
 * PUT  /api/v1/settings      — Save settings (admin only)
 * GET  /api/v1/settings/:key — Get a specific setting
 */

import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import { decrypt, encrypt, isEncrypted } from "../lib/encryption.js";
import {
  getSettingPolicy,
  prepareSetting,
  type SettingAuthority,
  validateSettingsRuntimeConstraints,
} from "../lib/settings-policy.js";
import {
  getEffectivePermissions,
  isFullEffectiveAdmin,
  requirePermission,
} from "../permissions.js";

const settingsBodySchema = z.record(z.string().min(1), z.unknown());

const HTML_TAG_PATTERN = /<[a-z/!?][^>]*>/i;

async function encryptIfSensitive(key: string, value: string): Promise<string> {
  if (!env.DATA_ENCRYPTION_KEY || !getSettingPolicy(key)?.encrypted) return value;
  return encrypt(value, env.DATA_ENCRYPTION_KEY);
}

function hasSettingAuthority(
  authority: SettingAuthority,
  effectivePermissions: ReadonlySet<string>,
  fullAdmin: boolean,
): boolean {
  if (authority === "none") return false;
  if (authority === "full-admin") return fullAdmin;
  return effectivePermissions.has(authority);
}

async function decryptIfNeeded(value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  if (!env.DATA_ENCRYPTION_KEY) return value;
  return (
    (await decrypt(
      value,
      env.DATA_ENCRYPTION_KEY,
      env.DATA_ENCRYPTION_KEY_PREVIOUS || undefined,
    )) ?? value
  );
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/settings — Get all settings as a key-value object
  app.get(
    "/api/v1/settings",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("settings:read")(request, reply);
      if (!user) return;

      const effectivePermissions = new Set<string>(await getEffectivePermissions(user));
      const fullAdmin = await isFullEffectiveAdmin(user);
      const rows = await db.select().from(schema.settings);

      const settings: Record<string, string> = {};
      for (const row of rows) {
        const policy = getSettingPolicy(row.key);
        if (!policy || !hasSettingAuthority(policy.read, effectivePermissions, fullAdmin)) continue;
        if (policy.storageKey && policy.storageKey !== row.key) continue;
        if (policy.redacted) {
          settings[row.key] = "********";
          continue;
        }
        settings[row.key] = await decryptIfNeeded(row.value);
      }

      return reply.send({ settings });
    },
  );

  // PUT /api/v1/settings — Save settings (admin only)
  const updateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
    if (!admin) return;

    const parsed = settingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Request body must be a JSON object with key-value pairs",
        code: "VALIDATION_ERROR",
      });
    }
    const body = parsed.data;
    const effectivePermissions = new Set<string>(await getEffectivePermissions(admin));
    const fullAdmin = await isFullEffectiveAdmin(admin);

    // Pass 1: validate all entries before writing any
    const entries: Array<{ key: string; strValue: string }> = [];
    const canonicalKeys = new Set<string>();

    for (const [requestedKey, value] of Object.entries(body)) {
      if (typeof requestedKey !== "string" || requestedKey.length === 0) continue;
      const rawValue = typeof value === "string" ? value : (JSON.stringify(value) ?? "");

      if (HTML_TAG_PATTERN.test(requestedKey) || HTML_TAG_PATTERN.test(rawValue)) {
        return reply.status(400).send({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });
      }

      const prepared = prepareSetting(requestedKey, value);
      if (!prepared.success) {
        return reply.status(400).send({
          error: prepared.error,
          code: prepared.code,
          ...(prepared.details ? { details: prepared.details } : {}),
        });
      }

      const { key, value: strValue, policy } = prepared;

      if (policy.write === "none") {
        return reply.status(400).send({
          error: `Setting "${requestedKey}" cannot be modified via the API`,
          code: "READONLY_SETTING",
        });
      }

      if (!hasSettingAuthority(policy.write, effectivePermissions, fullAdmin)) {
        const fullAdminRequired = policy.write === "full-admin";
        return reply.status(403).send({
          error: fullAdminRequired
            ? "Full administrator authority required"
            : `Setting "${requestedKey}" requires ${policy.write}`,
          code: fullAdminRequired ? "ESCALATION_DENIED" : "FORBIDDEN",
        });
      }

      // A redacted secret comes back from GET as the literal mask, so a client that
      // reads settings, edits one field, and saves the whole object echoes the mask
      // back. Treat the mask as "leave this secret unchanged" instead of encrypting
      // and persisting "********", which would destroy the real secret (e.g. the OIDC
      // client secret or SIEM webhook auth, neither of which is read-only).
      if (policy.redacted && strValue === "********") {
        continue;
      }

      if (canonicalKeys.has(key)) {
        return reply.status(400).send({
          error: `Setting "${requestedKey}" duplicates "${key}" in the same request`,
          code: "VALIDATION_ERROR",
        });
      }
      canonicalKeys.add(key);

      entries.push({ key, strValue });
    }

    // Enforcing MFA requires a licensed enrollment path. Keep this shared with
    // config import so no settings write path can create an unsatisfiable login rule.
    const runtimeValidation = await validateSettingsRuntimeConstraints(
      entries.map(({ key, strValue }) => ({ key, value: strValue })),
    );
    if (!runtimeValidation.success) {
      return reply.status(runtimeValidation.statusCode).send({
        error: runtimeValidation.error,
        code: runtimeValidation.code,
        ...(runtimeValidation.validationErrors
          ? { validationErrors: runtimeValidation.validationErrors }
          : {}),
      });
    }

    // Pass 2: write all entries now that all have passed validation
    const now = new Date();

    for (const { key, strValue } of entries) {
      const storedValue = await encryptIfSensitive(key, strValue);

      // Upsert: insert or update on conflict
      const [existing] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, key));

      if (existing) {
        await db
          .update(schema.settings)
          .set({ value: storedValue, updatedAt: now })
          .where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value: storedValue });
      }
    }

    if (entries.length > 0) {
      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: admin.id,
        username: admin.username,
        keys: entries.map((e) => e.key),
      });
    }

    if (entries.some((e) => e.key === "analyticsEnabled")) {
      // The setting is already persisted. A Redis hiccup here must not turn a
      // successful save into a 500; the TTL refresh converges replicas anyway.
      try {
        const { refreshAnalyticsGate, publishAnalyticsGateInvalidation } = await import(
          "../lib/analytics-gate.js"
        );
        await refreshAnalyticsGate(); // this replica, immediately
        await publishAnalyticsGateInvalidation(); // all other replicas
      } catch (err) {
        request.log.warn({ err }, "analytics gate invalidation failed (save still applied)");
      }
    }

    return reply.send({ ok: true, updatedCount: entries.length });
  };
  app.put(
    "/api/v1/settings",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    updateSettings,
  );

  // GET /api/v1/settings/:key — Get a specific setting
  app.get(
    "/api/v1/settings/:key",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("settings:read")(request, reply);
      if (!user) return;

      const { key } = request.params;
      const policy = getSettingPolicy(key);
      if (!policy) {
        return reply.status(404).send({
          error: `Setting "${key}" not found`,
          code: "NOT_FOUND",
        });
      }
      const effectivePermissions = new Set<string>(await getEffectivePermissions(user));
      const fullAdmin = await isFullEffectiveAdmin(user);
      if (!hasSettingAuthority(policy.read, effectivePermissions, fullAdmin)) {
        return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
      }

      const storageKey = policy.storageKey ?? key;
      const [row] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, storageKey));

      if (!row) {
        return reply.status(404).send({
          error: `Setting "${key}" not found`,
          code: "NOT_FOUND",
        });
      }

      return reply.send({
        key: storageKey,
        value: policy.redacted ? "********" : await decryptIfNeeded(row.value),
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );

  app.log.info("Settings routes registered");
}
