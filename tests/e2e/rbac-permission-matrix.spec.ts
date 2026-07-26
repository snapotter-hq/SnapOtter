/**
 * RBAC permission matrix, driven through scoped API keys.
 *
 * Every previous e2e RBAC spec asserted permissions through the three built-in
 * roles, which bundles permissions together and leaves the individual guard
 * untested: an admin-only endpoint returning 403 for the `user` role does not
 * show WHICH permission decided it. A key scoped to exactly one permission
 * isolates one guard at a time. It also closes a second hole: nothing in the
 * e2e suite ever authenticated with an `si_` key, so scoping, expiry and
 * revocation were only ever proven at the integration layer.
 *
 * Not every declared permission gates an endpoint. `files:own`, `files:all`,
 * `pipelines:own`, `pipelines:all` and `apikeys:all` widen a result set instead
 * of deciding a status code, so they cannot appear in a status matrix. Their
 * ownership boundaries are covered by tests/integration/platform/
 * ownership-enforcement.test.ts. GATED below is therefore the complete set of
 * permissions that do decide a status code.
 */
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const API = process.env.API_URL;
if (!API) throw new Error("API_URL was not initialized by playwright.config.ts");

// Only a uniquifier for the fixture accounts this spec creates, but this is the
// permission matrix, so a Math.random() sitting here reads as a security token
// to anyone scanning the file. Taking the real thing is cheaper than explaining
// it every time someone looks.
const UID = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

interface Probe {
  permission: string;
  method: "GET" | "PUT" | "POST";
  path: string;
  body?: unknown;
  /** Status the route returns for a caller that holds the permission. */
  allowed: number[];
  /**
   * Body the denial carries. Every guard that goes through requirePermission
   * answers with code FORBIDDEN. requireToolAccess (apps/api/src/permissions.ts
   * line 380) is the one exception: it sends 403 with a message and no code at
   * all, so a client cannot tell a tool denial from any other 403
   * programmatically. Asserted as it is rather than as it ought to be.
   */
  deniedCode?: string;
  deniedError?: RegExp;
  /**
   * Enterprise routes check the permission first and the licence second, so a
   * permitted caller on an unlicensed instance still gets 403. The permission
   * gate stays observable because only the permission denial carries FORBIDDEN.
   */
  licenceGated?: boolean;
}

const GATED: Probe[] = [
  { permission: "settings:read", method: "GET", path: "/api/v1/settings", allowed: [200] },
  {
    permission: "settings:write",
    method: "PUT",
    path: "/api/v1/settings",
    body: { defaultTheme: "system" },
    allowed: [200],
  },
  { permission: "users:manage", method: "GET", path: "/api/auth/users", allowed: [200] },
  { permission: "teams:manage", method: "GET", path: "/api/v1/teams", allowed: [200] },
  { permission: "audit:read", method: "GET", path: "/api/v1/audit-log", allowed: [200] },
  { permission: "system:health", method: "GET", path: "/api/v1/admin/health", allowed: [200] },
  {
    permission: "features:manage",
    method: "GET",
    path: "/api/v1/admin/features/disk-usage",
    allowed: [200],
  },
  { permission: "apikeys:own", method: "GET", path: "/api/v1/api-keys", allowed: [200] },
  {
    permission: "security:manage",
    method: "POST",
    path: "/api/v1/roles",
    body: { name: `matrix-role-${UID}`, permissions: ["security:manage"], description: "" },
    // 409 means the guard let the request through to the uniqueness check.
    allowed: [200, 201, 409],
  },
  {
    // The tool gate rejects before any upload is read, so an empty body is a
    // valid probe: 400 proves the request reached body parsing.
    permission: "tools:use",
    method: "POST",
    path: "/api/v1/tools/image/resize",
    allowed: [400, 415, 422],
    deniedError: /permission to use this tool/i,
  },
  {
    permission: "webhooks:manage",
    method: "GET",
    path: "/api/v1/enterprise/webhooks",
    allowed: [403],
    licenceGated: true,
  },
  {
    permission: "compliance:manage",
    method: "GET",
    path: "/api/v1/enterprise/legal-hold",
    allowed: [403],
    licenceGated: true,
  },
];

/** A permission every probe can be scoped to without satisfying the guard. */
const NEUTRAL_PERMISSION = "files:own";

async function adminToken(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  expect(res.ok, `admin login failed with ${res.status}`).toBe(true);
  return ((await res.json()) as { token: string }).token;
}

/**
 * Mint an `si_` key carrying exactly `permissions`. Scoped keys intersect with
 * the owning user's role, and admin holds all 17, so any single permission can
 * be isolated.
 */
async function scopedKey(token: string, permissions: string[]): Promise<string> {
  const res = await fetch(`${API}/api/v1/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `matrix-${UID}-${permissions.join("-") || "none"}`, permissions }),
  });
  expect(res.status, `key creation for [${permissions}] failed`).toBe(201);
  return ((await res.json()) as { key: string }).key;
}

async function probe(
  key: string,
  entry: Probe,
): Promise<{ status: number; code?: string; error?: string }> {
  const res = await fetch(`${API}${entry.path}`, {
    method: entry.method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(entry.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(entry.body === undefined ? {} : { body: JSON.stringify(entry.body) }),
  });
  const parsed = await res.json().catch(() => ({}) as Record<string, unknown>);
  const body = parsed as { code?: string; error?: string };
  return { status: res.status, code: body.code, error: body.error };
}

test.describe("RBAC permission matrix", () => {
  for (const entry of GATED) {
    test(`${entry.permission} gates ${entry.method} ${entry.path}`, async () => {
      const token = await adminToken();

      const denied = await probe(await scopedKey(token, [NEUTRAL_PERMISSION]), entry);
      expect(denied.status, `a key without ${entry.permission} must be refused`).toBe(403);
      if (entry.deniedError) {
        expect(denied.error, "the refusal must name the tool gate").toMatch(entry.deniedError);
      } else {
        expect(denied.code, "the refusal must come from the permission guard").toBe(
          entry.deniedCode ?? "FORBIDDEN",
        );
      }

      const granted = await probe(await scopedKey(token, [entry.permission]), entry);
      expect(entry.allowed, `a key scoped to ${entry.permission} got ${granted.status}`).toContain(
        granted.status,
      );
      if (entry.licenceGated) {
        // Same status, different reason. Without this the granted case would be
        // indistinguishable from the denied one.
        expect(
          granted.code,
          "an unlicensed instance must refuse on the licence, not the permission",
        ).not.toBe("FORBIDDEN");
      }
    });
  }

  test("a key scoped to no permissions is refused everywhere", async () => {
    const token = await adminToken();
    const key = await scopedKey(token, []);

    for (const entry of GATED) {
      const result = await probe(key, entry);
      expect(result.status, `${entry.method} ${entry.path} accepted an unscoped key`).toBe(403);
    }
  });

  test("a revoked key stops authenticating immediately", async () => {
    const token = await adminToken();
    const created = await fetch(`${API}/api/v1/api-keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `matrix-revoke-${UID}`, permissions: ["settings:read"] }),
    });
    const { id, key } = (await created.json()) as { id: string; key: string };

    const before = await fetch(`${API}/api/v1/settings`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(before.status).toBe(200);

    const deleted = await fetch(`${API}/api/v1/api-keys/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleted.ok, `key deletion failed with ${deleted.status}`).toBe(true);

    const after = await fetch(`${API}/api/v1/settings`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(after.status, "a deleted key must stop working at once").toBe(401);
  });

  test("a key cannot be scoped beyond what its owner holds", async () => {
    const token = await adminToken();
    const res = await fetch(`${API}/api/v1/api-keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `matrix-bogus-${UID}`,
        permissions: ["settings:read", "not-a-real-permission"],
      }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  test("an expiry in the past is refused at creation", async () => {
    const token = await adminToken();
    const res = await fetch(`${API}/api/v1/api-keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `matrix-expired-${UID}`,
        permissions: ["settings:read"],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    });

    expect(res.status).toBe(400);
  });
});
