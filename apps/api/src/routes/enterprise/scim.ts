import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../../db/index.js";
import { sharedRedis } from "../../jobs/connection.js";
import { auditLog } from "../../lib/audit.js";
import { getSettingString, upsertSetting } from "../../lib/settings-helpers.js";
import { requirePermission } from "../../permissions.js";
import { hashPassword, verifyPassword } from "../../plugins/auth.js";

// ── SCIM Error Format ────────────────────────────────────────────

function scimError(status: number, detail: string) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail,
    status,
  };
}

// ── SCIM Bearer Token Auth ───────────────────────────────────────

async function scimAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send(scimError(401, "Bearer token required"));
    return false;
  }

  const token = authHeader.slice(7);
  const tokenHash = await getSettingString("scim_token_hash", "");
  if (!tokenHash) {
    reply.status(401).send(scimError(401, "SCIM not configured"));
    return false;
  }

  const valid = await verifyPassword(token, tokenHash);
  if (!valid) {
    reply.status(401).send(scimError(401, "Invalid token"));
    return false;
  }

  // Rate limit: 1000 req/min per SCIM token
  const redis = sharedRedis();
  const rateLimitKey = `ratelimit:scim:${tokenHash.slice(0, 16)}`;
  const count = await redis.incr(rateLimitKey);
  if (count === 1) await redis.expire(rateLimitKey, 60);
  if (count > 1000) {
    reply.status(429).send(scimError(429, "SCIM rate limit exceeded (1000 req/min)"));
    return false;
  }

  return true;
}

// ── Enterprise Feature Gate ──────────────────────────────────────

async function requireScimFeature(reply: FastifyReply): Promise<boolean> {
  let featureEnabled = false;
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    featureEnabled = isFeatureEnabled("scim");
  } catch {
    // Enterprise package not available
  }
  if (!featureEnabled) {
    reply
      .status(403)
      .send(
        scimError(403, "SCIM provisioning requires an enterprise license with the scim feature"),
      );
    return false;
  }
  return true;
}

// ── SCIM Resource Mappers ────────────────────────────────────────

interface ScimUser {
  schemas: string[];
  id: string;
  userName: string;
  externalId?: string;
  active: boolean;
  emails: Array<{ value: string; primary: boolean }>;
  name: { formatted: string };
  groups: Array<{ value: string; display: string }>;
  meta: {
    resourceType: string;
    created?: string;
    lastModified?: string;
  };
}

function toScimUser(
  user: {
    id: string;
    username: string;
    email: string | null;
    externalId: string | null;
    role: string;
    team: string;
    legalHold: boolean;
    passwordHash: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  teamName?: string,
): ScimUser {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.username,
    ...(user.externalId ? { externalId: user.externalId } : {}),
    active: user.role !== "disabled" && !user.role.startsWith("disabled:"),
    emails: user.email ? [{ value: user.email, primary: true }] : [],
    name: { formatted: user.username },
    groups: user.team ? [{ value: user.team, display: teamName ?? user.team }] : [],
    meta: {
      resourceType: "User",
      created: user.createdAt?.toISOString(),
      lastModified: user.updatedAt?.toISOString(),
    },
  };
}

interface ScimGroup {
  schemas: string[];
  id: string;
  displayName: string;
  members: Array<{ value: string; display: string }>;
  meta: {
    resourceType: string;
    created?: string;
  };
}

function toScimGroup(
  team: { id: string; name: string; createdAt: Date },
  members: Array<{ id: string; username: string }>,
): ScimGroup {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: team.id,
    displayName: team.name,
    members: members.map((m) => ({ value: m.id, display: m.username })),
    meta: {
      resourceType: "Group",
      created: team.createdAt?.toISOString(),
    },
  };
}

// ── SCIM Filter Parser ───────────────────────────────────────────

function parseScimFilter(filter: string): { attribute: string; value: string } | null {
  // Support: attribute eq "value"
  const match = filter.match(/^(\w+)\s+eq\s+"([^"]*)"$/i);
  if (!match) return null;
  return { attribute: match[1], value: match[2] };
}

// ── SCIM List Response ───────────────────────────────────────────

function scimListResponse(
  resources: unknown[],
  totalResults: number,
  startIndex: number,
  schema: string,
) {
  return {
    schemas: [schema],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

// ── Route Registration ───────────────────────────────────────────

export async function registerScimRoutes(app: FastifyInstance): Promise<void> {
  // ── Token Management Endpoints ────────────────────────────────

  // POST /api/v1/enterprise/scim/token -- generate a SCIM bearer token
  app.post(
    "/api/v1/enterprise/scim/token",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("users:manage")(request, reply);
      if (!user) return;
      if (!(await requireScimFeature(reply))) return;

      const token = randomBytes(32).toString("hex");
      const hash = await hashPassword(token);
      await upsertSetting("scim_token_hash", hash);

      await auditLog(
        request.log,
        "SETTINGS_UPDATED",
        { setting: "scim_token" },
        request.ip,
        request.id,
      );

      return reply.status(201).send({
        token,
        message: "Save this token -- it cannot be retrieved again",
      });
    },
  );

  // DELETE /api/v1/enterprise/scim/token -- revoke the SCIM bearer token
  app.delete(
    "/api/v1/enterprise/scim/token",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("users:manage")(request, reply);
      if (!user) return;
      if (!(await requireScimFeature(reply))) return;

      await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));

      await auditLog(
        request.log,
        "SETTINGS_UPDATED",
        { setting: "scim_token", action: "revoked" },
        request.ip,
        request.id,
      );

      return reply.status(204).send();
    },
  );

  // ── Discovery Endpoints (no auth required) ─────────────────────

  app.get(
    "/api/v1/scim/v2/ServiceProviderConfig",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        documentationUri: "https://docs.snapotter.com/enterprise/scim",
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
          {
            type: "oauthbearertoken",
            name: "OAuth Bearer Token",
            description: "Authentication scheme using the OAuth Bearer Token Standard",
            specUri: "https://www.rfc-editor.org/info/rfc6750",
            primary: true,
          },
        ],
        meta: {
          resourceType: "ServiceProviderConfig",
          location: "/api/v1/scim/v2/ServiceProviderConfig",
        },
      });
    },
  );

  app.get("/api/v1/scim/v2/Schemas", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [userSchema(), groupSchema()],
    });
  });

  app.get(
    "/api/v1/scim/v2/ResourceTypes",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: 2,
        startIndex: 1,
        itemsPerPage: 2,
        Resources: [
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            id: "User",
            name: "User",
            endpoint: "/api/v1/scim/v2/Users",
            schema: "urn:ietf:params:scim:schemas:core:2.0:User",
            meta: { resourceType: "ResourceType", location: "/api/v1/scim/v2/ResourceTypes/User" },
          },
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            id: "Group",
            name: "Group",
            endpoint: "/api/v1/scim/v2/Groups",
            schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
            meta: { resourceType: "ResourceType", location: "/api/v1/scim/v2/ResourceTypes/Group" },
          },
        ],
      });
    },
  );

  // ── User Operations ────────────────────────────────────────────

  // POST /api/v1/scim/v2/Users -- create user
  app.post(
    "/api/v1/scim/v2/Users",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const body = request.body as Record<string, unknown>;
      const userName = body.userName as string | undefined;
      const externalId = body.externalId as string | undefined;
      const active = body.active !== false; // default true
      const emails = body.emails as Array<{ value: string; primary?: boolean }> | undefined;
      if (!userName) {
        return reply.status(400).send(scimError(400, "userName is required"));
      }

      // Check for duplicate username
      const [existing] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, userName));

      if (existing) {
        return reply.status(409).send(scimError(409, "User already exists"));
      }

      const id = randomUUID();
      const email = emails?.find((e) => e.primary)?.value ?? emails?.[0]?.value ?? null;

      // Resolve default team
      const [defaultTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"));
      const teamId = defaultTeam?.id ?? "default-team-00000000";

      const now = new Date();
      await db.insert(schema.users).values({
        id,
        username: userName,
        email,
        externalId: externalId ?? null,
        role: active ? "user" : "disabled",
        team: teamId,
        authProvider: "scim",
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      });

      await auditLog(
        request.log,
        "SCIM_USER_PROVISIONED",
        {
          userId: id,
          username: userName,
          externalId,
        },
        request.ip,
        request.id,
      );

      const user = {
        id,
        username: userName,
        email,
        externalId: externalId ?? null,
        role: active ? "user" : "disabled",
        team: teamId,
        legalHold: false,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      };

      return reply.status(201).send(toScimUser(user, defaultTeam?.name));
    },
  );

  // GET /api/v1/scim/v2/Users/:id -- get user
  app.get(
    "/api/v1/scim/v2/Users/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!user) {
        return reply.status(404).send(scimError(404, "User not found"));
      }

      const [team] = await db
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(eq(schema.teams.id, user.team));

      return reply.send(toScimUser(user, team?.name));
    },
  );

  // GET /api/v1/scim/v2/Users -- list users with filter
  app.get(
    "/api/v1/scim/v2/Users",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (
      request: FastifyRequest<{
        Querystring: { filter?: string; startIndex?: string; count?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const filter = (request.query as Record<string, string>).filter;
      const startIndex = Math.max(
        1,
        parseInt((request.query as Record<string, string>).startIndex ?? "1", 10),
      );
      const count = Math.min(
        200,
        Math.max(1, parseInt((request.query as Record<string, string>).count ?? "100", 10)),
      );

      let users: Array<typeof schema.users.$inferSelect>;

      if (filter) {
        const parsed = parseScimFilter(filter);
        if (!parsed) {
          return reply.status(400).send(scimError(400, "Unsupported filter syntax"));
        }

        if (parsed.attribute === "userName") {
          users = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.username, parsed.value));
        } else if (parsed.attribute === "externalId") {
          users = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.externalId, parsed.value));
        } else {
          return reply
            .status(400)
            .send(scimError(400, `Unsupported filter attribute: ${parsed.attribute}`));
        }
      } else {
        users = await db.select().from(schema.users);
      }

      const totalResults = users.length;
      const offset = startIndex - 1;
      const paged = users.slice(offset, offset + count);

      // Build team name lookup
      const teamIds = [...new Set(paged.map((u) => u.team))];
      const teamRows = teamIds.length > 0 ? await db.select().from(schema.teams) : [];
      const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

      const resources = paged.map((u) => toScimUser(u, teamNameById.get(u.team)));

      return reply.send(
        scimListResponse(
          resources,
          totalResults,
          startIndex,
          "urn:ietf:params:scim:api:messages:2.0:ListResponse",
        ),
      );
    },
  );

  // PUT /api/v1/scim/v2/Users/:id -- replace user
  app.put(
    "/api/v1/scim/v2/Users/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!existing) {
        return reply.status(404).send(scimError(404, "User not found"));
      }

      const body = request.body as Record<string, unknown>;
      const userName = body.userName as string | undefined;
      const externalId = body.externalId as string | undefined;
      const active = body.active !== false;
      const emails = body.emails as Array<{ value: string; primary?: boolean }> | undefined;

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (userName && userName !== existing.username) {
        // Check for username conflict
        const [conflict] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.username, userName));
        if (conflict && conflict.id !== id) {
          return reply.status(409).send(scimError(409, "userName already taken"));
        }
        updates.username = userName;
      }

      if (externalId !== undefined) {
        updates.externalId = externalId;
      }

      const email = emails?.find((e) => e.primary)?.value ?? emails?.[0]?.value;
      if (email !== undefined) {
        updates.email = email;
      }

      // Handle active/deactivation (preserve original role through disable/enable cycle)
      if (active && existing.role.startsWith("disabled:")) {
        updates.role = existing.role.slice("disabled:".length);
      } else if (active && existing.role === "disabled") {
        updates.role = "user"; // fallback when no previous role stored
      } else if (!active && !existing.role.startsWith("disabled")) {
        updates.role = `disabled:${existing.role}`;
        // Revoke all sessions on deactivation
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
      }

      await db.update(schema.users).set(updates).where(eq(schema.users.id, id));

      const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      const [team] = await db
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(eq(schema.teams.id, updated.team));

      await auditLog(
        request.log,
        "SCIM_USER_UPDATED",
        {
          userId: id,
          username: updated.username,
          changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
        },
        request.ip,
        request.id,
      );

      return reply.send(toScimUser(updated, team?.name));
    },
  );

  // PATCH /api/v1/scim/v2/Users/:id -- partial update
  app.patch(
    "/api/v1/scim/v2/Users/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!existing) {
        return reply.status(404).send(scimError(404, "User not found"));
      }

      const body = request.body as {
        schemas?: string[];
        Operations?: Array<{
          op: string;
          path?: string;
          value?: unknown;
        }>;
      };

      const operations = body.Operations ?? [];
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      for (const op of operations) {
        const opType = op.op.toLowerCase();

        if (opType === "replace" || opType === "add") {
          if (
            op.path === "active" ||
            (!op.path &&
              typeof op.value === "object" &&
              op.value !== null &&
              "active" in (op.value as Record<string, unknown>))
          ) {
            const activeVal =
              op.path === "active" ? op.value : (op.value as Record<string, unknown>).active;
            const active = activeVal === true || activeVal === "true" || activeVal === "True";
            if (active && existing.role.startsWith("disabled:")) {
              updates.role = existing.role.slice("disabled:".length);
            } else if (active && existing.role === "disabled") {
              updates.role = "user"; // fallback when no previous role stored
            } else if (!active && !existing.role.startsWith("disabled")) {
              updates.role = `disabled:${existing.role}`;
              await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
            }
          }

          if (op.path === "userName") {
            updates.username = op.value as string;
          } else if (op.path === "externalId") {
            updates.externalId = op.value as string;
          } else if (op.path === "emails" || op.path === 'emails[type eq "work"].value') {
            const emails = Array.isArray(op.value)
              ? (op.value as Array<{ value: string; primary?: boolean }>)
              : [{ value: op.value as string, primary: true }];
            updates.email = emails.find((e) => e.primary)?.value ?? emails[0]?.value;
          } else if (op.path === "name.formatted" || op.path === "displayName") {
            // name.formatted maps to username display; no separate display name column
          }

          // Handle valueless replace (bulk value object)
          if (!op.path && typeof op.value === "object" && op.value !== null) {
            const valObj = op.value as Record<string, unknown>;
            if (valObj.userName) updates.username = valObj.userName as string;
            if (valObj.externalId !== undefined) updates.externalId = valObj.externalId as string;
            if (valObj.emails) {
              const emails = valObj.emails as Array<{ value: string; primary?: boolean }>;
              updates.email = emails.find((e) => e.primary)?.value ?? emails[0]?.value;
            }
          }
        } else if (opType === "remove") {
          if (op.path === "externalId") {
            updates.externalId = null;
          } else if (op.path === "emails") {
            updates.email = null;
          }
        }
      }

      await db.update(schema.users).set(updates).where(eq(schema.users.id, id));

      const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      const [team] = await db
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(eq(schema.teams.id, updated.team));

      await auditLog(
        request.log,
        "SCIM_USER_UPDATED",
        {
          userId: id,
          username: updated.username,
          operations: operations.map((o) => ({ op: o.op, path: o.path })),
        },
        request.ip,
        request.id,
      );

      return reply.send(toScimUser(updated, team?.name));
    },
  );

  // DELETE /api/v1/scim/v2/Users/:id -- deactivate user (soft delete)
  app.delete(
    "/api/v1/scim/v2/Users/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!user) {
        return reply.status(404).send(scimError(404, "User not found"));
      }

      // Soft-delete: preserve original role so reactivation can restore it
      await db
        .update(schema.users)
        .set({
          role: `disabled:${user.role}`,
          passwordHash: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, id));

      // Revoke all sessions
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));

      // Revoke all API keys
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, id));

      await auditLog(
        request.log,
        "SCIM_USER_DEPROVISIONED",
        {
          userId: id,
          username: user.username,
        },
        request.ip,
        request.id,
      );

      return reply.status(204).send();
    },
  );

  // ── Group Operations ───────────────────────────────────────────

  // POST /api/v1/scim/v2/Groups -- create team
  app.post(
    "/api/v1/scim/v2/Groups",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const body = request.body as Record<string, unknown>;
      const displayName = body.displayName as string | undefined;
      const members = body.members as Array<{ value: string }> | undefined;

      if (!displayName) {
        return reply.status(400).send(scimError(400, "displayName is required"));
      }

      // Check for duplicate team name
      const [existing] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, displayName));

      if (existing) {
        return reply.status(409).send(scimError(409, "Group already exists"));
      }

      const id = randomUUID();
      const now = new Date();

      await db.insert(schema.teams).values({
        id,
        name: displayName,
        createdAt: now,
      });

      // Assign members to the team
      if (members && members.length > 0) {
        for (const member of members) {
          await db
            .update(schema.users)
            .set({ team: id, updatedAt: new Date() })
            .where(eq(schema.users.id, member.value));
        }
      }

      // Fetch actual members
      const teamMembers = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.team, id));

      await auditLog(
        request.log,
        "SCIM_GROUP_SYNCED",
        {
          teamId: id,
          teamName: displayName,
          action: "created",
          memberCount: teamMembers.length,
        },
        request.ip,
        request.id,
      );

      return reply
        .status(201)
        .send(toScimGroup({ id, name: displayName, createdAt: now }, teamMembers));
    },
  );

  // GET /api/v1/scim/v2/Groups/:id -- get team
  app.get(
    "/api/v1/scim/v2/Groups/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));

      if (!team) {
        return reply.status(404).send(scimError(404, "Group not found"));
      }

      const members = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.team, id));

      return reply.send(toScimGroup(team, members));
    },
  );

  // GET /api/v1/scim/v2/Groups -- list teams
  app.get(
    "/api/v1/scim/v2/Groups",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (
      request: FastifyRequest<{
        Querystring: { filter?: string; startIndex?: string; count?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const filter = (request.query as Record<string, string>).filter;
      const startIndex = Math.max(
        1,
        parseInt((request.query as Record<string, string>).startIndex ?? "1", 10),
      );
      const count = Math.min(
        200,
        Math.max(1, parseInt((request.query as Record<string, string>).count ?? "100", 10)),
      );

      let teams: Array<typeof schema.teams.$inferSelect>;

      if (filter) {
        const parsed = parseScimFilter(filter);
        if (!parsed) {
          return reply.status(400).send(scimError(400, "Unsupported filter syntax"));
        }
        if (parsed.attribute === "displayName") {
          teams = await db.select().from(schema.teams).where(eq(schema.teams.name, parsed.value));
        } else {
          return reply
            .status(400)
            .send(scimError(400, `Unsupported filter attribute: ${parsed.attribute}`));
        }
      } else {
        teams = await db.select().from(schema.teams);
      }

      const totalResults = teams.length;
      const offset = startIndex - 1;
      const paged = teams.slice(offset, offset + count);

      // Fetch members for each team
      const resources: ScimGroup[] = [];
      for (const team of paged) {
        const members = await db
          .select({ id: schema.users.id, username: schema.users.username })
          .from(schema.users)
          .where(eq(schema.users.team, team.id));
        resources.push(toScimGroup(team, members));
      }

      return reply.send(
        scimListResponse(
          resources,
          totalResults,
          startIndex,
          "urn:ietf:params:scim:api:messages:2.0:ListResponse",
        ),
      );
    },
  );

  // PUT /api/v1/scim/v2/Groups/:id -- replace team
  app.put(
    "/api/v1/scim/v2/Groups/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [existing] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));

      if (!existing) {
        return reply.status(404).send(scimError(404, "Group not found"));
      }

      const body = request.body as Record<string, unknown>;
      const displayName = body.displayName as string | undefined;
      const members = body.members as Array<{ value: string }> | undefined;

      if (displayName && displayName !== existing.name) {
        // Check for name conflict
        const [conflict] = await db
          .select()
          .from(schema.teams)
          .where(eq(schema.teams.name, displayName));
        if (conflict && conflict.id !== id) {
          return reply.status(409).send(scimError(409, "Group name already taken"));
        }
        await db.update(schema.teams).set({ name: displayName }).where(eq(schema.teams.id, id));
      }

      // Replace membership: remove all current members, add new ones
      if (members !== undefined) {
        // Find the default team to move removed members to
        const [defaultTeam] = await db
          .select()
          .from(schema.teams)
          .where(eq(schema.teams.name, "Default"));
        const fallbackTeamId = defaultTeam?.id ?? "default-team-00000000";

        // Move current members out of this team
        await db
          .update(schema.users)
          .set({ team: fallbackTeamId, updatedAt: new Date() })
          .where(eq(schema.users.team, id));

        // Add new members
        for (const member of members) {
          await db
            .update(schema.users)
            .set({ team: id, updatedAt: new Date() })
            .where(eq(schema.users.id, member.value));
        }
      }

      const [updatedTeam] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
      const teamMembers = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.team, id));

      await auditLog(
        request.log,
        "SCIM_GROUP_SYNCED",
        {
          teamId: id,
          teamName: updatedTeam.name,
          action: "replaced",
          memberCount: teamMembers.length,
        },
        request.ip,
        request.id,
      );

      return reply.send(toScimGroup(updatedTeam, teamMembers));
    },
  );

  // PATCH /api/v1/scim/v2/Groups/:id -- update members
  app.patch(
    "/api/v1/scim/v2/Groups/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [existing] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));

      if (!existing) {
        return reply.status(404).send(scimError(404, "Group not found"));
      }

      const body = request.body as {
        schemas?: string[];
        Operations?: Array<{
          op: string;
          path?: string;
          value?: unknown;
        }>;
      };

      const operations = body.Operations ?? [];

      for (const op of operations) {
        const opType = op.op.toLowerCase();

        if (opType === "add" && op.path === "members") {
          const members = Array.isArray(op.value)
            ? (op.value as Array<{ value: string }>)
            : [op.value as { value: string }];
          for (const member of members) {
            await db
              .update(schema.users)
              .set({ team: id, updatedAt: new Date() })
              .where(eq(schema.users.id, member.value));
          }
        } else if (opType === "remove" && op.path) {
          // Parse path like: members[value eq "userId"]
          const memberMatch = op.path.match(/^members\[value\s+eq\s+"([^"]+)"\]$/i);
          if (memberMatch) {
            const userId = memberMatch[1];
            // Move removed member to default team
            const [defaultTeam] = await db
              .select()
              .from(schema.teams)
              .where(eq(schema.teams.name, "Default"));
            const fallbackTeamId = defaultTeam?.id ?? "default-team-00000000";
            await db
              .update(schema.users)
              .set({ team: fallbackTeamId, updatedAt: new Date() })
              .where(and(eq(schema.users.id, userId), eq(schema.users.team, id)));
          }
        } else if (opType === "replace") {
          if (op.path === "displayName") {
            const newName = op.value as string;
            if (newName) {
              await db.update(schema.teams).set({ name: newName }).where(eq(schema.teams.id, id));
            }
          } else if (op.path === "members") {
            // Full member replacement
            const members = Array.isArray(op.value) ? (op.value as Array<{ value: string }>) : [];
            const [defaultTeam] = await db
              .select()
              .from(schema.teams)
              .where(eq(schema.teams.name, "Default"));
            const fallbackTeamId = defaultTeam?.id ?? "default-team-00000000";

            // Remove all current members
            await db
              .update(schema.users)
              .set({ team: fallbackTeamId, updatedAt: new Date() })
              .where(eq(schema.users.team, id));

            // Add new members
            for (const member of members) {
              await db
                .update(schema.users)
                .set({ team: id, updatedAt: new Date() })
                .where(eq(schema.users.id, member.value));
            }
          }
        }
      }

      const [updatedTeam] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
      const teamMembers = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.team, id));

      await auditLog(
        request.log,
        "SCIM_GROUP_SYNCED",
        {
          teamId: id,
          teamName: updatedTeam.name,
          action: "patched",
          memberCount: teamMembers.length,
        },
        request.ip,
        request.id,
      );

      return reply.send(toScimGroup(updatedTeam, teamMembers));
    },
  );

  // DELETE /api/v1/scim/v2/Groups/:id -- delete team
  app.delete(
    "/api/v1/scim/v2/Groups/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await scimAuth(request, reply))) return;
      if (!(await requireScimFeature(reply))) return;

      const { id } = request.params;
      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));

      if (!team) {
        return reply.status(404).send(scimError(404, "Group not found"));
      }

      // Move members to default team
      const [defaultTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"));
      const fallbackTeamId = defaultTeam?.id ?? "default-team-00000000";

      await db
        .update(schema.users)
        .set({ team: fallbackTeamId, updatedAt: new Date() })
        .where(eq(schema.users.team, id));

      // Delete the team
      await db.delete(schema.teams).where(eq(schema.teams.id, id));

      await auditLog(
        request.log,
        "SCIM_GROUP_SYNCED",
        {
          teamId: id,
          teamName: team.name,
          action: "deleted",
        },
        request.ip,
        request.id,
      );

      return reply.status(204).send();
    },
  );

  app.log.info("Enterprise SCIM 2.0 routes registered");
}

// ── SCIM Schema Definitions ──────────────────────────────────────

function userSchema() {
  return {
    id: "urn:ietf:params:scim:schemas:core:2.0:User",
    name: "User",
    description: "User Account",
    attributes: [
      {
        name: "userName",
        type: "string",
        multiValued: false,
        required: true,
        mutability: "readWrite",
        uniqueness: "server",
      },
      {
        name: "emails",
        type: "complex",
        multiValued: true,
        required: false,
        mutability: "readWrite",
        subAttributes: [
          { name: "value", type: "string", mutability: "readWrite" },
          { name: "primary", type: "boolean", mutability: "readWrite" },
        ],
      },
      {
        name: "name",
        type: "complex",
        multiValued: false,
        required: false,
        mutability: "readWrite",
        subAttributes: [{ name: "formatted", type: "string", mutability: "readWrite" }],
      },
      {
        name: "active",
        type: "boolean",
        multiValued: false,
        required: false,
        mutability: "readWrite",
      },
      {
        name: "externalId",
        type: "string",
        multiValued: false,
        required: false,
        mutability: "readWrite",
      },
      {
        name: "groups",
        type: "complex",
        multiValued: true,
        required: false,
        mutability: "readOnly",
        subAttributes: [
          { name: "value", type: "string", mutability: "readOnly" },
          { name: "display", type: "string", mutability: "readOnly" },
        ],
      },
    ],
    meta: {
      resourceType: "Schema",
      location: "/api/v1/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
    },
  };
}

function groupSchema() {
  return {
    id: "urn:ietf:params:scim:schemas:core:2.0:Group",
    name: "Group",
    description: "Group",
    attributes: [
      {
        name: "displayName",
        type: "string",
        multiValued: false,
        required: true,
        mutability: "readWrite",
      },
      {
        name: "members",
        type: "complex",
        multiValued: true,
        required: false,
        mutability: "readWrite",
        subAttributes: [
          { name: "value", type: "string", mutability: "readWrite" },
          { name: "display", type: "string", mutability: "readOnly" },
        ],
      },
    ],
    meta: {
      resourceType: "Schema",
      location: "/api/v1/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group",
    },
  };
}
