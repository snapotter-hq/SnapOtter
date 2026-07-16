import { randomUUID } from "node:crypto";
import type {} from "@fastify/cookie";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as oidc from "openid-client";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { sharedRedis } from "../jobs/connection.js";
import { auditFromRequest, sanitizeAuditInput } from "../lib/audit.js";
import { resolveExternalUser, sanitizeUsername } from "../lib/external-auth-resolver.js";
import { authAttempts } from "../lib/metrics.js";
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
  app.get(
    "/api/auth/oidc/login",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
  );

  // GET /api/auth/oidc/callback
  app.get(
    "/api/auth/oidc/callback",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
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

      const audit = auditFromRequest(request);

      // Check for error response from the IdP
      if (query.error) {
        request.log.warn(
          { error: query.error, description: query.error_description },
          "OIDC IdP returned error",
        );
        authAttempts.inc({ method: "oidc", result: "failure" });
        await audit("OIDC_LOGIN_FAILED", {
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
        authAttempts.inc({ method: "oidc", result: "failure" });
        await audit("OIDC_LOGIN_FAILED", { reason: "token_exchange_failed" });
        return redirectToLogin(reply, "oidc_auth_failed");
      }

      // 3. Extract claims from ID token
      const claims = tokenResponse.claims();
      if (!claims) {
        request.log.error("OIDC callback: no ID token claims");
        authAttempts.inc({ method: "oidc", result: "failure" });
        await audit("OIDC_LOGIN_FAILED", { reason: "no_id_token" });
        return redirectToLogin(reply, "oidc_auth_failed");
      }

      const sub = claims.sub;
      const email = typeof claims.email === "string" ? claims.email : undefined;
      const emailVerified = claims.email_verified === true;
      const rawUsername = deriveUsername(claims as Record<string, unknown>);
      const derivedUsername = sanitizeUsername(rawUsername);
      const idToken = tokenResponse.id_token ?? null;

      // 4. User resolution (delegated to shared resolver)
      const result = await resolveExternalUser({
        provider: "oidc",
        externalId: sub,
        email,
        emailVerified,
        username: derivedUsername,
        autoCreate: env.OIDC_AUTO_CREATE_USERS,
        autoLink: env.OIDC_AUTO_LINK_USERS,
        defaultRole: env.OIDC_DEFAULT_ROLE,
        logger: request.log,
        ip: request.ip,
        requestId: request.id,
      });

      if (result.action === "denied" || !result.user) {
        authAttempts.inc({ method: "oidc", result: "failure" });
        if (result.deniedReason === "user_limit_reached") {
          return redirectToLogin(reply, "oidc_user_limit_reached");
        }
        return redirectToLogin(reply, "oidc_user_not_authorized");
      }

      const resolvedUser = result.user;

      // Unguarded on purpose: this read decides whether MFA gets checked at
      // all, so a DB error here must fail the login, not silently skip MFA
      // for an enrolled user. The try/catch below is scoped only to the
      // optional MFA plugin/policy lookup, same as it always was.
      let dbUser: { totpEnabled: boolean } | undefined;
      try {
        [dbUser] = await db
          .select({ totpEnabled: schema.users.totpEnabled })
          .from(schema.users)
          .where(eq(schema.users.id, resolvedUser.id));
      } catch (err) {
        request.log.error(
          { err, userId: resolvedUser.id },
          "OIDC callback: failed to read MFA enrollment status",
        );
        authAttempts.inc({ method: "oidc", result: "failure" });
        await audit("OIDC_LOGIN_FAILED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
          reason: "mfa_check_error",
        });
        return redirectToLogin(reply, "oidc_auth_failed");
      }

      let mfaOutcome: "proceed" | "challenge" | "enrollment_required" = "proceed";
      try {
        const { getMfaPolicy, resolveExternalLoginMfaOutcome } = await import("./mfa.js");
        const policy = await getMfaPolicy();
        mfaOutcome = resolveExternalLoginMfaOutcome(
          policy,
          resolvedUser.role,
          dbUser?.totpEnabled ?? false,
        );
      } catch {
        // MFA plugin not loaded
      }

      if (mfaOutcome === "challenge") {
        const mfaToken = randomUUID();
        const redis = sharedRedis();
        await redis.setex(`mfa:${mfaToken}`, 300, resolvedUser.id);
        await audit("MFA_CHALLENGE_ISSUED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
        });
        return reply.redirect(`/login?mfaToken=${mfaToken}`);
      }

      if (mfaOutcome === "enrollment_required") {
        authAttempts.inc({ method: "oidc", result: "failure" });
        await audit("OIDC_LOGIN_FAILED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
          reason: "mfa_enrollment_required",
        });
        return redirectToLogin(reply, "mfa_enrollment_required");
      }

      // 5. Create session
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await db.insert(schema.sessions).values({
        id: token,
        userId: resolvedUser.id,
        expiresAt,
        idToken,
      });

      authAttempts.inc({ method: "oidc", result: "success" });
      await audit("OIDC_LOGIN_SUCCESS", {
        userId: resolvedUser.id,
        username: resolvedUser.username,
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
    },
  );
}
