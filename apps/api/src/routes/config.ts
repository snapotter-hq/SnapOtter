import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { getSettingStrict } from "../lib/settings-helpers.js";

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

    return config;
  });
}
