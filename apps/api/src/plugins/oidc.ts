import { randomUUID } from "node:crypto";
import type {} from "@fastify/cookie";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as oidc from "openid-client";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditLog, sanitizeAuditInput } from "../lib/audit.js";
import { createSessionToken } from "./auth.js";

// ── Types ─────────────────────────────────────────────────────────

interface OidcStateCookie {
  state: string;
  nonce: string;
  codeVerifier: string;
}

// ── Lazy Discovery Cache ──────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedConfig: { config: oidc.Configuration; cachedAt: number } | null = null;

async function getOrDiscoverConfig(): Promise<oidc.Configuration> {
  if (cachedConfig && Date.now() - cachedConfig.cachedAt < CACHE_TTL_MS) {
    return cachedConfig.config;
  }

  const issuerUrl = new URL(env.OIDC_ISSUER_URL);
  const config = await oidc.discovery(
    issuerUrl,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
    undefined,
    {
      execute: isSecure() ? undefined : [oidc.allowInsecureRequests],
    },
  );

  cachedConfig = { config, cachedAt: Date.now() };
  return config;
}

/**
 * Returns the cached end_session_endpoint for RP-initiated logout,
 * or null if OIDC discovery has not been completed yet.
 */
export function getOidcEndSessionEndpoint(): string | null {
  if (!cachedConfig) return null;
  const metadata = cachedConfig.config.serverMetadata();
  return metadata.end_session_endpoint ?? null;
}

// ── Username helpers ──────────────────────────────────────────────

function deriveUsername(claims: Record<string, unknown>): string {
  const claimKey = env.OIDC_USERNAME_CLAIM;

  // 1. Try the configured claim
  if (claimKey && typeof claims[claimKey] === "string" && (claims[claimKey] as string).length > 0) {
    return claims[claimKey] as string;
  }

  // 2. Try preferred_username (if different from configured claim)
  if (
    claimKey !== "preferred_username" &&
    typeof claims.preferred_username === "string" &&
    claims.preferred_username.length > 0
  ) {
    return claims.preferred_username;
  }

  // 3. Email local part
  if (typeof claims.email === "string" && claims.email.includes("@")) {
    return claims.email.split("@")[0];
  }

  // 4. Name
  if (typeof claims.name === "string" && claims.name.length > 0) {
    return claims.name;
  }

  // 5. Subject (always present)
  return claims.sub as string;
}

function sanitizeUsername(raw: string): string {
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

function findUniqueUsername(base: string): string {
  const existing = db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.username, base))
    .get();

  if (!existing) return base;

  for (let i = 2; i <= 1000; i++) {
    const candidate = `${base}_${i}`;
    const taken = db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.username, candidate))
      .get();
    if (!taken) return candidate;
  }

  // Extremely unlikely fallback
  return `${base}_${Date.now()}`;
}

// ── Helpers ───────────────────────────────────────────────────────

function isSecure(): boolean {
  return env.EXTERNAL_URL.startsWith("https");
}

const SESSION_DURATION_MS = env.SESSION_DURATION_HOURS * 60 * 60 * 1000;

function redirectToLogin(reply: FastifyReply, errorCode: string): void {
  reply.redirect(`/login?error=${errorCode}`);
}

// ── OIDC Routes ───────────────────────────────────────────────────

export async function oidcRoutes(app: FastifyInstance): Promise<void> {
  if (!env.OIDC_ENABLED) return;

  // GET /api/auth/oidc/login
  app.get("/api/auth/oidc/login", async (request: FastifyRequest, reply: FastifyReply) => {
    let config: oidc.Configuration;
    try {
      config = await getOrDiscoverConfig();
    } catch (err) {
      request.log.error({ err }, "OIDC discovery failed");
      return redirectToLogin(reply, "oidc_provider_unreachable");
    }

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectUri = `${env.EXTERNAL_URL}/api/auth/oidc/callback`;

    // Store OIDC state in a signed cookie
    const statePayload: OidcStateCookie = { state, nonce, codeVerifier };
    const cookieValue = reply.signCookie(JSON.stringify(statePayload));

    reply.setCookie("oidc-state", cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure(),
      path: "/api/auth/oidc",
      maxAge: 600, // 10 minutes
      signed: false, // already signed manually
    });

    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: env.OIDC_SCOPES,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return reply.redirect(authorizationUrl.href);
  });

  // GET /api/auth/oidc/callback
  app.get("/api/auth/oidc/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate state from signed cookie
    const rawCookie = request.cookies?.["oidc-state"];
    if (!rawCookie) {
      request.log.warn("OIDC callback: missing state cookie");
      return redirectToLogin(reply, "oidc_session_expired");
    }

    // Clear the cookie immediately
    reply.clearCookie("oidc-state", {
      path: "/api/auth/oidc",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure(),
    });

    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      request.log.warn("OIDC callback: invalid cookie signature");
      return redirectToLogin(reply, "oidc_session_expired");
    }

    let storedState: OidcStateCookie;
    try {
      storedState = JSON.parse(unsigned.value) as OidcStateCookie;
    } catch {
      request.log.warn("OIDC callback: malformed state cookie");
      return redirectToLogin(reply, "oidc_session_expired");
    }

    // Validate state parameter matches
    const query = request.query as Record<string, string>;
    if (query.state !== storedState.state) {
      request.log.warn("OIDC callback: state mismatch");
      return redirectToLogin(reply, "oidc_session_expired");
    }

    // Check for error response from the IdP
    if (query.error) {
      request.log.warn(
        { error: query.error, description: query.error_description },
        "OIDC IdP returned error",
      );
      auditLog(request.log, "OIDC_LOGIN_FAILED", {
        reason: sanitizeAuditInput(String(query.error)),
      });
      return redirectToLogin(reply, "oidc_auth_failed");
    }

    // 2. Exchange authorization code for tokens
    let config: oidc.Configuration;
    try {
      config = await getOrDiscoverConfig();
    } catch (err) {
      request.log.error({ err }, "OIDC discovery failed during callback");
      return redirectToLogin(reply, "oidc_provider_unreachable");
    }

    let tokenResponse: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      const callbackUrl = new URL(`${env.EXTERNAL_URL}/api/auth/oidc/callback`);
      // Copy the query parameters from the actual request
      for (const [key, value] of Object.entries(query)) {
        callbackUrl.searchParams.set(key, value);
      }

      tokenResponse = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: storedState.codeVerifier,
        expectedNonce: storedState.nonce,
        expectedState: storedState.state,
      });
    } catch (err) {
      request.log.error({ err }, "OIDC token exchange failed");
      auditLog(request.log, "OIDC_LOGIN_FAILED", { reason: "token_exchange_failed" });
      return redirectToLogin(reply, "oidc_auth_failed");
    }

    // 3. Extract claims from ID token
    const claims = tokenResponse.claims();
    if (!claims) {
      request.log.error("OIDC callback: no ID token claims");
      auditLog(request.log, "OIDC_LOGIN_FAILED", { reason: "no_id_token" });
      return redirectToLogin(reply, "oidc_auth_failed");
    }

    const sub = claims.sub;
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const emailVerified = claims.email_verified === true;
    const rawUsername = deriveUsername(claims as Record<string, unknown>);
    const username = sanitizeUsername(rawUsername);
    const idToken = tokenResponse.id_token ?? null;

    // 4. User resolution
    let userId: string | null = null;

    // 4a. Find by externalId (OIDC subject)
    const existingByExtId = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.externalId, sub))
      .get();

    if (existingByExtId) {
      userId = existingByExtId.id;
      // Update email if changed
      if (email && email !== existingByExtId.email) {
        db.update(schema.users)
          .set({ email, updatedAt: new Date() })
          .where(eq(schema.users.id, existingByExtId.id))
          .run();
      }
    }

    // 4b. Auto-link: match by email
    if (!userId && env.OIDC_AUTO_LINK_USERS && email && emailVerified) {
      const existingByEmail = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .get();

      if (existingByEmail) {
        db.update(schema.users)
          .set({
            externalId: sub,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, existingByEmail.id))
          .run();
        userId = existingByEmail.id;
        auditLog(request.log, "OIDC_USER_LINKED", {
          userId: existingByEmail.id,
          username: existingByEmail.username,
          email,
        });
      }
    }

    // 4c. Auto-create
    if (!userId && env.OIDC_AUTO_CREATE_USERS) {
      // Check user limit
      if (env.MAX_USERS > 0) {
        const countResult = db.select({ count: sql<number>`COUNT(*)` }).from(schema.users).get();
        if (countResult && countResult.count >= env.MAX_USERS) {
          request.log.warn("OIDC auto-create blocked: user limit reached");
          return redirectToLogin(reply, "oidc_user_limit_reached");
        }
      }

      const uniqueUsername = findUniqueUsername(username);
      const newUserId = randomUUID();

      // Look up the default team
      const defaultTeam = db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"))
        .get();
      const teamId = defaultTeam?.id ?? "default-team-00000000";

      db.insert(schema.users)
        .values({
          id: newUserId,
          username: uniqueUsername,
          passwordHash: null,
          role: env.OIDC_DEFAULT_ROLE,
          team: teamId,
          mustChangePassword: false,
          authProvider: "oidc",
          externalId: sub,
          email: email ?? null,
        })
        .run();

      userId = newUserId;
      auditLog(request.log, "OIDC_USER_CREATED", {
        userId: newUserId,
        username: uniqueUsername,
        email,
        role: env.OIDC_DEFAULT_ROLE,
      });
    }

    // 4d. No user found and no auto-create
    if (!userId) {
      request.log.warn({ sub, email }, "OIDC user not authorized");
      auditLog(request.log, "OIDC_LOGIN_FAILED", {
        reason: "user_not_authorized",
        sub: sanitizeAuditInput(String(sub)),
      });
      return redirectToLogin(reply, "oidc_user_not_authorized");
    }

    // 5. Create session
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    db.insert(schema.sessions)
      .values({
        id: token,
        userId,
        expiresAt,
        idToken,
      })
      .run();

    // Fetch the user for audit logging
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();

    auditLog(request.log, "OIDC_LOGIN_SUCCESS", {
      userId,
      username: user?.username ?? username,
    });

    // 6. Set session cookie
    reply.setCookie("snapotter-session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: isSecure(),
      path: "/",
      maxAge: env.SESSION_DURATION_HOURS * 3600,
    });

    // 7. Redirect to app
    return reply.redirect("/");
  });
}
