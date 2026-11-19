import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { getSettingStrict } from "../lib/settings-helpers.js";
import { verifyPassword } from "../plugins/auth.js";

// The literal shipped default, never read from env: the login page's hint
// names it, and an operator's own DEFAULT_PASSWORD must never be echoed.
const SHIPPED_DEFAULT_CREDENTIAL = "admin";

// One scrypt check per stored hash. Only a password change alters the hash,
// so anonymous requests to this public endpoint can't turn it into a CPU sink.
let defaultHashCheck: { hash: string; matches: Promise<boolean> } | undefined;

/**
 * Whether the seeded admin still signs in with the shipped admin / admin
 * (#4817). mustChangePassword alone isn't enough: an admin reset and
 * admin-created users set it too, with other passwords.
 */
async function defaultCredentialsActive(): Promise<boolean> {
  if (
    env.DEFAULT_USERNAME !== SHIPPED_DEFAULT_CREDENTIAL ||
    env.DEFAULT_PASSWORD !== SHIPPED_DEFAULT_CREDENTIAL ||
    env.SKIP_MUST_CHANGE_PASSWORD
  ) {
    return false;
  }
  const [admin] = await db
    .select({
      passwordHash: schema.users.passwordHash,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.username, SHIPPED_DEFAULT_CREDENTIAL));
  if (!admin?.mustChangePassword || !admin.passwordHash) return false;
  const hash = admin.passwordHash;
  if (defaultHashCheck?.hash !== hash) {
    defaultHashCheck = {
      hash,
      matches: verifyPassword(SHIPPED_DEFAULT_CREDENTIAL, hash).catch((err) => {
        // A failed check must not stick; the next request tries again.
        if (defaultHashCheck?.hash === hash) defaultHashCheck = undefined;
        throw err;
      }),
    };
  }
  return defaultHashCheck.matches;
}

let supportedLocaleCodes: ReadonlySet<string> | undefined;

function isSupportedLocale(value: string): boolean {
  supportedLocaleCodes ??= new Set(SUPPORTED_LOCALES.map((locale) => locale.code));
  return supportedLocaleCodes.has(value);
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/locale", async (request, reply) => {
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultLocale"));
    const fallbackLocale =
      env.DEFAULT_LOCALE && isSupportedLocale(env.DEFAULT_LOCALE) ? env.DEFAULT_LOCALE : "en";
    if (!row) {
      return reply.send({ defaultLocale: fallbackLocale });
    }
    if (!isSupportedLocale(row.value)) {
      request.log.warn(
        { value: row.value, fallbackLocale },
        "defaultLocale setting holds an unsupported value; using fallback",
      );
      return reply.send({ defaultLocale: fallbackLocale });
    }
    return reply.send({ defaultLocale: row.value });
  });

  // Public config endpoint (for frontend to know if auth is required)
  app.get("/api/v1/config/auth", async (request) => {
    const config: Record<string, unknown> = {
      authEnabled: env.AUTH_ENABLED,
    };
    if (env.OIDC_ENABLED) {
      config.oidcEnabled = true;
      config.oidcProviderName = env.OIDC_PROVIDER_NAME || null;
      config.oidcLoginUrl = "/api/auth/oidc/login";
    }

    // SAML SSO requires both env flag and enterprise license
    const samlLicensed = env.SAML_ENABLED
      ? await isEnterpriseFeatureEnabled("saml_sso", "boot")
      : false;
    if (env.SAML_ENABLED && samlLicensed) {
      config.samlEnabled = true;
      config.samlProviderName = env.SAML_PROVIDER_NAME || "SSO";
      config.samlLoginUrl = "/api/auth/saml/login";
    }

    // Enforcement only applies when the feature is licensed (the login route
    // checks the same two things, licence first), so the page must not claim
    // it otherwise (#2128).
    if (await isEnterpriseFeatureEnabled("sso_enforcement")) {
      try {
        config.ssoEnforced = (await getSettingStrict("ssoEnforcement")) === "true";
      } catch (err) {
        // This public endpoint has to keep answering. The login route fails
        // closed on the same read, so a failure here only costs the page its
        // SSO banner; say so instead of swallowing it.
        request.log.error(
          { err },
          "ssoEnforcement read failed; login page told enforcement is off",
        );
        config.ssoEnforced = false;
      }
    } else {
      config.ssoEnforced = false;
    }

    if (env.AUTH_ENABLED) {
      try {
        config.defaultCredentialsActive = await defaultCredentialsActive();
      } catch (err) {
        // Only the first-run hint depends on this; the page still signs in.
        request.log.error({ err }, "default credentials check failed; login hint hidden");
        config.defaultCredentialsActive = false;
      }
    }

    return config;
  });
}
