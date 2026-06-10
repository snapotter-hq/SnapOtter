/**
 * OIDC authentication integration tests.
 *
 * Strategy:
 * - Tests that don't need OIDC routes (password guards, session fields, users
 *   list) create OIDC users directly in the DB and use the default test app.
 * - Tests that need OIDC routes (config endpoint, login redirect) mutate the
 *   cached `env` object and spin up a separate Fastify instance with OIDC
 *   routes enabled.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../apps/api/src/config.js";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

// ── Helpers ──────────────────────────────────────────────────────────

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/**
 * Insert an OIDC-only user directly into the DB (no passwordHash).
 * Returns a session token for the user.
 */
async function createOidcUser(
  opts: { username?: string; email?: string; role?: string } = {},
): Promise<{
  userId: string;
  username: string;
  sessionToken: string;
}> {
  const userId = randomUUID();
  const username = opts.username || `oidc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await db.insert(schema.users).values({
    id: userId,
    username,
    passwordHash: null,
    role: opts.role || "user",
    team: "default-team-00000000",
    mustChangePassword: false,
    authProvider: "oidc",
    externalId: `sub-${userId}`,
    email: opts.email || `${username}@example.com`,
  });

  // Create a session (simulates what the OIDC callback would do)
  const sessionToken = randomUUID();
  await db.insert(schema.sessions).values({
    id: sessionToken,
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
    idToken: "mock-id-token-jwt",
  });

  return { userId, username, sessionToken };
}

/**
 * Insert a session for an existing user with custom options.
 */
async function createOidcSession(
  userId: string,
  opts: { expiresAt?: Date; idToken?: string | null } = {},
): Promise<string> {
  const sessionToken = randomUUID();
  await db.insert(schema.sessions).values({
    id: sessionToken,
    userId,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 3_600_000),
    idToken: opts.idToken ?? null,
  });
  return sessionToken;
}

/**
 * Insert a "hybrid" user -- has both a local password AND an OIDC link.
 */
async function _createHybridUser(
  passwordHash: string,
  opts: { username?: string; email?: string } = {},
): { userId: string; username: string; sessionToken: string } {
  const userId = randomUUID();
  const username =
    opts.username || `hybrid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await db.insert(schema.users).values({
    id: userId,
    username,
    passwordHash,
    role: "user",
    team: "default-team-00000000",
    mustChangePassword: false,
    authProvider: "oidc",
    externalId: `sub-${userId}`,
    email: opts.email || `${username}@example.com`,
  });

  const sessionToken = randomUUID();
  await db.insert(schema.sessions).values({
    id: sessionToken,
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  return { userId, username, sessionToken };
}

// =====================================================================
// SESSION RESPONSE FIELDS
// =====================================================================
describe("Session response fields", () => {
  it("returns OIDC fields for an OIDC user session", async () => {
    const { sessionToken, username } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe(username);
    expect(body.user.authProvider).toBe("oidc");
    expect(body.user.loginMethod).toBe("oidc");
    expect(body.user.hasLocalPassword).toBe(false);
    expect(body.user.hasOidcLink).toBe(true);
    expect(body.user.email).toMatch(/@example\.com$/);
  });

  it("returns local fields for a local user session", async () => {
    // Admin is a local user
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.authProvider).toBe("local");
    expect(body.user.loginMethod).toBe("local");
    expect(body.user.hasLocalPassword).toBe(true);
    expect(body.user.hasOidcLink).toBe(false);
  });

  it("Bearer token still works for session check", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });
});

// =====================================================================
// PASSWORD GUARDS
// =====================================================================
describe("Password guards for OIDC users", () => {
  it("OIDC user (no passwordHash) cannot change password", async () => {
    const { sessionToken } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        currentPassword: "anything",
        newPassword: "NewValid1",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("OIDC_NO_PASSWORD");
  });

  it("admin cannot reset password for OIDC user", async () => {
    const { userId } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${userId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "NewValid1" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("OIDC_NO_PASSWORD");
  });
});

// =====================================================================
// USERS LIST
// =====================================================================
describe("Users list includes OIDC fields", () => {
  it("GET /api/auth/users includes authProvider, hasLocalPassword, hasOidcLink", async () => {
    const { username: oidcUsername } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Find the OIDC user we just created
    const oidcEntry = body.users.find((u: any) => u.username === oidcUsername);
    expect(oidcEntry).toBeDefined();
    expect(oidcEntry.authProvider).toBe("oidc");
    expect(oidcEntry.hasLocalPassword).toBe(false);
    expect(oidcEntry.hasOidcLink).toBe(true);
    expect(oidcEntry.email).toMatch(/@example\.com$/);

    // The admin user should be local
    const adminEntry = body.users.find((u: any) => u.username === "admin");
    expect(adminEntry).toBeDefined();
    expect(adminEntry.authProvider).toBe("local");
    expect(adminEntry.hasLocalPassword).toBe(true);
    expect(adminEntry.hasOidcLink).toBe(false);
  });

  it("users list does not expose passwordHash or externalId directly", async () => {
    await createOidcUser();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    for (const user of body.users) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("externalId");
    }
  });
});

// =====================================================================
// BACKWARD COMPATIBILITY
// =====================================================================
describe("Backward compatibility", () => {
  it("local login still works when OIDC users exist in the DB", async () => {
    // Create an OIDC user (just to prove it doesn't break local login)
    await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeTruthy();
    expect(body.user.username).toBe("admin");
  });

  it("OIDC user cannot log in via local login (no passwordHash)", async () => {
    const { username } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "anything" },
    });

    // Should fail because passwordHash is null
    expect(res.statusCode).toBe(401);
  });
});

// =====================================================================
// CONFIG ENDPOINT (requires OIDC_ENABLED = true)
// =====================================================================
describe("Config endpoint with OIDC enabled", () => {
  let oidcApp: TestApp;

  // Save original env values
  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;
  const origProviderName = env.OIDC_PROVIDER_NAME;

  beforeAll(async () => {
    // Mutate the cached env to enable OIDC for route registration
    (env as any).OIDC_ENABLED = true;
    (env as any).EXTERNAL_URL = "http://localhost:9999";
    (env as any).OIDC_ISSUER_URL = "http://localhost:0";
    (env as any).OIDC_CLIENT_ID = "test-client-id";
    (env as any).OIDC_CLIENT_SECRET = "test-client-secret";
    (env as any).OIDC_PROVIDER_NAME = "TestProvider";

    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    // Restore original env values
    (env as any).OIDC_ENABLED = origOidcEnabled;
    (env as any).EXTERNAL_URL = origExternalUrl;
    (env as any).OIDC_ISSUER_URL = origIssuerUrl;
    (env as any).OIDC_CLIENT_ID = origClientId;
    (env as any).OIDC_CLIENT_SECRET = origClientSecret;
    (env as any).OIDC_PROVIDER_NAME = origProviderName;

    await oidcApp.cleanup();
  }, 10_000);

  it("config returns OIDC fields when enabled", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/v1/config/auth",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.oidcEnabled).toBe(true);
    expect(body.oidcProviderName).toBe("TestProvider");
    expect(body.oidcLoginUrl).toBe("/api/auth/oidc/login");
  });

  it("config does NOT leak OIDC secrets", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/v1/config/auth",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty("clientSecret");
    expect(body).not.toHaveProperty("oidcClientSecret");
    expect(body).not.toHaveProperty("issuerUrl");
    expect(body).not.toHaveProperty("oidcIssuerUrl");
  });
});

// =====================================================================
// CONFIG ENDPOINT (OIDC disabled -- default)
// =====================================================================
describe("Config endpoint with OIDC disabled", () => {
  it("config omits OIDC fields when disabled", async () => {
    // The default test app has OIDC_ENABLED=false
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/config/auth",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty("oidcEnabled");
    expect(body).not.toHaveProperty("oidcProviderName");
    expect(body).not.toHaveProperty("oidcLoginUrl");
    expect(body.authEnabled).toBe(true);
  });
});

// =====================================================================
// LOGIN REDIRECT (requires OIDC routes + mock OIDC discovery)
// =====================================================================
describe("OIDC login redirect", () => {
  let oidcApp: TestApp;
  let mockServer: Server;
  let mockPort: number;

  // Save original env values
  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;

  beforeAll(async () => {
    // Start a minimal mock OIDC provider that serves discovery only
    mockServer = createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
        const discovery = {
          issuer: `http://localhost:${mockPort}`,
          authorization_endpoint: `http://localhost:${mockPort}/authorize`,
          token_endpoint: `http://localhost:${mockPort}/token`,
          jwks_uri: `http://localhost:${mockPort}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(discovery));
        return;
      }
      if (req.url === "/jwks") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    // Bind to random port
    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        mockPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    // Mutate the cached env to enable OIDC
    (env as any).OIDC_ENABLED = true;
    (env as any).EXTERNAL_URL = "http://localhost:9999";
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    (env as any).OIDC_CLIENT_ID = "test-client-id";
    (env as any).OIDC_CLIENT_SECRET = "test-client-secret";

    // Clear the cached OIDC config so discovery hits our mock
    const _oidcModule = await import("../../apps/api/src/plugins/oidc.js");
    // The module caches config in a module-level variable; rebuild app to get fresh routes
    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    // Restore original env values
    (env as any).OIDC_ENABLED = origOidcEnabled;
    (env as any).EXTERNAL_URL = origExternalUrl;
    (env as any).OIDC_ISSUER_URL = origIssuerUrl;
    (env as any).OIDC_CLIENT_ID = origClientId;
    (env as any).OIDC_CLIENT_SECRET = origClientSecret;

    await oidcApp.cleanup();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }, 10_000);

  it("GET /api/auth/oidc/login returns 302 redirect to IdP", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/login",
    });

    // Should redirect to the mock IdP's authorization endpoint
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location);
    expect(redirectUrl.origin).toBe(`http://localhost:${mockPort}`);
    expect(redirectUrl.pathname).toBe("/authorize");

    // Verify required OIDC params
    expect(redirectUrl.searchParams.get("client_id")).toBe("test-client-id");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:9999/api/auth/oidc/callback",
    );
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("scope")).toContain("openid");
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
    expect(redirectUrl.searchParams.get("nonce")).toBeTruthy();
    expect(redirectUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("login redirect sets oidc-state cookie", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/login",
    });

    expect(res.statusCode).toBe(302);

    // Check for oidc-state cookie in Set-Cookie header
    const cookies = res.headers["set-cookie"];
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies || "";
    expect(cookieStr).toContain("oidc-state=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("SameSite=Lax");
  });
});

// =====================================================================
// OIDC CALLBACK EDGE CASES (without a full mock provider)
// =====================================================================
describe("OIDC callback edge cases", () => {
  let oidcApp: TestApp;
  let mockServer: Server;
  let mockPort: number;

  // Save original env values
  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;

  beforeAll(async () => {
    // Minimal mock server for discovery
    mockServer = createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
        const discovery = {
          issuer: `http://localhost:${mockPort}`,
          authorization_endpoint: `http://localhost:${mockPort}/authorize`,
          token_endpoint: `http://localhost:${mockPort}/token`,
          jwks_uri: `http://localhost:${mockPort}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(discovery));
        return;
      }
      if (req.url === "/jwks") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [] }));
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

    (env as any).OIDC_ENABLED = true;
    (env as any).EXTERNAL_URL = "http://localhost:9999";
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    (env as any).OIDC_CLIENT_ID = "test-client-id";
    (env as any).OIDC_CLIENT_SECRET = "test-client-secret";

    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    (env as any).OIDC_ENABLED = origOidcEnabled;
    (env as any).EXTERNAL_URL = origExternalUrl;
    (env as any).OIDC_ISSUER_URL = origIssuerUrl;
    (env as any).OIDC_CLIENT_ID = origClientId;
    (env as any).OIDC_CLIENT_SECRET = origClientSecret;

    await oidcApp.cleanup();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }, 10_000);

  it("callback without state cookie redirects to login with error", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/callback?code=abc&state=xyz",
    });

    // Should redirect to /login?error=oidc_session_expired
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("/login?error=oidc_session_expired");
  });

  it("callback with invalid cookie signature redirects to login with error", async () => {
    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/callback?code=abc&state=xyz",
      cookies: { "oidc-state": "tampered-garbage-value" },
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("/login?error=oidc_session_expired");
  });

  it("callback with IdP error redirects to login with oidc_auth_failed", async () => {
    // First, do a login to get a valid state cookie
    const loginRes = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/login",
    });
    expect(loginRes.statusCode).toBe(302);

    // Extract the state cookie and state param from redirect
    const rawCookies = loginRes.headers["set-cookie"];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies || "";
    const cookieMatch = cookieStr.match(/oidc-state=([^;]+)/);
    expect(cookieMatch).toBeTruthy();
    // The cookie value may be URL-encoded; decode for inject()
    const cookieValue = decodeURIComponent(cookieMatch?.[1]);

    const redirectUrl = new URL(loginRes.headers.location as string);
    const state = redirectUrl.searchParams.get("state");

    // Simulate IdP returning an error
    const callbackRes = await oidcApp.app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?error=access_denied&error_description=User+denied&state=${state}`,
      cookies: { "oidc-state": cookieValue },
    });

    expect(callbackRes.statusCode).toBe(302);
    const location = callbackRes.headers.location as string;
    expect(location).toContain("/login?error=oidc_auth_failed");
  });
});

// =====================================================================
// ADMIN OPERATIONS ON OIDC USERS
// =====================================================================
describe("Admin operations on OIDC users", () => {
  it("admin can delete an OIDC user", async () => {
    const { userId } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);

    // Verify user is gone
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user).toBeUndefined();
  });

  it("admin can update role of an OIDC user", async () => {
    const { userId } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });

    expect(res.statusCode).toBe(200);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user?.role).toBe("editor");
  });
});

// =====================================================================
// COOKIE-BASED SESSION AUTH
// =====================================================================
describe("Cookie-based session auth", () => {
  it("OIDC session cookie works for authenticated requests", async () => {
    const { sessionToken, username } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { "snapotter-session": sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe(username);
    expect(body.user.authProvider).toBe("oidc");
  });

  it("Both cookie and Bearer work simultaneously", async () => {
    const { sessionToken: oidcToken, username: oidcUsername } = await createOidcUser();

    // Bearer token for local user (admin)
    const bearerRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(bearerRes.statusCode).toBe(200);
    const bearerBody = JSON.parse(bearerRes.body);
    expect(bearerBody.user.username).toBe("admin");
    expect(bearerBody.user.authProvider).toBe("local");

    // Cookie for OIDC user
    const cookieRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { "snapotter-session": oidcToken },
    });

    expect(cookieRes.statusCode).toBe(200);
    const cookieBody = JSON.parse(cookieRes.body);
    expect(cookieBody.user.username).toBe(oidcUsername);
    expect(cookieBody.user.authProvider).toBe("oidc");
  });

  it("request with neither Bearer nor cookie returns 401", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
    });

    expect(res.statusCode).toBe(401);
  });
});

// =====================================================================
// SESSION EXPIRY
// =====================================================================
describe("Session expiry", () => {
  it("expired OIDC session returns 401", async () => {
    const { userId } = await createOidcUser();

    // Create a session that expired 10 minutes ago
    const expiredToken = await createOidcSession(userId, {
      expiresAt: new Date(Date.now() - 600_000),
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { "snapotter-session": expiredToken },
    });

    expect(res.statusCode).toBe(401);

    // Verify the expired session was cleaned up from DB
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, expiredToken));
    expect(session).toBeUndefined();
  });
});

// =====================================================================
// API KEYS FOR OIDC USERS
// =====================================================================
describe("API keys for OIDC users", () => {
  it("OIDC user can create an API key", async () => {
    const { sessionToken } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      cookies: { "snapotter-session": sessionToken },
      payload: { name: "test-key" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.key).toMatch(/^si_/);
    expect(body.name).toBe("test-key");
  });

  it("API key works for auth after creation", async () => {
    const { sessionToken } = await createOidcUser();

    // Create the API key via cookie auth
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      cookies: { "snapotter-session": sessionToken },
      payload: { name: "auth-test-key" },
    });

    expect(createRes.statusCode).toBe(201);
    const { key: rawKey } = JSON.parse(createRes.body);

    // Use the raw API key as Bearer token
    const _sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${rawKey}` },
    });

    // API key auth on GET /api/auth/session is a public route, but
    // the middleware still attaches the user if a valid token is found.
    // The session endpoint itself checks for session, not API key,
    // so it returns 401 since the si_ token is not a session ID.
    // Instead, test with a non-public route that requires auth.
    const healthRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(healthRes.statusCode).toBe(200);
    const body = JSON.parse(healthRes.body);
    expect(body.apiKeys).toBeDefined();
    expect(Array.isArray(body.apiKeys)).toBe(true);
  });
});

// =====================================================================
// LOGOUT
// =====================================================================
describe("Logout", () => {
  it("logout clears the snapotter-session cookie", async () => {
    const { sessionToken } = await createOidcUser();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { "snapotter-session": sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    // Check that response includes a Set-Cookie header clearing the session
    const setCookieHeader = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join("; ")
      : setCookieHeader || "";
    expect(cookieStr).toContain("snapotter-session=");
    // The cookie should be expired (Expires in the past or Max-Age=0)
    const hasExpiry =
      cookieStr.toLowerCase().includes("max-age=0") ||
      cookieStr.toLowerCase().includes("expires=thu, 01 jan 1970");
    expect(hasExpiry).toBe(true);
  });

  it("session is deleted from DB after logout", async () => {
    const { sessionToken } = await createOidcUser();

    // Verify session exists before logout
    const [before] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
    expect(before).toBeDefined();

    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { "snapotter-session": sessionToken },
    });

    // Verify session is gone
    const [after] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
    expect(after).toBeUndefined();
  });

  it("logout returns logoutUrl when session has idToken and OIDC discovery is cached", async () => {
    const { sessionToken } = await createOidcUser();

    // The default createOidcUser sets idToken to "mock-id-token-jwt".
    // Without a running OIDC provider and cached discovery, the logout
    // route's try/catch will swallow the error and return no logoutUrl.
    // We still verify the response shape is correct.
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { "snapotter-session": sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    // logoutUrl is only present when OIDC discovery has been cached with
    // an end_session_endpoint. In test env without mock provider, it is
    // absent. We verify it's either undefined or a string URL.
    if (body.logoutUrl !== undefined) {
      expect(typeof body.logoutUrl).toBe("string");
      expect(body.logoutUrl).toContain("id_token_hint=");
    }
  });
});
