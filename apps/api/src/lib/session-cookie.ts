import { asc, eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { type db, schema } from "../db/index.js";
import { isSecureRequest } from "./secure-cookie.js";
import { getSettingStrict, parseNumericSettingValue } from "./settings-helpers.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Advisory lock namespace for per-user session eviction (`pg_advisory_xact_lock(int4, int4)`).
 * Scoped per user via `hashtext(userId)` as the second key so concurrent logins for
 * different users never contend (#3025).
 */
const SESSION_EVICT_LOCK_NAMESPACE = 7_421_005;

/**
 * Sets the `snapotter-session` cookie that a browser session rides on, the way
 * a password login does. Every route that hands a session token back in a
 * response body sets it too, so the page can lose its stored copy of the token
 * (a full localStorage) and stay signed in (#2053).
 */
export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  const cookieReply = reply as FastifyReply & {
    setCookie?: (name: string, value: string, opts: Record<string, unknown>) => FastifyReply;
  };
  if (typeof cookieReply.setCookie !== "function") return;
  cookieReply.setCookie("snapotter-session", token, {
    path: `${env.BASE_PATH}/`,
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    maxAge: env.SESSION_DURATION_HOURS * 3600,
  });
}

/**
 * Read `maxSessionsPerUser` strictly before opening a session-creation
 * transaction so a failed settings query aborts with 500 instead of falling
 * back to `0` (unlimited) or leaving an un-evicted session row (#2517, #2540).
 */
export async function readMaxSessionsPerUser(): Promise<number> {
  return parseNumericSettingValue(
    "maxSessionsPerUser",
    await getSettingStrict("maxSessionsPerUser"),
    0,
  );
}

/**
 * Evict a user's oldest sessions in `createdAt` order inside the session-insert
 * transaction when `maxSessions` is positive and the user's session count
 * exceeds the cap (#2517, #2540, #3025).
 *
 * Takes a per-user transaction advisory lock before reading `schema.sessions`
 * so concurrent logins for the same user under `READ COMMITTED` serialize their
 * count-and-evict pass, and keeps `currentSessionId` last when breaking
 * same-millisecond `createdAt` ties.
 */
export async function evictExcessUserSessions(
  tx: Tx,
  userId: string,
  maxSessions: number,
  currentSessionId: string,
): Promise<void> {
  if (maxSessions <= 0) return;

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${SESSION_EVICT_LOCK_NAMESPACE}, hashtext(${userId}))`,
  );

  const sessions = await tx
    .select({ id: schema.sessions.id, createdAt: schema.sessions.createdAt })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(asc(schema.sessions.createdAt));

  if (sessions.length > maxSessions) {
    const ordered = [
      ...sessions.filter((s) => s.id !== currentSessionId),
      ...sessions.filter((s) => s.id === currentSessionId),
    ];
    const toDelete = ordered.slice(0, ordered.length - maxSessions);
    for (const s of toDelete) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.id, s.id));
    }
  }
}
