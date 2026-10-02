/**
 * SAML SSO authentication integration tests.
 *
 * saml.ts (@node-saml) had effectively zero coverage. The SAML crypto boundary
 * is mocked so we can drive the SnapOtter-specific logic that actually matters:
 * SP metadata, the login redirect, and the ACS callback's provisioning,
 * session, denial, and MFA branches. Follows the enterprise-gated integration
 * pattern: reset modules, doMock the enterprise gate + @node-saml + mfa, then
 * import buildTestApp so it registers the (licensed) SAML routes. The
 * external-auth resolver stays real behind a passthrough wrapper that two
 * tests (#978) use to make one call throw.
 */
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { DrizzleQueryError, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import { UsernameRaceExhaustedError } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { buildBeforeSend } from "../../../apps/api/src/lib/sentry-scrub.js";
import { buildTestApp, type TestApp } from "../test-server.js";
import { parseExternalUrl, SSO_DEPLOYMENTS } from "./sso-deployments.js";

// Hoisted so the vi.mock factories (which vitest hoists above the imports) can
// close over them. saml.ts imports @node-saml STATICALLY, so it must be
// vi.mock, not vi.doMock, to be intercepted.
const samlMock = vi.hoisted(() => ({
  getAuthorizeUrlAsync: vi.fn(),
  validatePostResponseAsync: vi.fn(),
  generateServiceProviderMetadata: vi.fn(),
}));
// Records the options each `new SAML(...)` receives, so a test can check the
// ACS callbackUrl and issuer the IdP will be told about (#1297).
const samlCtorMock = vi.hoisted(() => vi.fn());
const mfaOutcomeMock = vi.hoisted(() => vi.fn(() => "proceed"));
// A controllable handle for getMfaPolicy so a single test can make the MFA
// policy lookup reject and drive saml.ts's policy-read catch. Since #815 a
// failed policy read no longer falls back to "proceed": the caller passes the
// "unavailable" sentinel to the outcome resolver, which denies unenrolled
// users with a distinct retryable error instead of waving them through.
const getMfaPolicyMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// resolveExternalUser stays REAL by default. The #978 tests swap in a throw for
// one call each: the retry-exhaustion error the resolver raises after three
// lost username races (not worth staging against a real DB) and a plain fault
// that must keep surfacing as a 500.
const resolverFailure = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock("../../../apps/api/src/lib/external-auth-resolver.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const realResolve = actual.resolveExternalUser as (...args: unknown[]) => Promise<unknown>;
  return {
    ...actual,
    resolveExternalUser: async (...args: unknown[]) => {
      const err = resolverFailure.next;
      if (err) {
        resolverFailure.next = null;
        throw err;
      }
      return realResolve(...args);
    },
  };
});

// reportError is mocked so the callback tests can read exactly what it hands
// Sentry (#1866, #1868); every other error-report export stays real.
const reportErrorSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, reportError: reportErrorSpy };
});

vi.mock("@node-saml/node-saml", () => ({
  ValidateInResponseTo: { ifPresent: "ifPresent", always: "always", never: "never" },
  SAML: class {
    constructor(options: unknown) {
      samlCtorMock(options);
    }
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
  // Unset so the ACS URL and entity ID derive from EXTERNAL_URL, the path the
  // subpath tests below pin.
  SAML_CALLBACK_URL: "",
  SAML_ENTITY_ID: "",
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

afterEach(() => {
  // An armed throw is consumed only if the ACS route reaches the resolver;
  // never let one leak into the next test.
  resolverFailure.next = null;
});

function postCallback() {
  return testApp.app.inject({
    method: "POST",
    url: `${env.BASE_PATH}/api/auth/saml/callback`,
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
  // Cleared before (not after) each test so a report from an earlier describe
  // can't leak into the first assertion here.
  beforeEach(() => {
    reportErrorSpy.mockClear();
  });

  it("rejects an assertion that fails validation", async () => {
    samlMock.validatePostResponseAsync.mockRejectedValue(new Error("invalid signature"));
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
    // Anyone can POST a junk assertion here, so a rejected one must never
    // reach Sentry: unauthenticated traffic would flood it.
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("rejects an assertion with no nameID", async () => {
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { email: "x@example.com" } });
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
    expect(reportErrorSpy).not.toHaveBeenCalled();
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
    // A clean login is not a fault: nothing goes to Sentry.
    expect(reportErrorSpy).not.toHaveBeenCalled();
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
      // A denial is a login outcome, not a fault, so it isn't reported.
      expect(reportErrorSpy).not.toHaveBeenCalled();
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

      // The denial leaves an audit row like every other one (issue #967).
      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(
          sql`${schema.auditLog.action} = 'SAML_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'user_limit_reached' AND ${schema.auditLog.details}->>'externalId' = ${email}`,
        );
      expect(auditRows).toHaveLength(1);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
    }
  });

  it("redirects to saml_auth_failed instead of a raw 500 when auto-create exhausts its username-race retries (#978)", async () => {
    const email = `raced-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    const raceErr = new UsernameRaceExhaustedError();
    resolverFailure.next = raceErr;

    const res = await postCallback();

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=saml_auth_failed");
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");

    // Exhaustion gets the same audit trail as every other terminal denial.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'SAML_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'auto_create_race_exhausted' AND ${schema.auditLog.details}->>'externalId' = ${email}`,
      );
    expect(auditRows).toHaveLength(1);
    const attemptedUsername = email.split("@")[0];
    expect(auditRows[0].details).toMatchObject({ attemptedUsername });

    // Reported once, the error passed through untouched, with route-level
    // context only: the exact match rules out a username in the context. The
    // rest guards the callback against wrapping or annotating the error with
    // the username on the way out (#1866); the error's own contents are pinned
    // at the real throw site in tests/unit/api/external-auth-resolver-mutation.test.ts.
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    expect(reportErrorSpy).toHaveBeenCalledWith(raceErr, {
      source: "http",
      route: "/api/auth/saml/callback",
      method: "POST",
      subsystem: "external-auth",
    });
    const reported = reportErrorSpy.mock.calls[0][0] as Error;
    expect(inspect(reported, { showHidden: true, depth: Number.POSITIVE_INFINITY })).not.toContain(
      attemptedUsername,
    );
    for (const diagnostic of [false, true]) {
      const event = { exception: { values: [{ type: reported.name, value: reported.message }] } };
      const sent = buildBeforeSend(() => true, diagnostic)(event, { originalException: reported });
      expect(sent).not.toBeNull();
      expect(JSON.stringify(sent)).not.toContain(attemptedUsername);
    }
  });

  it("still surfaces any other resolver throw as a 500 with no misclassified audit row", async () => {
    // The catch is narrow on purpose: only the resolver's own retry-exhaustion
    // signal is a login outcome. A fault (DB down, a leaked constraint error)
    // must keep reaching the global handler instead of being audited as a race.
    const email = `fault-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    resolverFailure.next = new Error("simulated resolver fault");

    const res = await postCallback();

    expect(res.statusCode).toBe(500);
    expect(res.headers.location).toBeUndefined();
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'SAML_LOGIN_FAILED' AND ${schema.auditLog.details}->>'externalId' = ${email}`,
      );
    expect(auditRows).toHaveLength(0);
    // The callback's own catch must not report it as username contention; the
    // 500 is the global error handler's to report. buildTestApp() doesn't
    // install that handler yet (#1243), so this only rules out the callback's
    // report and holds whether or not the handler is there.
    expect(reportErrorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subsystem: "external-auth" }),
    );
  });

  it("fails the login closed and reports the fault once when the MFA enrollment-status read throws (#1867)", async () => {
    // The users read that decides whether MFA is checked sits in its own catch
    // in saml.ts: a DB error there must fail the login, never silently skip
    // MFA for an enrolled user. Spy only the single-column totpEnabled select
    // (the same shape saml.ts issues) so provisioning/session selects still hit
    // the real DB. Mirrors the OIDC-callback fail-closed test.
    const email = `dberr-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("proceed");

    // Shaped like the real failure: drizzle wraps the driver's error (a lost
    // Postgres connection, SQLSTATE 57P01) in a DrizzleQueryError.
    const pgFault = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01" },
    );
    const enrollmentFault = new DrizzleQueryError(
      'select "totp_enabled" from "users" where "users"."id" = $1',
      ["00000000-0000-0000-0000-000000000000"],
      pgFault,
    );
    let enrollmentReads = 0;
    const originalSelect = db.select.bind(db);
    const selectSpy = vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && Object.keys(selection).join() === "totpEnabled") {
        enrollmentReads++;
        throw enrollmentFault;
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });

    try {
      const res = await postCallback();

      // Must NOT proceed to a session and must NOT issue an MFA challenge:
      // a broken enrollment-status read means the login fails, full stop.
      expect(enrollmentReads).toBe(1);
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
      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(
          sql`${schema.auditLog.action} = 'SAML_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'mfa_check_error' AND ${schema.auditLog.details}->>'userId' = ${user?.id as string}`,
        );
      expect(auditRows).toHaveLength(1);

      // The catch keeps the fault from the global error handler, so the
      // callback reports it itself, exactly once, tagged with its own
      // subsystem so triage can tell it from the MFA-policy fault. The exact
      // context match rules out a user id or email riding along in it.
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(enrollmentFault, {
        source: "http",
        route: "/api/auth/saml/callback",
        method: "POST",
        statusCode: 503,
        subsystem: "mfa-enrollment",
      });
      // The real reportError drops "expected" errors; a lost database is the
      // operator's environment, so it goes out as a throttled warning.
      expect(classifyError(enrollmentFault, "http")).toBe("operational");
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("fails closed when the MFA policy lookup fails and the user is not enrolled (#815)", async () => {
    // Make the policy lookup reject once. saml.ts must map the failure to the
    // "unavailable" sentinel and pass it to the outcome resolver instead of
    // swallowing it into "proceed": the stored policy may well be "required",
    // so an unenrolled user is denied with a distinct retryable error param.
    const email = `mfaerr-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    // Shaped like the real failure: getMfaPolicy's settings read is a drizzle
    // select, so a lost Postgres connection (SQLSTATE 57P01) arrives wrapped
    // in a DrizzleQueryError.
    const pgFault = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01" },
    );
    const policyFault = new DrizzleQueryError(
      'select "value" from "settings" where "settings"."key" = $1 limit $2',
      ["mfaPolicy", 1],
      pgFault,
    );
    getMfaPolicyMock.mockRejectedValueOnce(policyFault);
    // Mirror what the real resolver returns for ("unavailable", role, false);
    // the pure mapping itself is covered exhaustively in tests/unit/api/mfa.test.ts.
    mfaOutcomeMock.mockReturnValue("policy_unavailable");

    try {
      const res = await postCallback();

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=mfa_policy_unavailable");
      const setCookie = res.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || "";
      expect(cookieStr).not.toContain("snapotter-session=");

      // The caller fed the read failure to the resolver as the sentinel
      // rather than skipping the MFA decision entirely.
      expect(mfaOutcomeMock).toHaveBeenCalledWith("unavailable", expect.any(String), false);

      // No session row was minted for the resolved user.
      const [user] = await db.select().from(schema.users).where(eq(schema.users.externalId, email));
      expect(user).toBeDefined();
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user?.id as string));
      expect(sessions.length).toBe(0);

      // The catch keeps the fault from the global error handler, so the
      // callback reports it itself, exactly once: a settings fault denying
      // every SSO login must show up in triage, not only in the log. The exact
      // context match rules out a user id or email riding along in it.
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(policyFault, {
        source: "http",
        route: "/api/auth/saml/callback",
        method: "POST",
        statusCode: 503,
        subsystem: "mfa-policy",
      });
      // A lost database is the operator's environment, so it reaches Sentry
      // as a throttled warning rather than being dropped as expected.
      expect(classifyError(policyFault, "http")).toBe("operational");
    } finally {
      getMfaPolicyMock.mockReset();
      getMfaPolicyMock.mockResolvedValue({});
      mfaOutcomeMock.mockReturnValue("proceed");
    }
  });

  it("still challenges an enrolled user when the MFA policy lookup fails (#815)", async () => {
    const email = `mfaerr-enrolled-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });

    // First login auto-creates the account, then mark it TOTP-enrolled.
    mfaOutcomeMock.mockReturnValue("proceed");
    expect((await postCallback()).statusCode).toBe(302);
    await db
      .update(schema.users)
      .set({ totpEnabled: true })
      .where(eq(schema.users.externalId, email));

    // The provisioning login above is clean, so anything reported from here
    // on comes from the faulted login.
    expect(reportErrorSpy).not.toHaveBeenCalled();
    const policyFault = new Error("mfa policy store unavailable");
    getMfaPolicyMock.mockRejectedValueOnce(policyFault);
    // Mirror what the real resolver returns for ("unavailable", role, true).
    mfaOutcomeMock.mockReturnValue("challenge");
    try {
      const res = await postCallback();

      // A settings blip must not lock out enrolled users: the challenge is
      // at least as strict as any policy, so it is issued as usual.
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toMatch(/^\/login\?mfaToken=/);
      // The caller passed the sentinel with the REAL enrollment state; a
      // regression that hardcodes totpEnabled=false on the failure path, or
      // denies before consulting the resolver, trips this.
      expect(mfaOutcomeMock).toHaveBeenLastCalledWith("unavailable", expect.any(String), true);
      // The login still goes through to a challenge, but the policy fault is
      // reported all the same: the read failed whether or not it denied.
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(policyFault, {
        source: "http",
        route: "/api/auth/saml/callback",
        method: "POST",
        statusCode: 503,
        subsystem: "mfa-policy",
      });
    } finally {
      getMfaPolicyMock.mockReset();
      getMfaPolicyMock.mockResolvedValue({});
      mfaOutcomeMock.mockReturnValue("proceed");
    }
  });
});

describe.each(SSO_DEPLOYMENTS)("SAML deployment at '%s', EXTERNAL_URL %s", (basePath, typed) => {
  const originalBasePath = env.BASE_PATH;
  let externalUrl: string;

  beforeAll(() => {
    externalUrl = env.EXTERNAL_URL;
    env.BASE_PATH = basePath;
    env.EXTERNAL_URL = parseExternalUrl(typed);
  });
  afterAll(() => {
    env.BASE_PATH = originalBasePath;
    env.EXTERNAL_URL = externalUrl;
  });

  it("keeps failed login and callback redirects under the deployment path", async () => {
    samlMock.getAuthorizeUrlAsync.mockRejectedValueOnce(new Error("IdP unavailable"));
    samlMock.validatePostResponseAsync.mockRejectedValueOnce(new Error("invalid signature"));
    const login = await testApp.app.inject(`${basePath}/api/auth/saml/login`);
    const callback = await postCallback();
    for (const res of [login, callback]) {
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(`${basePath}/login?error=saml_auth_failed`);
    }
  });

  // The IdP posts the assertion to the ACS URL and checks the audience against
  // the entity ID, so both must carry the prefix. The SAML class is mocked, so
  // only its recorded constructor options show what a real IdP would see.
  it("builds the ACS callbackUrl and issuer under the deployment path", async () => {
    const email = `acs-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.getAuthorizeUrlAsync.mockResolvedValue("http://localhost:0/sso?SAMLRequest=x");
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("proceed");
    samlCtorMock.mockClear();

    const login = await testApp.app.inject(`${basePath}/api/auth/saml/login`);
    expect(login.statusCode).toBe(302);
    const callback = await postCallback();
    expect(callback.statusCode).toBe(302);

    expect(samlCtorMock).toHaveBeenCalled();
    for (const [options] of samlCtorMock.mock.calls as [
      { callbackUrl: string; issuer: string },
    ][]) {
      expect(options.callbackUrl).toBe(`http://localhost:9999${basePath}/api/auth/saml/callback`);
      expect(options.issuer).toBe(`http://localhost:9999${basePath}/api/auth/saml/metadata`);
    }
  });

  it("sends an MFA challenge to the login page under the deployment path", async () => {
    const email = `mfachal-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("challenge");
    try {
      const res = await postCallback();
      expect(res.statusCode).toBe(302);
      const location = new URL(String(res.headers.location), "http://localhost:9999");
      expect(location.pathname).toBe(`${basePath}/login`);
      expect(location.searchParams.get("mfaToken")).toBeTruthy();
      expect(res.cookies.find((c) => c.name === "snapotter-session")).toBeUndefined();
    } finally {
      mfaOutcomeMock.mockReturnValue("proceed");
    }
  });

  it("redirects into the app with a usable session cookie at the deployment path", async () => {
    const email = `path-${randomUUID().slice(0, 8)}@example.com`;
    samlMock.validatePostResponseAsync.mockResolvedValue({ profile: { nameID: email, email } });
    mfaOutcomeMock.mockReturnValue("proceed");
    const res = await postCallback();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${basePath}/`);
    const cookie = res.cookies.find((c) => c.name === "snapotter-session");
    expect(cookie).toMatchObject({ path: `${basePath}/`, httpOnly: true });
    const session = await testApp.app.inject({
      url: `${basePath}/api/auth/session`,
      cookies: { "snapotter-session": cookie?.value ?? "" },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe(email);
  });
});
