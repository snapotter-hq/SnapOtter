/**
 * A plain-http OIDC_ISSUER_URL used to be accepted without a word in the log:
 * with an http EXTERNAL_URL, discovery runs with allowInsecureRequests, so
 * discovery, the login code exchange, and the tokens all cross the network
 * unencrypted and nothing records it (#1879). Registering the OIDC routes now
 * logs one warning naming the risk and the fix. http issuers keep working
 * (LAN and dev setups rely on them); this only makes them visible.
 *
 * Each case registers the routes on a bare Fastify app whose logger is a set
 * of spies, so the assertion reads exactly what boot would log.
 */
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { oidcRoutes } from "../../../apps/api/src/plugins/oidc.js";

const mutableEnv = env as unknown as Record<string, unknown>;

const ORIGINAL = {
  OIDC_ENABLED: env.OIDC_ENABLED,
  OIDC_ISSUER_URL: env.OIDC_ISSUER_URL,
  OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
  EXTERNAL_URL: env.EXTERNAL_URL,
};

function spyLogger() {
  const log = {
    level: "info",
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: () => log,
  };
  return log;
}

const apps: FastifyInstance[] = [];

/** Register the OIDC routes the way boot does and return the warnings logged. */
async function registerWith(config: {
  enabled: boolean;
  issuer: string;
  externalUrl: string;
}): Promise<unknown[][]> {
  mutableEnv.OIDC_ENABLED = config.enabled;
  mutableEnv.OIDC_ISSUER_URL = config.issuer;
  mutableEnv.OIDC_CLIENT_ID = "test-client-id";
  mutableEnv.OIDC_CLIENT_SECRET = "test-client-secret";
  mutableEnv.EXTERNAL_URL = config.externalUrl;
  const log = spyLogger();
  const app = Fastify({ loggerInstance: log as unknown as FastifyBaseLogger });
  apps.push(app);
  await oidcRoutes(app);
  await app.ready();
  return log.warn.mock.calls;
}

afterEach(async () => {
  Object.assign(mutableEnv, ORIGINAL);
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("plain-http OIDC issuer warning", () => {
  it.each(["http://keycloak.lan:8080/realms/x", "HTTP://Keycloak.lan:8080/realms/x"])(
    "warns once at registration for %s on an http deployment",
    async (issuer) => {
      const warnings = await registerWith({
        enabled: true,
        issuer,
        externalUrl: "http://snapotter.lan:1349",
      });
      expect(warnings).toHaveLength(1);
      const [fields, message] = warnings[0] as [Record<string, unknown>, string];
      expect(fields).toEqual({ issuerHost: "keycloak.lan:8080" });
      expect(message).toContain("OIDC_ISSUER_URL is plain http");
      expect(message).toContain("unencrypted");
      expect(message).toContain("https");
    },
  );

  // The uppercase spelling is the #1775 case: the branch has to read the
  // parsed scheme, the same way discovery decides on allowInsecureRequests.
  it.each(["https://snapotter.example.com", "HTTPS://snapotter.example.com"])(
    "says sign-in is refused when EXTERNAL_URL is %s",
    async (externalUrl) => {
      const warnings = await registerWith({
        enabled: true,
        issuer: "http://keycloak.lan:8080/realms/x",
        externalUrl,
      });
      expect(warnings).toHaveLength(1);
      const [fields, message] = warnings[0] as [Record<string, unknown>, string];
      expect(fields).toEqual({ issuerHost: "keycloak.lan:8080" });
      expect(message).toContain("EXTERNAL_URL is https");
      expect(message).toContain("refused");
    },
  );

  it("stays quiet for an https issuer", async () => {
    const warnings = await registerWith({
      enabled: true,
      issuer: "https://keycloak.example.com/realms/x",
      externalUrl: "http://snapotter.lan:1349",
    });
    expect(warnings).toEqual([]);
  });

  it("stays quiet when OIDC is off, whatever the issuer says", async () => {
    const warnings = await registerWith({
      enabled: false,
      issuer: "http://keycloak.lan:8080/realms/x",
      externalUrl: "http://snapotter.lan:1349",
    });
    expect(warnings).toEqual([]);
  });

  it("doesn't throw at boot for an issuer that isn't a URL", async () => {
    // Discovery reports that one as OIDC_DISCOVERY_FAILED on the first login;
    // registration must not crash the server over it.
    const warnings = await registerWith({
      enabled: true,
      issuer: "keycloak.lan/realms/x",
      externalUrl: "http://snapotter.lan:1349",
    });
    expect(warnings).toEqual([]);
  });
});
