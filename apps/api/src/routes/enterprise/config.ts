import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { requireFullAdmin, requirePermission } from "../../permissions.js";

const CONFIG_SCHEMA_VERSION = 1;

const REDACTED_KEYS = new Set([
  "cookie_secret",
  "instance_id",
  "siem_config",
  "scim_token_hash",
  "oidc_client_secret",
  "saml_idp_certificate",
  "siem_last_forwarded_at",
  "siem_consecutive_failures",
  "audit_archival_state",
  "backup_last_completed",
  "webhook_destinations",
]);

const roleNameField = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(2, "Role name must be 2-30 characters")
      .max(30, "Role name must be 2-30 characters")
      .regex(
        /^[a-z0-9_-]+$/,
        "Role name can only contain lowercase letters, numbers, hyphens, and underscores",
      ),
  );

const permissionField = z.enum([
  "tools:use",
  "files:own",
  "files:all",
  "apikeys:own",
  "apikeys:all",
  "pipelines:own",
  "pipelines:all",
  "settings:read",
  "settings:write",
  "users:manage",
  "teams:manage",
  "features:manage",
  "system:health",
  "audit:read",
  "compliance:manage",
  "webhooks:manage",
  "security:manage",
]);

const importedRoleSchema = z
  .object({
    name: roleNameField,
    description: z.string().max(500).optional(),
    // Empty permission sets are valid for exported deny-all custom roles.
    permissions: z.array(permissionField),
    toolPermissions: z
      .object({
        mode: z.enum(["category", "tool"]),
        allowed: z.array(z.string()),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

const importSchema = z.object({
  dryRun: z.boolean().default(false),
  config: z.object({
    configSchemaVersion: z.number(),
    settings: z.record(z.string()).optional(),
    roles: z.array(importedRoleSchema).optional(),
    teams: z
      .array(
        z.object({
          name: z.string(),
          storageQuota: z.number().nullable().optional(),
          retentionHours: z.number().nullable().optional(),
        }),
      )
      .optional(),
  }),
});

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/config/export
  app.get(
    "/api/v1/enterprise/config/export",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("system:health")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("config_export_import");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error:
            "Configuration export requires an enterprise license with the config_export_import feature",
        });
      }

      const config: Record<string, unknown> = {
        configSchemaVersion: CONFIG_SCHEMA_VERSION,
        appVersion: process.env.APP_VERSION || "unknown",
        exportedAt: new Date().toISOString(),
        settings: {} as Record<string, string>,
        roles: [] as Array<Record<string, unknown>>,
        teams: [] as Array<Record<string, unknown>>,
      };

      // Read all settings, redact sensitive keys
      const allSettings = await db.select().from(schema.settings);
      const settingsMap = config.settings as Record<string, string>;
      for (const s of allSettings) {
        if (!REDACTED_KEYS.has(s.key)) {
          settingsMap[s.key] = s.value;
        }
      }

      // Export custom roles (not built-in)
      const customRoles = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.isBuiltin, false));
      config.roles = customRoles.map((r) => ({
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        toolPermissions: r.toolPermissions,
      }));

      // Export teams
      const allTeams = await db.select().from(schema.teams);
      config.teams = allTeams.map((t) => ({
        name: t.name,
        storageQuota: t.storageQuota,
        retentionHours: t.retentionHours,
      }));

      await auditFromRequest(request)("CONFIG_EXPORTED", {
        adminId: user.id,
        username: user.username,
      });

      reply.header("content-type", "application/json");
      reply.header("content-disposition", 'attachment; filename="snapotter-config.json"');
      return config;
    },
  );

  // POST /api/v1/enterprise/config/import
  app.post(
    "/api/v1/enterprise/config/import",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const user = await requireFullAdmin(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("config_export_import");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error:
            "Configuration import requires an enterprise license with the config_export_import feature",
        });
      }

      const parsed = importSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid import payload", details: parsed.error.issues });
      }

      const { dryRun, config } = parsed.data;

      // Reject future schema versions
      if (config.configSchemaVersion > CONFIG_SCHEMA_VERSION) {
        return reply.status(400).send({
          error: `Unsupported config schema version ${config.configSchemaVersion} (current: ${CONFIG_SCHEMA_VERSION})`,
        });
      }

      // Dependency validation
      const validationErrors: string[] = [];

      if (config.settings) {
        // SSO enforcement requires OIDC or SAML to be configured
        if (config.settings.ssoEnforcement === "true") {
          const hasOidc = config.settings.oidcIssuer || config.settings.oidcClientId;
          const hasSaml = config.settings.samlIdpUrl || config.settings.samlEntityId;
          if (!hasOidc && !hasSaml) {
            validationErrors.push(
              "ssoEnforcement is enabled but no OIDC or SAML provider is configured in the import",
            );
          }
        }

        // IP allowlist must have at least one CIDR
        if (config.settings.ipAllowlist) {
          try {
            const cidrs = JSON.parse(config.settings.ipAllowlist);
            if (!Array.isArray(cidrs) || cidrs.length === 0) {
              validationErrors.push("ipAllowlist is set but contains no CIDR entries");
            }
          } catch {
            validationErrors.push("ipAllowlist contains invalid JSON");
          }
        }
      }

      if (validationErrors.length > 0) {
        return reply.status(400).send({
          error: "Dependency validation failed",
          validationErrors,
        });
      }

      // Build a change summary
      const changes = {
        settings: 0,
        roles: 0,
        teams: 0,
      };

      // Dry-run: describe what would change
      const settingsToUpdate: Array<{ key: string; action: string }> = [];
      const rolesToUpsert: Array<{ name: string; action: string }> = [];
      const teamsToUpsert: Array<{ name: string; action: string }> = [];

      if (config.settings) {
        const existingSettings = await db.select().from(schema.settings);
        const existingKeys = new Set(existingSettings.map((s) => s.key));

        for (const key of Object.keys(config.settings)) {
          // Skip redacted keys in import as well
          if (REDACTED_KEYS.has(key)) continue;
          settingsToUpdate.push({
            key,
            action: existingKeys.has(key) ? "update" : "create",
          });
        }
        changes.settings = settingsToUpdate.length;
      }

      if (config.roles) {
        const existingRoles = await db
          .select()
          .from(schema.roles)
          .where(eq(schema.roles.isBuiltin, false));
        const existingRoleNames = new Set(existingRoles.map((r) => r.name));

        for (const role of config.roles) {
          rolesToUpsert.push({
            name: role.name,
            action: existingRoleNames.has(role.name) ? "update" : "create",
          });
        }
        changes.roles = rolesToUpsert.length;
      }

      if (config.teams) {
        const existingTeams = await db.select().from(schema.teams);
        const existingTeamNames = new Set(existingTeams.map((t) => t.name));

        for (const team of config.teams) {
          teamsToUpsert.push({
            name: team.name,
            action: existingTeamNames.has(team.name) ? "update" : "create",
          });
        }
        changes.teams = teamsToUpsert.length;
      }

      if (dryRun) {
        return reply.send({
          dryRun: true,
          changes,
          details: {
            settings: settingsToUpdate,
            roles: rolesToUpsert,
            teams: teamsToUpsert,
          },
        });
      }

      // Apply changes
      const now = new Date();

      // Upsert settings
      if (config.settings) {
        const existingSettings = await db.select().from(schema.settings);
        const existingKeys = new Set(existingSettings.map((s) => s.key));

        for (const [key, value] of Object.entries(config.settings)) {
          if (REDACTED_KEYS.has(key)) continue;

          if (existingKeys.has(key)) {
            await db
              .update(schema.settings)
              .set({ value, updatedAt: now })
              .where(eq(schema.settings.key, key));
          } else {
            await db.insert(schema.settings).values({ key, value });
          }
        }
      }

      // Upsert custom roles
      if (config.roles) {
        const existingRoles = await db
          .select()
          .from(schema.roles)
          .where(eq(schema.roles.isBuiltin, false));
        const existingRoleMap = new Map(existingRoles.map((r) => [r.name, r]));

        for (const role of config.roles) {
          const existing = existingRoleMap.get(role.name);
          if (existing) {
            await db
              .update(schema.roles)
              .set({
                description: role.description ?? "",
                permissions: role.permissions,
                toolPermissions: role.toolPermissions ?? null,
                updatedAt: now,
              })
              .where(eq(schema.roles.id, existing.id));
          } else {
            await db.insert(schema.roles).values({
              id: randomUUID(),
              name: role.name,
              description: role.description ?? "",
              permissions: role.permissions,
              toolPermissions: role.toolPermissions ?? null,
              isBuiltin: false,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      // Upsert teams
      if (config.teams) {
        const existingTeams = await db.select().from(schema.teams);
        const existingTeamMap = new Map(existingTeams.map((t) => [t.name, t]));

        for (const team of config.teams) {
          const existing = existingTeamMap.get(team.name);
          if (existing) {
            await db
              .update(schema.teams)
              .set({
                storageQuota: team.storageQuota ?? null,
                retentionHours: team.retentionHours ?? null,
              })
              .where(eq(schema.teams.id, existing.id));
          } else {
            await db.insert(schema.teams).values({
              id: randomUUID(),
              name: team.name,
              storageQuota: team.storageQuota ?? null,
              retentionHours: team.retentionHours ?? null,
            });
          }
        }
      }

      await auditFromRequest(request)("CONFIG_IMPORTED", {
        adminId: user.id,
        username: user.username,
        dryRun: false,
        changes,
      });

      return reply.send({ applied: true, changes });
    },
  );

  app.log.info("Enterprise config export/import routes registered");
}
