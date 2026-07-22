import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import {
  getSettingPolicy,
  isConfigExportableSetting,
  prepareSetting,
  validateSettingsRuntimeConstraints,
} from "../../lib/settings-policy.js";
import { requireFullAdmin } from "../../permissions.js";

const CONFIG_SCHEMA_VERSION = 1;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

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

const importedTeamSchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(50)),
    storageQuota: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    retentionHours: z.number().int().positive().max(POSTGRES_INTEGER_MAX).nullable().optional(),
  })
  .strict();

const BUILTIN_ROLE_NAMES = new Set(["admin", "editor", "user", "disabled"]);

function findDuplicateName(names: readonly string[], caseInsensitive = false): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    const identity = caseInsensitive ? name.toLowerCase() : name;
    if (seen.has(identity)) return name;
    seen.add(identity);
  }
  return undefined;
}

const importSchema = z.object({
  dryRun: z.boolean().default(false),
  config: z.object({
    configSchemaVersion: z.number(),
    settings: z.record(z.string()).optional(),
    roles: z.array(importedRoleSchema).optional(),
    teams: z.array(importedTeamSchema).optional(),
  }),
});

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/config/export
  app.get(
    "/api/v1/enterprise/config/export",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
        if (isConfigExportableSetting(s.key)) {
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

      const duplicateRoleName = findDuplicateName(config.roles?.map((role) => role.name) ?? []);
      if (duplicateRoleName) {
        return reply.status(400).send({
          error: `Duplicate role name "${duplicateRoleName}" in config import`,
          code: "VALIDATION_ERROR",
        });
      }
      const reservedRoleName = config.roles?.find((role) =>
        BUILTIN_ROLE_NAMES.has(role.name),
      )?.name;
      if (reservedRoleName) {
        return reply.status(400).send({
          error: `Built-in role "${reservedRoleName}" cannot be imported as a custom role`,
          code: "VALIDATION_ERROR",
        });
      }

      const duplicateTeamName = findDuplicateName(
        config.teams?.map((team) => team.name) ?? [],
        true,
      );
      if (duplicateTeamName) {
        return reply.status(400).send({
          error: `Duplicate team name "${duplicateTeamName}" in config import`,
          code: "VALIDATION_ERROR",
        });
      }

      const preparedSettings: Array<{ key: string; value: string }> = [];
      const preparedKeys = new Set<string>();
      if (config.settings) {
        for (const [requestedKey, value] of Object.entries(config.settings)) {
          const policy = getSettingPolicy(requestedKey);
          if (!policy) {
            return reply.status(400).send({
              error: `Unknown setting "${requestedKey}"`,
              code: "UNKNOWN_SETTING",
            });
          }
          if (policy.write === "none") {
            return reply.status(400).send({
              error: `Setting "${requestedKey}" cannot be modified through config import`,
              code: "READONLY_SETTING",
            });
          }

          // Exported secrets are omitted and older exports may still contain a
          // redaction placeholder. Preserve the established skip behavior.
          if (policy.redacted) continue;

          const prepared = prepareSetting(requestedKey, value);
          if (!prepared.success) {
            return reply.status(400).send({
              error: prepared.error,
              code: prepared.code,
              ...(prepared.details ? { details: prepared.details } : {}),
            });
          }
          if (preparedKeys.has(prepared.key)) {
            return reply.status(400).send({
              error: `Setting "${requestedKey}" duplicates "${prepared.key}" in the same import`,
              code: "VALIDATION_ERROR",
            });
          }
          preparedKeys.add(prepared.key);
          preparedSettings.push({ key: prepared.key, value: prepared.value });
        }
      }

      const runtimeValidation = await validateSettingsRuntimeConstraints(preparedSettings);
      if (!runtimeValidation.success) {
        return reply.status(runtimeValidation.statusCode).send({
          error: runtimeValidation.error,
          code: runtimeValidation.code,
          ...(runtimeValidation.validationErrors
            ? { validationErrors: runtimeValidation.validationErrors }
            : {}),
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

      if (preparedSettings.length > 0) {
        const existingSettings = await db.select().from(schema.settings);
        const existingKeys = new Set(existingSettings.map((s) => s.key));

        for (const { key } of preparedSettings) {
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
        const existingTeamNames = new Set(existingTeams.map((team) => team.name.toLowerCase()));

        for (const team of config.teams) {
          teamsToUpsert.push({
            name: team.name,
            action: existingTeamNames.has(team.name.toLowerCase()) ? "update" : "create",
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

      await db.transaction(async (tx) => {
        // Keep settings, roles, and teams in one transaction so any database
        // conflict rolls back the complete imported configuration.
        if (preparedSettings.length > 0) {
          const existingSettings = await tx.select().from(schema.settings);
          const existingKeys = new Set(existingSettings.map((setting) => setting.key));

          for (const { key, value } of preparedSettings) {
            if (existingKeys.has(key)) {
              await tx
                .update(schema.settings)
                .set({ value, updatedAt: now })
                .where(eq(schema.settings.key, key));
            } else {
              await tx.insert(schema.settings).values({ key, value });
            }
          }
        }

        if (config.roles) {
          const existingRoles = await tx
            .select()
            .from(schema.roles)
            .where(eq(schema.roles.isBuiltin, false));
          const existingRoleMap = new Map(existingRoles.map((role) => [role.name, role]));

          for (const role of config.roles) {
            const existing = existingRoleMap.get(role.name);
            if (existing) {
              await tx
                .update(schema.roles)
                .set({
                  description: role.description ?? "",
                  permissions: role.permissions,
                  toolPermissions: role.toolPermissions ?? null,
                  updatedAt: now,
                })
                .where(eq(schema.roles.id, existing.id));
            } else {
              await tx.insert(schema.roles).values({
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

        if (config.teams) {
          const existingTeams = await tx.select().from(schema.teams);
          const existingTeamMap = new Map(
            existingTeams.map((team) => [team.name.toLowerCase(), team]),
          );

          for (const team of config.teams) {
            const existing = existingTeamMap.get(team.name.toLowerCase());
            if (existing) {
              await tx
                .update(schema.teams)
                .set({
                  storageQuota: team.storageQuota ?? null,
                  retentionHours: team.retentionHours ?? null,
                })
                .where(eq(schema.teams.id, existing.id));
            } else {
              await tx.insert(schema.teams).values({
                id: randomUUID(),
                name: team.name,
                storageQuota: team.storageQuota ?? null,
                retentionHours: team.retentionHours ?? null,
              });
            }
          }
        }
      });

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
