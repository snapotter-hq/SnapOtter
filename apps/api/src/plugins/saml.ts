import { randomUUID } from "node:crypto";
import { parse as parseQs } from "node:querystring";
import type {} from "@fastify/cookie";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { sharedRedis } from "../jobs/connection.js";
import { auditFromRequest } from "../lib/audit.js";
import { reportError } from "../lib/error-report.js";
import {
  findUniqueUsername,
  resolveExternalUser,
  sanitizeUsername,
} from "../lib/external-auth-resolver.js";
import { authAttempts } from "../lib/metrics.js";
import { makeRedisSamlCacheProvider } from "../lib/saml-cache.js";
import { isSecureRequest } from "../lib/secure-cookie.js";
import { createSessionToken } from "./auth.js";
import type { ExternalMfaOutcome, MfaPolicy } from "./mfa.js";

// -- SAML instance factory ----------------------------------------------------

// One shared, Redis-backed cache so a request id written during the login
// redirect is visible to the callback (each handler builds a fresh SAML
// instance). This is what makes InResponseTo replay protection work.
const samlCacheProvider = makeRedisSamlCacheProvider();

function getSamlInstance(): SAML {
  return new SAML({
    callbackUrl: env.SAML_CALLBACK_URL || `${env.EXTERNAL_URL}/api/auth/saml/callback`,
    entryPoint: env.SAML_IDP_SSO_URL,
    issuer: env.SAML_ENTITY_ID || `${env.EXTERNAL_URL}/api/auth/saml/metadata`,
    idpCert: env.SAML_IDP_CERTIFICATE,
    wantAuthnResponseSigned: true,
    wantAssertionsSigned: true,
    // Bind each SAML Response to the AuthnRequest we issued and consume that id,
    // so a captured, still-signed assertion cannot be replayed to mint a second
    // session. "ifPresent" (not "always") keeps IdP-initiated SSO working, since
    // those responses carry no InResponseTo.
    validateInResponseTo: ValidateInResponseTo.ifPresent,
    cacheProvider: samlCacheProvider,
  });
}

// -- Helpers ------------------------------------------------------------------

const SESSION_DURATION_MS = env.SESSION_DURATION_HOURS * 60 * 60 * 1000;

function redirectToLogin(reply: FastifyReply, errorCode: string): void {
  reply.redirect(`/login?error=${errorCode}`);
}

// -- Plugin registration ------------------------------------------------------

export async function registerSaml(app: FastifyInstance): Promise<void> {
  if (!env.SAML_ENABLED) return;

  let isEnabled = false;
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    isEnabled = isFeatureEnabled("saml_sso");
  } catch {
    // Enterprise package not available
  }

  if (!isEnabled) {
    app.log.warn("SAML is enabled via env but saml_sso enterprise feature is not licensed");
    return;
  }

  // Register form-urlencoded content type parser for the SAML callback.
  // The IdP POSTs the SAML response as application/x-www-form-urlencoded.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const str = typeof body === "string" ? body : (body as Buffer).toString();
        done(null, parseQs(str));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // GET /api/auth/saml/metadata -- SP metadata XML
  app.get("/api/auth/saml/metadata", async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = getSamlInstance();
    const metadata = saml.generateServiceProviderMetadata(null, null);
    return reply.type("application/xml").send(metadata);
  });

  // GET /api/auth/saml/login -- SP-initiated login redirect
  app.get(
    "/api/auth/saml/login",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const saml = getSamlInstance();
        const loginUrl = await saml.getAuthorizeUrlAsync("", undefined, {});
        return reply.redirect(loginUrl);
      } catch (err) {
        _request.log.error({ err }, "SAML login redirect failed");
        return redirectToLogin(reply, "saml_auth_failed");
      }
    },
  );

  // POST /api/auth/saml/callback -- Assertion Consumer Service (ACS)
  app.post(
    "/api/auth/saml/callback",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const saml = getSamlInstance();
      const audit = auditFromRequest(request);

      let profile: Awaited<ReturnType<typeof saml.validatePostResponseAsync>>["profile"];
      try {
        const result = await saml.validatePostResponseAsync(request.body as Record<string, string>);
        profile = result.profile;
      } catch (err) {
        request.log.error({ err }, "SAML assertion validation failed");
        authAttempts.inc({ method: "saml", result: "failure" });
        await audit("SAML_LOGIN_FAILED", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
        return redirectToLogin(reply, "saml_auth_failed");
      }

      if (!profile?.nameID) {
        request.log.warn("SAML callback: no profile or nameID in assertion");
        authAttempts.inc({ method: "saml", result: "failure" });
        await audit("SAML_LOGIN_FAILED", { reason: "missing_profile" });
        return redirectToLogin(reply, "saml_auth_failed");
      }

      // Extract claims from SAML assertion
      const externalId = profile.nameID;
      const email = profile[env.SAML_EMAIL_ATTRIBUTE] as string | undefined;
      const usernameAttr = env.SAML_USERNAME_ATTRIBUTE
        ? (profile[env.SAML_USERNAME_ATTRIBUTE] as string | undefined)
        : undefined;

      // Derive a username from available claims
      const rawUsername = usernameAttr || email?.split("@")[0] || profile.nameID;
      let username = sanitizeUsername(rawUsername);
      username = await findUniqueUsername(username);

      // Resolve user via shared external-auth resolver
      const result = await resolveExternalUser({
        provider: "saml",
        externalId,
        email,
        emailVerified: true, // SAML assertions from a trusted IdP are considered verified
        username,
        autoCreate: env.SAML_AUTO_CREATE_USERS,
        autoLink: env.SAML_AUTO_LINK_USERS,
        defaultRole: env.SAML_DEFAULT_ROLE,
        logger: request.log,
        ip: request.ip,
        requestId: request.id,
      });

      if (result.action === "denied" || !result.user) {
        authAttempts.inc({ method: "saml", result: "failure" });
        const errorParam =
          result.deniedReason === "user_limit_reached"
            ? "saml_user_limit_reached"
            : "saml_user_not_authorized";
        return redirectToLogin(reply, errorParam);
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
          "SAML callback: failed to read MFA enrollment status",
        );
        authAttempts.inc({ method: "saml", result: "failure" });
        await audit("SAML_LOGIN_FAILED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
          reason: "mfa_check_error",
        });
        return redirectToLogin(reply, "saml_auth_failed");
      }

      // Two failures used to share one silent catch here and they want
      // opposite defaults (#815). A missing MFA module keeps the login
      // policy-free (an enrolled user still gets the challenge below). A
      // loaded module whose policy READ fails maps to the "unavailable"
      // sentinel instead: the stored policy may well be "required", so
      // unenrolled users fail closed rather than silently skipping the
      // policy.
      const totpEnabled = dbUser?.totpEnabled ?? false;
      let mfaOutcome: ExternalMfaOutcome = totpEnabled ? "challenge" : "proceed";
      let mfaModule: typeof import("./mfa.js") | undefined;
      try {
        mfaModule = await import("./mfa.js");
      } catch (err) {
        // Unreachable today: index.ts imports mfa.js statically at boot, so a
        // broken module means the server never started. Kept as a guard for a
        // future conditional registration; if it ever fires, logins proceed
        // policy-free, which must never be silent.
        request.log.error(
          { err },
          "SAML callback: MFA module failed to load; proceeding without policy",
        );
      }
      if (mfaModule) {
        let policy: MfaPolicy | "unavailable" = "unavailable";
        try {
          policy = await mfaModule.getMfaPolicy();
        } catch (err) {
          request.log.error(
            { err, userId: resolvedUser.id },
            "SAML callback: failed to read the MFA policy",
          );
          // request.log has no Sentry bridge, and by catching here the error
          // never reaches the global handler's reportError. Report explicitly
          // so a settings fault denying logins is visible in triage.
          void reportError(err, {
            source: "http",
            route: request.routeOptions?.url,
            method: request.method,
            statusCode: 503,
            subsystem: "mfa-policy",
          });
        }
        mfaOutcome = mfaModule.resolveExternalLoginMfaOutcome(
          policy,
          resolvedUser.role,
          totpEnabled,
        );
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
        authAttempts.inc({ method: "saml", result: "failure" });
        await audit("SAML_LOGIN_FAILED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
          reason: "mfa_enrollment_required",
        });
        return redirectToLogin(reply, "mfa_enrollment_required");
      }

      if (mfaOutcome !== "proceed") {
        // "policy_unavailable" today, and by construction any future outcome
        // variant nobody wires up here: only an explicit "proceed" reaches
        // session creation, so drift fails closed instead of recreating
        // #815's fail-open.
        authAttempts.inc({ method: "saml", result: "failure" });
        await audit("SAML_LOGIN_FAILED", {
          userId: resolvedUser.id,
          username: resolvedUser.username,
          reason: "mfa_policy_unavailable",
        });
        return redirectToLogin(reply, "mfa_policy_unavailable");
      }

      // Create session (same pattern as OIDC)
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await db.insert(schema.sessions).values({
        id: token,
        userId: resolvedUser.id,
        expiresAt,
      });

      authAttempts.inc({ method: "saml", result: "success" });
      await audit("SAML_LOGIN_SUCCESS", {
        userId: resolvedUser.id,
        username: resolvedUser.username,
      });

      // Set session cookie and redirect to app
      reply.setCookie("snapotter-session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecureRequest(request),
        path: "/",
        maxAge: env.SESSION_DURATION_HOURS * 3600,
      });

      return reply.redirect("/");
    },
  );
}
