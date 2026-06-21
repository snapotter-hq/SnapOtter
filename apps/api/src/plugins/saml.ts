import { parse as parseQs } from "node:querystring";
import type {} from "@fastify/cookie";
import { SAML } from "@node-saml/node-saml";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import {
  findUniqueUsername,
  resolveExternalUser,
  sanitizeUsername,
} from "../lib/external-auth-resolver.js";
import { authAttempts } from "../lib/metrics.js";
import { createSessionToken } from "./auth.js";

// -- SAML instance factory ----------------------------------------------------

function getSamlInstance(): SAML {
  return new SAML({
    callbackUrl: env.SAML_CALLBACK_URL || `${env.EXTERNAL_URL}/api/auth/saml/callback`,
    entryPoint: env.SAML_IDP_SSO_URL,
    issuer: env.SAML_ENTITY_ID || `${env.EXTERNAL_URL}/api/auth/saml/metadata`,
    idpCert: env.SAML_IDP_CERTIFICATE,
    wantAuthnResponseSigned: true,
    wantAssertionsSigned: true,
  });
}

// -- Helpers ------------------------------------------------------------------

function isSecure(): boolean {
  return env.EXTERNAL_URL.startsWith("https");
}

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
        secure: isSecure(),
        path: "/",
        maxAge: env.SESSION_DURATION_HOURS * 3600,
      });

      return reply.redirect("/");
    },
  );
}
