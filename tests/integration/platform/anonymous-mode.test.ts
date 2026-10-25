import { randomUUID } from "node:crypto";
import { eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  computeKeyPrefix,
  ensureAnonymousUser,
  ensureDefaultAdmin,
  hashPassword,
} from "../../../apps/api/src/plugins/auth.js";
import { mockEnterpriseFeatures } from "../../helpers/enterprise-mock.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  await ensureAnonymousUser();
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("ensureAnonymousUser", () => {
  it("creates anonymous row in the users table", async () => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(row).toBeDefined();
    expect(row?.username).toBe("anonymous");
    expect(row?.role).toBe("admin");
    expect(row?.mustChangePassword).toBe(false);
  });

  it("is idempotent", async () => {
    await ensureAnonymousUser();
    await ensureAnonymousUser();
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(rows).toHaveLength(1);
  });
});

describe("FK constraint with anonymous userId", () => {
  it("can insert an API key with userId 'anonymous'", async () => {
    const keyHash = await hashPassword("si_test");
    await expect(
      db.insert(schema.apiKeys).values({
        id: randomUUID(),
        userId: "anonymous",
        keyHash,
        keyPrefix: "si_te",
        name: "FK test key",
      }),
    ).resolves.toBeDefined();
  });

  it("can insert a pipeline with userId 'anonymous'", async () => {
    await expect(
      db.insert(schema.pipelines).values({
        id: randomUUID(),
        userId: "anonymous",
        name: "FK test pipeline",
        steps: JSON.stringify([{ toolId: "resize", settings: { width: 100 } }]),
      }),
    ).resolves.toBeDefined();
  });

  it("can insert a user file with userId 'anonymous'", async () => {
    await expect(
      db.insert(schema.userFiles).values({
        id: randomUUID(),
        userId: "anonymous",
        originalName: "test.png",
        storedName: "fk-test-stored.png",
        mimeType: "image/png",
        size: 1024,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects FK violation for nonexistent userId", async () => {
    const keyHash = await hashPassword("si_bad");
    await expect(
      db.insert(schema.apiKeys).values({
        id: randomUUID(),
        userId: "nonexistent-user-id",
        keyHash,
        keyPrefix: "si_ba",
        name: "bad FK key",
      }),
    ).rejects.toThrow();
  });
});

describe("admin settings save (issue #135 regression guard)", () => {
  it("admin can PUT /api/v1/settings", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { defaultToolView: "fullscreen" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("admin can GET /api/v1/settings with saved value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.settings.defaultToolView).toBe("fullscreen");
  });

  it("user role cannot PUT /api/v1/settings", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "anon-test-user", password: "Testpass1!", role: "user" },
    });
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "anon-test-user", password: "Testpass1!" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { defaultToolView: "sidebar" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("admin API key operations", () => {
  it("admin can create and list API keys", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "integration-test-key" },
    });
    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.key).toBeDefined();
    expect(body.key.startsWith("si_")).toBe(true);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(Array.isArray(listBody.apiKeys)).toBe(true);
  });
});

describe("admin pipeline operations", () => {
  it("admin can save and list pipelines", async () => {
    const saveRes = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "integration-test-pipeline",
        steps: [{ toolId: "resize", settings: { width: 200, height: 200, fit: "cover" } }],
      },
    });
    expect(saveRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(Array.isArray(body.pipelines)).toBe(true);
    expect(
      body.pipelines.some((p: { name: string }) => p.name === "integration-test-pipeline"),
    ).toBe(true);
  });
});

describe("ensureDefaultAdmin after ensureAnonymousUser (#2334)", () => {
  it("creates the default admin and allows sign-in when only the anonymous user exists", async () => {
    await db.delete(schema.users).where(ne(schema.users.id, "anonymous"));
    await ensureAnonymousUser();

    const beforeUsers = await db.select().from(schema.users);
    expect(beforeUsers.map((u) => u.id)).toEqual(["anonymous"]);

    await ensureDefaultAdmin();

    const [adminRow] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, "admin"));
    expect(adminRow).toBeDefined();

    const [anonRow] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(anonRow).toBeDefined();

    const anonPipelines = await db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.userId, "anonymous"));
    expect(anonPipelines.length).toBeGreaterThan(0);

    const anonFiles = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.userId, "anonymous"));
    expect(anonFiles.length).toBeGreaterThan(0);

    await ensureDefaultAdmin();
    const afterSecondCall = await db.select().from(schema.users);
    expect(afterSecondCall).toHaveLength(2);

    const token = await loginAsAdmin(app);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "admin"));
    adminToken = token;
  });
});

describe("leftover anonymous row when AUTH_ENABLED=true (#2461)", () => {
  it("omits the synthetic anonymous row from GET /api/auth/users", async () => {
    await ensureAnonymousUser();

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { users: Array<{ id: string; username: string }> };
    expect(body.users.some((u) => u.id === "anonymous")).toBe(false);
    expect(body.users.some((u) => u.username === "admin")).toBe(true);
  });

  it("does not count the synthetic anonymous row toward MAX_USERS on register", async () => {
    await ensureAnonymousUser();
    const realUsers = await db.select().from(schema.users).where(ne(schema.users.id, "anonymous"));
    const origMaxUsers = env.MAX_USERS;
    (env as Record<string, unknown>).MAX_USERS = realUsers.length + 1;

    try {
      const allowedRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "anon-cap-allowed", password: "Testpass1!", role: "user" },
      });
      expect(allowedRes.statusCode).toBe(201);

      const blockedRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "anon-cap-blocked", password: "Testpass1!", role: "user" },
      });
      expect(blockedRes.statusCode).toBe(403);
      expect(JSON.parse(blockedRes.body).code).toBe("USER_LIMIT_REACHED");
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
      await db.delete(schema.users).where(eq(schema.users.username, "anon-cap-allowed"));
      await db.delete(schema.users).where(eq(schema.users.username, "anon-cap-blocked"));
    }
  });

  it("refuses API keys owned by the synthetic anonymous user when AUTH_ENABLED=true", async () => {
    await ensureAnonymousUser();
    const rawKey = `si_anon_leftover_${randomUUID()}`;
    const keyId = randomUUID();
    await db.insert(schema.apiKeys).values({
      id: keyId,
      userId: "anonymous",
      keyHash: await hashPassword(rawKey),
      keyPrefix: computeKeyPrefix(rawKey),
      name: "leftover-anonymous-key",
    });

    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${rawKey}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
    }
  });
});

describe("leftover anonymous row in teams, roles, usage, and SCIM user routes (#2473)", () => {
  const scimToken = `so_scim_v2_${"b".repeat(64)}`;

  beforeAll(async () => {
    vi.resetModules();
    mockEnterpriseFeatures(["scim"]);
    await ensureAnonymousUser();
    const tokenHash = await hashPassword(scimToken);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: tokenHash } });
  });

  afterAll(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));
    vi.resetModules();
  });

  it("excludes the synthetic anonymous row from GET /api/v1/teams memberCount", async () => {
    const realDefaultMembers = await db
      .select()
      .from(schema.users)
      .where(ne(schema.users.id, "anonymous"));
    const [defaultTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    expect(defaultTeam).toBeDefined();
    const expectedDefaultCount = realDefaultMembers.filter(
      (u) => u.team === defaultTeam?.id,
    ).length;

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const teams = (
      JSON.parse(listRes.body) as {
        teams: Array<{ id: string; name: string; memberCount: number }>;
      }
    ).teams;
    const listedDefault = teams.find((t) => t.id === defaultTeam?.id);
    expect(listedDefault?.memberCount).toBe(expectedDefaultCount);
  });

  it("excludes the synthetic anonymous row from DELETE /api/v1/teams/:id member check", async () => {
    const [defaultTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    const tempTeamId = randomUUID();
    await db.insert(schema.teams).values({ id: tempTeamId, name: "AnonOnlyTeam" });
    await db.update(schema.users).set({ team: tempTeamId }).where(eq(schema.users.id, "anonymous"));

    try {
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/teams/${tempTeamId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(200);
    } finally {
      if (defaultTeam) {
        await db
          .update(schema.users)
          .set({ team: defaultTeam.id })
          .where(eq(schema.users.id, "anonymous"));
      }
      await db.delete(schema.teams).where(eq(schema.teams.id, tempTeamId));
    }
  });

  it("excludes the synthetic anonymous row from GET /api/v1/roles userCount", async () => {
    await ensureAnonymousUser();
    const realAdmins = (
      await db.select().from(schema.users).where(ne(schema.users.id, "anonymous"))
    ).filter((u) => u.role === "admin");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const roles = (JSON.parse(res.body) as { roles: Array<{ name: string; userCount: number }> })
      .roles;
    const adminRole = roles.find((r) => r.name === "admin");
    expect(adminRole?.userCount).toBe(realAdmins.length);
  });

  it("excludes the synthetic anonymous row from GET /api/v1/admin/usage teamStorage userCount", async () => {
    await ensureAnonymousUser();
    const [defaultTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    const realDefaultMembers = (
      await db.select().from(schema.users).where(ne(schema.users.id, "anonymous"))
    ).filter((u) => u.team === defaultTeam?.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const teamStorage = (
      JSON.parse(res.body) as {
        teamStorage: Array<{ teamName: string; totalBytes: string; userCount: number }>;
      }
    ).teamStorage;
    const defaultRow = teamStorage.find((r) => r.teamName === "Default");
    expect(defaultRow?.userCount).toBe(realDefaultMembers.length);
  });

  it("omits the synthetic anonymous row from SCIM GET /Users and returns 404 on /Users/anonymous", async () => {
    await ensureAnonymousUser();
    await db
      .update(schema.users)
      .set({ scimExternalId: "anon-ext-id" })
      .where(eq(schema.users.id, "anonymous"));

    try {
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${scimToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body) as {
        totalResults: number;
        Resources: Array<{ id: string; userName: string }>;
      };
      expect(listBody.Resources.some((u) => u.id === "anonymous")).toBe(false);

      const filterUserRes = await app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users?filter=${encodeURIComponent('userName eq "anonymous"')}`,
        headers: { authorization: `Bearer ${scimToken}` },
      });
      expect(filterUserRes.statusCode).toBe(200);
      expect(JSON.parse(filterUserRes.body).totalResults).toBe(0);

      const filterExtRes = await app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users?filter=${encodeURIComponent('externalId eq "anon-ext-id"')}`,
        headers: { authorization: `Bearer ${scimToken}` },
      });
      expect(filterExtRes.statusCode).toBe(200);
      expect(JSON.parse(filterExtRes.body).totalResults).toBe(0);

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users/anonymous",
        headers: { authorization: `Bearer ${scimToken}` },
      });
      expect(getRes.statusCode).toBe(404);

      const putRes = await app.inject({
        method: "PUT",
        url: "/api/v1/scim/v2/Users/anonymous",
        headers: { authorization: `Bearer ${scimToken}` },
        payload: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "renamed-anon",
          active: false,
        },
      });
      expect(putRes.statusCode).toBe(404);

      const patchRes = await app.inject({
        method: "PATCH",
        url: "/api/v1/scim/v2/Users/anonymous",
        headers: { authorization: `Bearer ${scimToken}` },
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }],
        },
      });
      expect(patchRes.statusCode).toBe(404);

      const deleteRes = await app.inject({
        method: "DELETE",
        url: "/api/v1/scim/v2/Users/anonymous",
        headers: { authorization: `Bearer ${scimToken}` },
      });
      expect(deleteRes.statusCode).toBe(404);

      const [anonAfter] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, "anonymous"));
      expect(anonAfter?.username).toBe("anonymous");
      expect(anonAfter?.role).toBe("admin");
    } finally {
      await db
        .update(schema.users)
        .set({ scimExternalId: null })
        .where(eq(schema.users.id, "anonymous"));
    }
  });
});
