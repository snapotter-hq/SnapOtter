/**
 * OIDC discovery only allows a plain-http issuer when EXTERNAL_URL declares a
 * plain-http origin (a dev setup). The https check used to be a case-sensitive
 * prefix match, so EXTERNAL_URL=HTTPS://... switched insecure discovery on
 * with no log line and an http issuer was accepted (#1775).
 *
 * EXTERNAL_URL goes through the real boot parse first, which keeps its
 * spelling (the SSO URLs are built from it), so only the check reads the
 * scheme case-insensitively.
 *
 * `discovery` is wrapped in a passthrough spy so each case can read the
 * options getOrDiscoverConfig() passed, and the real call still runs against a
 * plain-http mock provider, so the outcome is pinned too: with an https
 * EXTERNAL_URL, openid-client refuses the http issuer and login falls back to
 * oidc_provider_unreachable.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestApp } from "../test-server.js";
// loadEnv is pure, so loading it before vi.resetModules() below is harmless.
import { parseExternalUrl } from "./sso-deployments.js";

const discoverySpy = vi.hoisted(() => vi.fn());

vi.mock("openid-client", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const realDiscovery = actual.discovery as (...args: unknown[]) => Promise<unknown>;
  discoverySpy.mockImplementation((...args: unknown[]) => realDiscovery(...args));
  return { ...actual, discovery: discoverySpy };
});

vi.resetModules();

const oidc = await import("openid-client");
const { env } = await import("../../../apps/api/src/config.js");
const { resetOidcDiscoveryCacheForTests } = await import("../../../apps/api/src/plugins/oidc.js");
const { buildTestApp } = await import("../test-server.js");

const mutableEnv = env as unknown as Record<string, unknown>;

describe("OIDC discovery and the EXTERNAL_URL scheme", () => {
  let oidcApp: TestApp;
  let mockServer: Server;
  let mockPort: number;

  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: `http://localhost:${mockPort}`,
            authorization_endpoint: `http://localhost:${mockPort}/authorize`,
            token_endpoint: `http://localhost:${mockPort}/token`,
            jwks_uri: `http://localhost:${mockPort}/jwks`,
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            code_challenge_methods_supported: ["S256"],
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        mockPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    mutableEnv.OIDC_ENABLED = true;
    mutableEnv.OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    mutableEnv.OIDC_CLIENT_ID = "test-client-id";
    mutableEnv.OIDC_CLIENT_SECRET = "test-client-secret";
    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    mutableEnv.OIDC_ENABLED = origOidcEnabled;
    mutableEnv.EXTERNAL_URL = origExternalUrl;
    mutableEnv.OIDC_ISSUER_URL = origIssuerUrl;
    mutableEnv.OIDC_CLIENT_ID = origClientId;
    mutableEnv.OIDC_CLIENT_SECRET = origClientSecret;
    resetOidcDiscoveryCacheForTests();
    await oidcApp.cleanup();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }, 10_000);

  beforeEach(() => {
    resetOidcDiscoveryCacheForTests();
    discoverySpy.mockClear();
  });

  /** Drive a login and return where it redirected plus discovery's `execute` option. */
  async function login(externalUrl: string) {
    mutableEnv.EXTERNAL_URL = externalUrl;
    const res = await oidcApp.app.inject({ method: "GET", url: "/api/auth/oidc/login" });
    expect(res.statusCode).toBe(302);
    expect(discoverySpy).toHaveBeenCalledTimes(1);
    const options = discoverySpy.mock.calls[0][4] as { execute?: unknown[] } | undefined;
    return { location: res.headers.location ?? "", execute: options?.execute };
  }

  it.each(["HTTPS://localhost:9999", "Https://Localhost:9999/", "https://localhost:9999"])(
    "refuses a plain-http issuer when EXTERNAL_URL is %s",
    async (typed) => {
      const { location, execute } = await login(parseExternalUrl(typed));
      expect(execute).toBeUndefined();
      expect(location).toBe("/login?error=oidc_provider_unreachable");
    },
  );

  it.each(["http://localhost:9999", "HTTP://Localhost:9999"])(
    "allows a plain-http issuer when EXTERNAL_URL is %s",
    async (typed) => {
      const { location, execute } = await login(parseExternalUrl(typed));
      expect(execute).toEqual([oidc.allowInsecureRequests]);
      expect(new URL(location).origin).toBe(`http://localhost:${mockPort}`);
    },
  );
});
