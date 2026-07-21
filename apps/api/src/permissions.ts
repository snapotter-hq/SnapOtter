import type { Permission, Role } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "./db/index.js";
import { type AuthUser, getAuthUser } from "./plugins/auth.js";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
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
  ],
  editor: [
    "tools:use",
    "files:own",
    "files:all",
    "apikeys:own",
    "pipelines:own",
    "pipelines:all",
    "settings:read",
  ],
  user: ["tools:use", "files:own", "apikeys:own", "pipelines:own", "settings:read"],
};

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  editor: 2,
  user: 1,
};

export interface RoleToolPermissions {
  mode: string;
  allowed: string[];
}

interface ValidRoleToolPermissions extends RoleToolPermissions {
  mode: "category" | "tool";
}

interface RoleDefinition {
  permissions: Permission[];
  toolPermissions: ValidRoleToolPermissions | null;
}

function isValidRoleToolPermissions(value: unknown): value is ValidRoleToolPermissions | null {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === "category" || candidate.mode === "tool") &&
    Array.isArray(candidate.allowed) &&
    candidate.allowed.every((allowed) => typeof allowed === "string")
  );
}

async function getRoleDefinition(role: string): Promise<RoleDefinition | null> {
  if (isDisabledRole(role)) return null;
  if (role in ROLE_PERMISSIONS) {
    return {
      permissions: ROLE_PERMISSIONS[role as Role],
      toolPermissions: null,
    };
  }

  try {
    const [customRole] = await db
      .select({
        permissions: schema.roles.permissions,
        toolPermissions: schema.roles.toolPermissions,
      })
      .from(schema.roles)
      .where(eq(schema.roles.name, role))
      .limit(1);
    if (!customRole) return null;
    if (!isValidRoleToolPermissions(customRole.toolPermissions)) return null;

    return {
      permissions: customRole.permissions as Permission[],
      toolPermissions: customRole.toolPermissions,
    };
  } catch {
    // Fail closed when role data is unavailable.
    return null;
  }
}

export async function getPermissions(role: Role | string): Promise<Permission[]> {
  if (typeof role !== "string") return [];
  return (await getRoleDefinition(role))?.permissions ?? [];
}

export async function hasPermission(role: Role | string, permission: Permission): Promise<boolean> {
  return (await getPermissions(role)).includes(permission);
}

export async function hasEffectivePermission(
  user: AuthUser,
  permission: Permission,
): Promise<boolean> {
  if (!(await hasPermission(user.role, permission))) return false;
  if (user.apiKeyPermissions) {
    return user.apiKeyPermissions.includes(permission);
  }
  return true;
}

export function isDisabledRole(role: string | null | undefined): boolean {
  return role === "disabled" || role?.startsWith("disabled:") === true;
}

export async function getEffectivePermissions(user: AuthUser): Promise<Permission[]> {
  const rolePermissions = await getPermissions(user.role);
  if (!user.apiKeyPermissions) return rolePermissions;

  const scoped = new Set(user.apiKeyPermissions);
  return rolePermissions.filter((permission) => scoped.has(permission));
}

export async function permissionsNotHeldBy(
  user: AuthUser,
  requestedPermissions: string[],
): Promise<string[]> {
  const effectivePermissions = new Set(await getEffectivePermissions(user));
  return requestedPermissions.filter(
    (permission) => !effectivePermissions.has(permission as Permission),
  );
}

function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role as Role] ?? 0;
}

function normalizeManagedRole(role: string): string {
  let managedRole = role;
  while (managedRole.startsWith("disabled:")) {
    managedRole = managedRole.slice("disabled:".length);
  }

  // Legacy bare markers and malformed empty/nested markers have lost their
  // original authority context. Treat them as admin so target checks fail
  // closed for every non-admin actor.
  return managedRole && managedRole !== "disabled" ? managedRole : "admin";
}

async function isPerToolPermissionEnforced(): Promise<boolean> {
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    return isFeatureEnabled("per_tool_permissions");
  } catch {
    return false;
  }
}

async function toolPermissionAllows(
  toolPermissions: RoleToolPermissions | null,
  toolId: string,
  perToolPermissionEnforced: boolean,
): Promise<boolean> {
  if (!toolPermissions) return true;

  if (toolPermissions.mode === "category") {
    const { TOOLS } = await import("@snapotter/shared");
    const tool = TOOLS.find((candidate) => candidate.id === toolId);
    if (!tool) return false;
    return toolPermissions.allowed.includes(tool.modality ?? tool.category);
  }

  if (toolPermissions.mode === "tool") {
    // Preserve the historical graceful degradation behavior: without the
    // enterprise feature, per-tool restrictions behave as unrestricted.
    if (!perToolPermissionEnforced) return true;
    return toolPermissions.allowed.includes(toolId);
  }

  return true;
}

async function isToolScopeContained(
  actorToolPermissions: RoleToolPermissions | null,
  targetToolPermissions: RoleToolPermissions | null,
): Promise<boolean> {
  if (!actorToolPermissions) return true;

  const perToolPermissionEnforced = await isPerToolPermissionEnforced();
  if (actorToolPermissions.mode === "tool" && !perToolPermissionEnforced) return true;
  if (!targetToolPermissions) return false;
  if (targetToolPermissions.mode === "tool" && !perToolPermissionEnforced) return false;

  const actorMode = actorToolPermissions.mode;
  const targetMode = targetToolPermissions.mode;
  const validModes = new Set(["category", "tool"]);
  if (!validModes.has(actorMode)) return true;
  if (!validModes.has(targetMode)) return false;

  if (actorMode === targetMode) {
    const actorAllowed = new Set(actorToolPermissions.allowed);
    return targetToolPermissions.allowed.every((allowed) => actorAllowed.has(allowed));
  }

  // A category grant is open-ended: future tools in that category are also
  // allowed. A finite per-tool allowlist therefore cannot contain it safely.
  if (targetMode === "category") return false;

  const { TOOLS } = await import("@snapotter/shared");
  const actorAllowed = new Set(actorToolPermissions.allowed);
  return targetToolPermissions.allowed.every((toolId) => {
    const tool = TOOLS.find((candidate) => candidate.id === toolId);
    return tool ? actorAllowed.has(tool.modality ?? tool.category) : false;
  });
}

async function canControlRoleDefinition(
  actor: AuthUser,
  targetRole: string,
  targetDefinition: RoleDefinition,
): Promise<boolean> {
  if (isDisabledRole(actor.role)) return false;
  if (getRoleLevel(targetRole) > getRoleLevel(actor.role)) return false;

  const actorDefinition = await getRoleDefinition(actor.role);
  if (!actorDefinition) return false;

  const actorPermissions = new Set(
    actor.apiKeyPermissions
      ? actorDefinition.permissions.filter((permission) =>
          actor.apiKeyPermissions?.includes(permission),
        )
      : actorDefinition.permissions,
  );
  if (!targetDefinition.permissions.every((permission) => actorPermissions.has(permission))) {
    return false;
  }

  if (
    targetDefinition.permissions.includes("tools:use") &&
    !(await isToolScopeContained(actorDefinition.toolPermissions, targetDefinition.toolPermissions))
  ) {
    return false;
  }

  return true;
}

export async function canAssignRole(actor: AuthUser, targetRole: string): Promise<boolean> {
  if (isDisabledRole(targetRole)) return false;
  const targetDefinition = await getRoleDefinition(targetRole);
  if (!targetDefinition || targetDefinition.permissions.length === 0) return false;

  return canControlRoleDefinition(actor, targetRole, targetDefinition);
}

export async function canManageTargetRole(actor: AuthUser, targetRole: string): Promise<boolean> {
  const managedRole = normalizeManagedRole(targetRole);
  const targetDefinition = await getRoleDefinition(managedRole);
  if (!targetDefinition) return false;

  return canManageRoleDefinition(
    actor,
    managedRole,
    targetDefinition.permissions,
    targetDefinition.toolPermissions,
  );
}

export async function canManageRoleDefinition(
  actor: AuthUser,
  targetRole: string,
  permissions: readonly string[],
  toolPermissions: RoleToolPermissions | null,
): Promise<boolean> {
  if (!isValidRoleToolPermissions(toolPermissions)) return false;
  return canControlRoleDefinition(actor, targetRole, {
    permissions: permissions as Permission[],
    toolPermissions,
  });
}

export async function canGrantRoleDefinition(
  actor: AuthUser,
  permissions: readonly string[],
  toolPermissions: RoleToolPermissions | null,
): Promise<boolean> {
  if (!isValidRoleToolPermissions(toolPermissions)) return false;
  return canControlRoleDefinition(actor, "custom", {
    permissions: permissions as Permission[],
    toolPermissions,
  });
}

/**
 * Global authority is reserved for the built-in admin role with its complete
 * effective permission set. API-key scopes are part of the containment check,
 * so a key that omits any admin permission cannot cross this boundary.
 */
export async function isFullEffectiveAdmin(actor: AuthUser): Promise<boolean> {
  if (actor.role !== "admin") return false;
  return canManageTargetRole(actor, "admin");
}

export async function requireFullAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = getAuthUser(request);
  if (!user) {
    reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return null;
  }
  if (!(await isFullEffectiveAdmin(user))) {
    reply.status(403).send({
      error: "Full administrator authority required",
      code: "ESCALATION_DENIED",
    });
    return null;
  }
  return user;
}

export function requirePermission(
  permission: Permission,
): (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getAuthUser(request);
    if (!user) {
      reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
      return null;
    }
    if (!(await hasEffectivePermission(user, permission))) {
      reply.status(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" });
      return null;
    }
    return user;
  };
}

export async function hasToolAccess(role: string, toolId: string): Promise<boolean> {
  const roleDefinition = await getRoleDefinition(role);
  if (!roleDefinition) return false;
  if (!roleDefinition.toolPermissions) return true;

  return toolPermissionAllows(
    roleDefinition.toolPermissions,
    toolId,
    roleDefinition.toolPermissions.mode === "tool" ? await isPerToolPermissionEnforced() : false,
  );
}

export async function hasEffectiveToolAccess(user: AuthUser, toolId: string): Promise<boolean> {
  if (!(await hasEffectivePermission(user, "tools:use"))) return false;
  return hasToolAccess(user.role, toolId);
}

export async function requireToolAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  toolId: string,
): Promise<AuthUser | null> {
  const user = getAuthUser(request);
  if (!user) {
    reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return null;
  }

  if (!(await hasEffectiveToolAccess(user, toolId))) {
    reply.status(403).send({ error: "You don't have permission to use this tool" });
    return null;
  }

  return user;
}

export async function requireOwnershipOrPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceUserId: string | null,
  allPermission: Permission,
) {
  const user = getAuthUser(request);
  if (!user) {
    reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return null;
  }
  if (resourceUserId !== user.id && !(await hasEffectivePermission(user, allPermission))) {
    return null;
  }
  return user;
}
