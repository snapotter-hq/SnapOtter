/**
 * SAML SSO authentication integration tests.
 *
 * saml.ts (@node-saml) had effectively zero coverage. The SAML crypto boundary
 * is mocked so we can drive the SnapOtter-specific logic that actually matters:
 * SP metadata, the login redirect, and the ACS callback's provisioning,
 * session, denial, and MFA branches. Follows the enterprise-gated integration
 * pattern: reset modules, doMock the enterprise gate + @node-saml + mfa, then
 * import buildTestApp so it registers the (licensed) SAML routes.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, type TestApp } from "../test-server.js";

// Hoisted so the vi.mock factories (which vitest hoists above the imports) can
// close over them. saml.ts imports @node-saml STATICALLY, so it must be
// vi.mock, not vi.doMock, to be intercepted.
const samlMock = vi.hoisted(() => ({
  getAuthorizeUrlAsync: vi.fn(),
  validatePostResponseAsync: vi.fn(),
  generateServiceProviderMetadata: vi.fn(),
}));
const mfaOutcomeMock = vi.hoisted(() => vi.fn(() => "proceed"));
// A controllable handle for getMfaPolicy so a single test can make the MFA
// policy lookup reject and drive saml.ts's `catch { /* MFA plugin not loaded */ }`
// branch (the whole MFA block is best-effort: a policy-lookup failure must fall
// back to "proceed", not fail the login).
const getMfaPolicyMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("@node-saml/node-saml", () => ({
  ValidateInResponseTo: { ifPresent: "ifPresent", always: "always", never: "never" },
  SAML: class {
    getAuthorizeUrlAsync = (...a: unknown[]) => samlMock.getAuthorizeUrlAsync(...a);
    validatePostResponseAsync = (...a: unknown[]) => samlMock.validatePostResponseAsync(...a);
    generateServiceProviderMetadata = (...a: unknown[]) =>
      samlMock.generateServiceProviderMetadata(...a);
  },
}));
vi.mock("../../../apps/api/src/plugins/mfa.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getMfaPolicy: (...a: unknown[]) => getMfaPolicyMock(...a),
    resolveExternalLoginMfaOutcome: (...a: unknown[]) => mfaOutcomeMock(...a),
  };
});
// SAML is enterprise-gated; license the saml_sso feature so the routes register.
vi.mock("@snapotter/enterprise", () => ({
  isFeatureEnabled: (f: string) => f === "saml_sso",
  getActiveLicense: () => ({
    org: "test-org",
    plan: "enterprise",
    features: ["saml_sso"],
    seats: 100,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
  }),
  initEnterprise: vi.fn(),
  loadS3Storage: vi.fn(),
  ENTERPRISE_FEATURES: ["saml_sso"],
  PLAN_FEATURES: { team: [], enterprise: ["saml_sso"] },
}));

let testApp: TestApp;

const saved: Record<string, unknown> = {};
const SAML_ENV = {
  SAML_ENABLED: true,
  EXTERNAL_URL: "http://localhost:9999",
  SAML_IDP_SSO_URL: "http://localhost:0/sso",
  SAML_IDP_CERTIFICATE: "MIIC-test-certificate",
  SAML_EMAIL_ATTRIBUTE: "email",
  SAML_AUTO_CREATE_USERS: true,
  SAML_AUTO_LINK_USERS: true,
  SAML_DEFAULT_ROLE: "user",
};

beforeAll(async () => {
  for (const [k, v] of Object.entries(SAML_ENV)) {
    saved[k] = (env as Record<string, unknown>)[k];
    (env as Record<string, unknown>)[k] = v;
  }
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    (env as Record<string, unknown>)[k] = v;
  }
  await testApp.cleanup();
}, 10_000);

function postCallback() {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/saml/callback",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "SAMLResponse=stub",
  });
}

describe("SAML metadata", () => {
  it("serves SP metadata XML", async () => {
    samlMock.generateServiceProviderMetadata.mockReturnValue(
      '<?xml version="1.0"?><EntityDescriptor entityID="sp"/>',
    );
    const res = await testApp.app.inject({ method: "GET", url: "/api/auth/saml/metadata" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(res.body).toContain("EntityDescriptor");
  });
});

describe("SAML login redirect", () => {
  it("redirects to the IdP authorize URL", async () => {
    samlMock.getAuthorizeUrlAsync.mockResolvedValue("https://idp.example/sso?SAMLRequest=abc");
    const res = await testApp.app.inject({ method: "GET", url: "/api/auth/saml/login" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://idp.example/sso?SAMLRequest=abc");
  });

  it("redirects to /login on IdP redirect failure", async () => {
    samlMock.getAuthorizeUrlAsync.mockRejectedValue(new Error("no entryPoint"));
    const res = await testApp.app.inject({ method: "GET", url: "/api/auth/saml/login" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
  });
});

describe("SAML callback", () => {
  it("rejects an assertion that fails validation", async () => {
    samlMock.validatePostResponseAsync.mockRejectedValue(new Error("invalid signature"));
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
  });

  it("rejects an assertion with no nameID", async () => {
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { email: "x@example.com" } });
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
  });

  it("provisions a user, creates a session, and sets the cookie on success", async () => {
    const email = `alice-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("proceed");

    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");

    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || "";
    expect(cookieStr).toContain("snapotter-session=");
    expect(cookieStr.toLowerCase()).toContain("httponly");

    // The user was auto-created with the SAML provider and a session exists.
    const [user] = await db.select().from(schema.users).where(eq(schema.users.externalId, email));
    expect(user).toBeDefined();
    expect(user?.authProvider).toBe("saml");
    const sessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user?.id as string));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("derives the username from the configured username attribute", async () => {
    (env as Record<string, unknown>).SAML_USERNAME_ATTRIBUTE = "uid";
    try {
      const uid = `custom${randomUUID().slice(0, 6)}`;
      samlMock.validatePostResponseAsync.mockResolvedValue({
        profile: { nameID: `id-${uid}`, email: "different@example.com", uid },
      });
      mfaOutcomeMock.mockReturnValue("proceed");
      const res = await postCallback();
      expect(res.statusCode).toBe(302);
      // Username comes from the uid attribute, not the email local-part.
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.externalId, `id-${uid}`));
      expect(user?.username).toContain(uid.toLowerCase());
    } finally {
      (env as Record<string, unknown>).SAML_USERNAME_ATTRIBUTE = undefined;
    }
  });

  it("denies an unknown user when auto-create is off", async () => {
    (env as Record<string, unknown>).SAML_AUTO_CREATE_USERS = false;
    try {
      const email = `nobody-${randomUUID().slice(0, 8)}@example.com`;
      samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
      const res = await postCallback();
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=saml_user_not_authorized");
    } finally {
      (env as Record<string, unknown>).SAML_AUTO_CREATE_USERS = true;
    }
  });

  it("issues an MFA challenge when the policy requires it", async () => {
    const email = `mfa-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("challenge");
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?mfaToken=/);
    mfaOutcomeMock.mockReturnValue("proceed");
  });

  it("blocks login when MFA enrollment is required", async () => {
    const email = `enroll-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("enrollment_required");
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=mfa_enrollment_required");
    mfaOutcomeMock.mockReturnValue("proceed");
  });

  it("redirects to a distinct error when the user limit is reached", async () => {
    // Drive the REAL external-auth resolver into its user_limit_reached branch
    // (autoCreate on, MAX_USERS exceeded by the accounts other tests already
    // seeded) so saml.ts maps deniedReason -> `saml_user_limit_reached` rather
    // than the generic `saml_user_not_authorized`. A brand-new nameID/email
    // guarantees the resolver misses both the externalId match and the
    // auto-link-by-email step and falls through to the auto-create limit check.
    const origMaxUsers = (env as Record<string, unknown>).MAX_USERS;
    (env as Record<string, unknown>).MAX_USERS = 1;
    try {
      const email = `overlimit-${randomUUID().slice(0, 8)}@example.com`;
      samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
      mfaOutcomeMock.mockReturnValue("proceed");

      const res = await postCallback();

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=saml_user_limit_reached");

      // The limit was enforced: no user was created for this assertion.
      const [created] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.externalId, email));
      expect(created).toBeUndefined();
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
    }
  });

  it("fails the login closed when the MFA enrollment-status read throws", async () => {
    // The users read that decides whether MFA is checked is intentionally
    // unguarded in saml.ts: a DB error there must fail the login, never
    // silently skip MFA for an enrolled user. Spy only the totpEnabled select
    // (the same shape saml.ts issues) so provisioning/session selects still hit
    // the real DB. Mirrors the OIDC-callback fail-closed test.
    const email = `dberr-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("proceed");

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
      const res = await postCallback();

      // Must NOT proceed to a session and must NOT issue an MFA challenge:
      // a broken enrollment-status read means the login fails, full stop.
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=saml_auth_failed");
      const setCookie = res.headers["set-cookie"];
      expect(String(setCookie ?? "")).not.toContain("snapotter-session=");

      // No session row was minted for the resolved user.
      const [user] = await db.select().from(schema.users).where(eq(schema.users.externalId, email));
      expect(user).toBeDefined();
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user?.id as string));
      expect(sessions.length).toBe(0);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("still logs in when the MFA policy lookup fails (best-effort MFA block)", async () => {
    // saml.ts wraps the getMfaPolicy/resolveExternalLoginMfaOutcome lookup in a
    // try/catch that swallows failures and leaves the outcome at "proceed" (the
    // MFA plugin may not be loaded). Make the policy lookup reject once and
    // confirm the login still completes: session created, redirect to `/`.
    const email = `mfaerr-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    getMfaPolicyMock.mockRejectedValueOnce(new Error("mfa policy store unavailable"));

    try {
      const res = await postCallback();

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/");
      const setCookie = res.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || "";
      expect(cookieStr).toContain("snapotter-session=");

      // A real session was still created despite the MFA lookup throwing.
      const [user] = await db.select().from(schema.users).where(eq(schema.users.externalId, email));
      expect(user).toBeDefined();
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user?.id as string));
      expect(sessions.length).toBeGreaterThan(0);
    } finally {
      getMfaPolicyMock.mockResolvedValue({});
    }
  });
});
