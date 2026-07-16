/**
 * End-to-end reproduction + regression coverage for the OIDC MFA gap
 * (snapotter-hq/SnapOtter#533): before the fix, a successful OIDC login for a
 * user under an MFA-required policy was unconditionally blocked, with no
 * check of whether the user had actually enrolled TOTP and no challenge step.
 *
 * The real cryptographic token exchange (PKCE/nonce/JWT signature
 * verification) is mocked at the `openid-client` boundary so this test can
 * drive the REAL callback route, REAL cookie/state handling, REAL Redis
 * challenge token, and REAL MFA decision code end to end without needing a
 * full mock IdP with signed JWTs.
 */
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authorizationCodeGrantMock = vi.hoisted(() => vi.fn());

vi.mock("openid-client", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, authorizationCodeGrant: authorizationCodeGrantMock };
});

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { buildTestApp } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";

let oidcApp: TestApp;
let mockServer: Server;
let mockPort: number;

const origOidcEnabled = env.OIDC_ENABLED;
const origExternalUrl = env.EXTERNAL_URL;
const origIssuerUrl = env.OIDC_ISSUER_URL;
const origClientId = env.OIDC_CLIENT_ID;
const origClientSecret = env.OIDC_CLIENT_SECRET;

async function startOidcLoginAndGetStateCookie() {
  const loginRes = await oidcApp.app.inject({ method: "GET", url: "/api/auth/oidc/login" });
  expect(loginRes.statusCode).toBe(302);
  const rawCookies = loginRes.headers["set-cookie"];
  const cookieStr = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies || "";
  const cookieMatch = cookieStr.match(/oidc-state=([^;]+)/);
  const cookieValue = decodeURIComponent(cookieMatch?.[1] ?? "");
  const redirectUrl = new URL(loginRes.headers.location as string);
  const state = redirectUrl.searchParams.get("state") ?? "";
  return { cookieValue, state };
}

function generateTotpCode(uri: string): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate();
}

async function insertOidcUser(opts: { role?: string; totpEnabled?: boolean } = {}) {
  const externalId = `sub-${randomUUID()}`;
  const userId = randomUUID();
  const username = `oidc_mfa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(schema.users).values({
    id: userId,
    username,
    passwordHash: null,
    role: opts.role ?? "user",
    team: "default-team-00000000",
    mustChangePassword: false,
    authProvider: "oidc",
    externalId,
    email: `${username}@example.com`,
    totpEnabled: opts.totpEnabled ?? false,
  });
  return { userId, username, externalId };
}

/**
 * Inserts an OIDC user and drives them through the REAL self-service TOTP
 * enrollment flow (enroll -> generate a real code -> verify), the same way
 * `apps/web/src/components/settings/two-factor-settings.tsx` does it. This
 * leaves a genuine, working, encrypted totpSecret in the DB -- not just a
 * `totpEnabled: true` flag -- so a challenge issued for this user can
 * actually be completed with a generated code, proving the OIDC-issued
 * challenge is real and not just a Redis key that happens to exist.
 */
async function insertAndEnrollOidcUser(opts: { role?: string } = {}) {
  const { userId, username, externalId } = await insertOidcUser({
    role: opts.role,
    totpEnabled: false,
  });

  const sessionToken = randomUUID();
  await db.insert(schema.sessions).values({
    id: sessionToken,
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  const enrollRes = await oidcApp.app.inject({
    method: "POST",
    url: "/api/auth/mfa/enroll",
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  const { uri } = JSON.parse(enrollRes.body) as { uri: string };

  const verifyRes = await oidcApp.app.inject({
    method: "POST",
    url: "/api/auth/mfa/verify",
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: { code: generateTotpCode(uri) },
  });
  expect(verifyRes.statusCode).toBe(200);

  // This bootstrap session isn't the one under test; drop it so it can't
  // mask a bug where the OIDC callback fails to mint its own.
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionToken));

  return { userId, username, externalId, totpUri: uri };
}

async function callbackAsUser(externalId: string) {
  authorizationCodeGrantMock.mockResolvedValueOnce({
    claims: () => ({ sub: externalId, email: `${externalId}@example.com` }),
    id_token: "fake-id-token",
  });
  const { cookieValue, state } = await startOidcLoginAndGetStateCookie();
  return oidcApp.app.inject({
    method: "GET",
    url: `/api/auth/oidc/callback?code=abc&state=${state}`,
    cookies: { "oidc-state": cookieValue },
  });
}

async function setMfaPolicy(value: "optional" | "admins_only" | "required") {
  await db
    .insert(schema.settings)
    .values({ key: "mfaPolicy", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

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

afterEach(async () => {
  await setMfaPolicy("optional");
  authorizationCodeGrantMock.mockReset();
});

afterAll(async () => {
  (env as any).OIDC_ENABLED = origOidcEnabled;
  (env as any).EXTERNAL_URL = origExternalUrl;
  (env as any).OIDC_ISSUER_URL = origIssuerUrl;
  (env as any).OIDC_CLIENT_ID = origClientId;
  (env as any).OIDC_CLIENT_SECRET = origClientSecret;
  await oidcApp.cleanup();
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
}, 10_000);

describe("OIDC callback MFA outcomes", () => {
  it("creates a session directly when MFA is optional and the user isn't enrolled", async () => {
    const { externalId } = await insertOidcUser({ totpEnabled: false });
    await setMfaPolicy("optional");

    const res = await callbackAsUser(externalId);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie)).toContain("snapotter-session=");
  });

  it("blocks with a distinct enrollment-required error when policy requires MFA and the user hasn't enrolled -- this is the bug in #533", async () => {
    const { externalId } = await insertOidcUser({ role: "user", totpEnabled: false });
    await setMfaPolicy("required");

    const res = await callbackAsUser(externalId);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=mfa_enrollment_required");
    // Must NOT be the old generic code that the frontend doesn't even map to a message.
    expect(res.headers.location).not.toBe("/login?error=mfa_required");
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
  });

  it("issues an MFA challenge that is genuinely completable end to end with a real TOTP code", async () => {
    const { username, externalId, totpUri } = await insertAndEnrollOidcUser({ role: "user" });
    await setMfaPolicy("required");

    const res = await callbackAsUser(externalId);

    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toMatch(/^\/login\?mfaToken=/);
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");

    const mfaToken = location.split("mfaToken=")[1];
    const redis = sharedRedis();
    expect(await redis.get(`mfa:${mfaToken}`)).toBeTruthy();

    // Actually complete it -- this is the real end-to-end proof, not just
    // that a Redis key exists.
    const completeRes = await oidcApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: generateTotpCode(totpUri) },
    });
    expect(completeRes.statusCode).toBe(200);
    const body = JSON.parse(completeRes.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe(username);
  });

  it("rejects completing an OIDC-issued challenge with an invalid code, and does not create a session", async () => {
    const { externalId } = await insertAndEnrollOidcUser({ role: "user" });
    await setMfaPolicy("required");

    const res = await callbackAsUser(externalId);
    const mfaToken = (res.headers.location as string).split("mfaToken=")[1];

    const completeRes = await oidcApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "000000" },
    });
    expect(completeRes.statusCode).toBe(401);
    expect(JSON.parse(completeRes.body).code).toBe("INVALID_CODE");
  });

  it("rejects completing with an unknown/expired mfaToken", async () => {
    const completeRes = await oidcApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken: randomUUID(), code: "123456" },
    });
    expect(completeRes.statusCode).toBe(401);
    expect(JSON.parse(completeRes.body).code).toBe("MFA_EXPIRED");
  });

  it("challenges an enrolled user even when policy is optional (enrollment beats policy)", async () => {
    const { externalId } = await insertAndEnrollOidcUser({});
    await setMfaPolicy("optional");

    const res = await callbackAsUser(externalId);

    const location = res.headers.location as string;
    expect(location).toMatch(/^\/login\?mfaToken=/);
  });

  it("does not block a user outside the policy's scope (admins_only, non-admin role)", async () => {
    const { externalId } = await insertOidcUser({ role: "user", totpEnabled: false });
    await setMfaPolicy("admins_only");

    const res = await callbackAsUser(externalId);

    expect(res.headers.location).toBe("/");
  });

  it("fails closed (does not create a session) when the MFA enrollment-status query throws", async () => {
    const { externalId } = await insertOidcUser({ role: "user", totpEnabled: true });
    await setMfaPolicy("required");

    const originalSelect = db.select.bind(db);
    const selectSpy = vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && "totpEnabled" in selection) {
        throw new Error("simulated DB failure");
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });

    try {
      const res = await callbackAsUser(externalId);

      // Must NOT silently proceed without MFA and must NOT issue a challenge
      // either -- a broken enrollment-status read means the login fails,
      // full stop, not "let them in" or "pretend they're unenrolled".
      expect(res.statusCode).toBe(302);
      const location = res.headers.location as string;
      expect(location).not.toBe("/");
      expect(location).not.toMatch(/^\/login\?mfaToken=/);
      const setCookie = res.headers["set-cookie"];
      expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
    } finally {
      selectSpy.mockRestore();
    }
  });
});
