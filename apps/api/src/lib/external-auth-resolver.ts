import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db, schema } from "../db/index.js";
import { isDisabledRole } from "../permissions.js";
import { auditLog, sanitizeAuditInput } from "./audit.js";
import { userLimitReached } from "./user-limit.js";

// ── Types ─────────────────────────────────────────────────────────

export interface ExternalAuthParams {
  provider: string; // "oidc" or "saml"
  externalId: string; // OIDC sub or SAML NameID
  email?: string;
  emailVerified?: boolean;
  username: string; // derived/sanitized username
  autoCreate: boolean;
  autoLink: boolean;
  defaultRole: string;
  logger: FastifyBaseLogger;
  ip: string;
  requestId: string;
}

export interface ExternalAuthResult {
  user: { id: string; username: string; role: string; team: string } | null;
  action: "matched" | "linked" | "created" | "denied";
  deniedReason?: "user_not_authorized" | "user_limit_reached" | "user_disabled";
}

/**
 * Auto-create lost the username race on every retry. The SSO callbacks catch
 * this one type and turn it into a login failure (issue #978); any other
 * throw out of the resolver is a fault and keeps surfacing as one.
 */
export class UsernameRaceExhaustedError extends Error {
  constructor(provider: string, username: string, attempts: number) {
    super(`${provider} auto-create lost the username race ${attempts} times for "${username}"`);
    this.name = "UsernameRaceExhaustedError";
  }
}

// ── Username helpers ──────────────────────────────────────────────

export function sanitizeUsername(raw: string): string {
  let sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");

  // Enforce 3-50 char limit (truncate to 46 to leave room for collision suffix)
  if (sanitized.length > 46) {
    sanitized = sanitized.slice(0, 46);
  }
  if (sanitized.length < 3) {
    sanitized = sanitized.padEnd(3, "_");
  }

  return sanitized;
}

export async function findUniqueUsername(base: string): Promise<string> {
  const [existing] = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.username, base));

  if (!existing) return base;

  for (let i = 2; i <= 1000; i++) {
    const candidate = `${base}_${i}`;
    const [taken] = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.username, candidate));
    if (!taken) return candidate;
  }

  // Extremely unlikely fallback
  return `${base}_${Date.now()}`;
}

// ── Resolver ─────────────────────────────────────────────────────

export async function resolveExternalUser(params: ExternalAuthParams): Promise<ExternalAuthResult> {
  const {
    provider,
    externalId,
    email,
    emailVerified,
    username,
    autoCreate,
    autoLink,
    defaultRole,
    logger,
    ip,
    requestId,
  } = params;

  const providerUpper = provider.toUpperCase();

  const audit = (event: string, details: Record<string, unknown> = {}) =>
    auditLog(logger, event, details, ip, requestId);

  // 1. Match by externalId
  const [existingByExtId] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.externalId, externalId), eq(schema.users.authProvider, provider)))
    .limit(1);

  if (existingByExtId) {
    if (isDisabledRole(existingByExtId.role)) {
      await audit(`${providerUpper}_LOGIN_FAILED`, {
        reason: "user_disabled",
        userId: existingByExtId.id,
      });
      return { user: null, action: "denied", deniedReason: "user_disabled" };
    }

    // Update email if changed
    if (email && email !== existingByExtId.email) {
      await db
        .update(schema.users)
        .set({ email, updatedAt: new Date() })
        .where(eq(schema.users.id, existingByExtId.id));
    }
    return {
      user: {
        id: existingByExtId.id,
        username: existingByExtId.username,
        role: existingByExtId.role,
        team: existingByExtId.team,
      },
      action: "matched",
    };
  }

  // 2. Auto-link by email. Nothing makes email unique, so when several rows
  // carry it the pick has to be deterministic: two logins of one identity
  // racing here must land on the same row, or the second one's link would
  // trip the (auth_provider, external_id) index (issue #969). Oldest wins.
  if (autoLink && email && emailVerified) {
    const [existingByEmail] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .orderBy(asc(schema.users.createdAt), asc(schema.users.id))
      .limit(1);

    if (existingByEmail) {
      if (isDisabledRole(existingByEmail.role)) {
        await audit(`${providerUpper}_LOGIN_FAILED`, {
          reason: "user_disabled",
          userId: existingByEmail.id,
        });
        return { user: null, action: "denied", deniedReason: "user_disabled" };
      }

      await db
        .update(schema.users)
        .set({
          externalId,
          authProvider: provider,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existingByEmail.id));

      await audit(`${providerUpper}_USER_LINKED`, {
        userId: existingByEmail.id,
        username: existingByEmail.username,
        email,
      });

      return {
        user: {
          id: existingByEmail.id,
          username: existingByEmail.username,
          role: existingByEmail.role,
          team: existingByEmail.team,
        },
        action: "linked",
      };
    }
  }

  // 3. Auto-create
  if (autoCreate) {
    if (isDisabledRole(defaultRole)) {
      logger.warn(`${provider} auto-create blocked: default role is disabled`);
      await audit(`${providerUpper}_LOGIN_FAILED`, {
        reason: "user_disabled",
      });
      return { user: null, action: "denied", deniedReason: "user_disabled" };
    }

    // The username scan can't close the race: two concurrent logins both
    // pass it before either insert commits (issue #927), so the insert
    // carries a conflict guard and the loser recovers below. The guard is
    // unqualified on purpose: it has to cover both the username constraint
    // and the (auth_provider, external_id) index that refuses a second
    // account for one identity (issue #969). The only other constraint on
    // the table is the primary key, on a fresh UUID.
    const MAX_USERNAME_RACE_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_USERNAME_RACE_RETRIES; attempt++) {
      const uniqueUsername = await findUniqueUsername(username);
      const newUserId = randomUUID();

      // Look up the default team
      const [defaultTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"));
      const teamId = defaultTeam?.id ?? "default-team-00000000";

      // A plain count check can't enforce MAX_USERS either: two concurrent
      // auto-creates both pass it before their inserts commit (issue #928).
      // The locked count and the guarded insert share one transaction so the
      // loser sees the winner's committed row.
      const inserted = await db.transaction(async (tx) => {
        if (await userLimitReached(tx)) return "limit" as const;
        return tx
          .insert(schema.users)
          .values({
            id: newUserId,
            username: uniqueUsername,
            passwordHash: null,
            role: defaultRole,
            team: teamId,
            mustChangePassword: false,
            authProvider: provider,
            externalId,
            email: email ?? null,
          })
          .onConflictDoNothing();
      });

      if (inserted !== "limit" && inserted.rowCount) {
        await audit(`${providerUpper}_USER_CREATED`, {
          userId: newUserId,
          username: uniqueUsername,
          email,
          role: defaultRole,
        });

        return {
          user: {
            id: newUserId,
            username: uniqueUsername,
            role: defaultRole,
            team: teamId,
          },
          action: "created",
        };
      }

      if (inserted !== "limit") {
        // The guard is unqualified, so this does not say which constraint
        // refused: the username (issue #927) or the identity (issue #969).
        logger.info(
          { attempt: attempt + 1, username: uniqueUsername },
          `${provider} auto-create refused by a unique constraint (username or identity), recovering`,
        );
      }

      // Create refused: the username raced (issue #927), this identity
      // already has its row (issue #969), or the cap is reached (issue
      // #928). In each case this same external identity may have just won
      // a concurrent login (say, two tabs finishing first login at once);
      // hand back the winner's user instead of failing it.
      const [winner] = await db
        .select()
        .from(schema.users)
        .where(
          and(eq(schema.users.externalId, externalId), eq(schema.users.authProvider, provider)),
        )
        .limit(1);

      if (winner) {
        if (isDisabledRole(winner.role)) {
          await audit(`${providerUpper}_LOGIN_FAILED`, {
            reason: "user_disabled",
            userId: winner.id,
          });
          return { user: null, action: "denied", deniedReason: "user_disabled" };
        }
        return {
          user: { id: winner.id, username: winner.username, role: winner.role, team: winner.team },
          action: "matched",
        };
      }

      if (inserted === "limit") {
        logger.warn(`${provider} auto-create blocked: user limit reached`);
        return { user: null, action: "denied", deniedReason: "user_limit_reached" };
      }
      // A different user took the name; rescan and retry.
    }

    throw new UsernameRaceExhaustedError(provider, username, MAX_USERNAME_RACE_RETRIES);
  }

  // 4. Denied: no matching user, auto-link did not match, auto-create disabled
  logger.warn({ externalId, email }, `${provider} user not authorized`);
  await audit(`${providerUpper}_LOGIN_FAILED`, {
    reason: "user_not_authorized",
    externalId: sanitizeAuditInput(String(externalId)),
  });

  return { user: null, action: "denied", deniedReason: "user_not_authorized" };
}
