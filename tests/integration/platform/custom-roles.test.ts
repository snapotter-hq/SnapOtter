import { eq, inArray, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { raceInserts, raceRowLocks, waitForLockWaiters } from "../../helpers/pg-race.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("custom roles", () => {
  let customRoleId: string;

  const rename = (id: string, name: string) =>
    testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name },
    });
  const remove = (id: string) =>
    testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

  it("lists built-in roles", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.roles.length).toBeGreaterThanOrEqual(3);
    expect(body.roles.some((r: any) => r.name === "admin" && r.isBuiltin)).toBe(true);
    expect(body.roles.some((r: any) => r.name === "editor" && r.isBuiltin)).toBe(true);
    expect(body.roles.some((r: any) => r.name === "user" && r.isBuiltin)).toBe(true);
  });

  it("creates a custom role", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "reviewer",
        description: "Can view all files and pipelines",
        permissions: ["files:all", "pipelines:all", "settings:read"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("reviewer");
    expect(body.permissions).toEqual(["files:all", "pipelines:all", "settings:read"]);
    customRoleId = body.id;
  });

  it("cannot create duplicate role name", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "admin", permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("concurrent duplicate creates return one 201 and one 409, never 500", async () => {
    // Issue #927: requests that pass the duplicate pre-check before the
    // winner's insert commits used to surface the 23505 unique violation
    // as a 500. raceInserts holds both requests at the insert so each one
    // passes the pre-check.
    const name = `race-role-${Date.now().toString(36)}`;
    const create = () =>
      testApp.app.inject({
        method: "POST",
        url: "/api/v1/roles",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name, permissions: ["tools:use"] },
      });

    const results = await raceInserts("roles", 2, () => Promise.all([create(), create()]));
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Role name already exists",
      code: "CONFLICT",
    });

    const rows = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
    expect(rows).toHaveLength(1);

    // The 409 loser must not leave a phantom audit row; ROLE_CREATED is
    // only written after the insert guard.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'ROLE_CREATED' AND ${schema.auditLog.details}->>'roleName' = ${name}`,
      );
    expect(auditRows).toHaveLength(1);

    await db.delete(schema.roles).where(eq(schema.roles.name, name));
  });

  it("can assign custom role to user", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "customroleuser", password: "CustomRole1", role: "reviewer" },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "customroleuser"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const body = JSON.parse(loginRes.body);
    expect(body.user.role).toBe("reviewer");
    expect(body.user.permissions).toContain("files:all");
    expect(body.user.permissions).not.toContain("tools:use");
  });

  it("updates custom role permissions", async () => {
    const permissions = ["files:all", "pipelines:all", "settings:read", "tools:use"];
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${customRoleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions },
    });
    expect(res.statusCode).toBe(200);

    // A 200 alone would survive the update being swallowed, and this is the
    // no-rename path through the #991 try/catch, so read the write back.
    const [row] = await db.select().from(schema.roles).where(eq(schema.roles.id, customRoleId));
    expect(row?.permissions).toEqual(permissions);
  });

  it("concurrent renames onto one name return one 200 and one 409, never 500", async () => {
    // Issue #991: both renames clear the duplicate pre-check before either
    // UPDATE commits, so the loser used to surface the 23505 as a 500. The
    // rename also rewrites every matching users.role string, and that has to
    // share the rename's transaction, so the assignees below pin one moving
    // and one staying put.
    const suffix = Date.now().toString(36);
    const names = [`race-put-a-${suffix}`, `race-put-b-${suffix}`];
    const target = `race-put-t-${suffix}`;

    const ids: string[] = [];
    for (const name of names) {
      const created = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/roles",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name, permissions: ["tools:use"] },
      });
      expect(created.statusCode).toBe(201);
      ids.push(JSON.parse(created.body).id);
    }

    const userIds = names.map((name) => `assignee-${name}`);
    await db
      .insert(schema.users)
      .values(names.map((name, i) => ({ id: userIds[i], username: userIds[i], role: name })));

    // The rename opens its transaction by locking the role row (#1152), so
    // the contenders park at that read rather than at the UPDATE.
    const results = await raceRowLocks("roles", 2, () =>
      Promise.all([rename(ids[0], target), rename(ids[1], target)]),
    );
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Role name already exists",
      code: "CONFLICT",
    });

    // Everything from here down guards the transaction boundary rather than the
    // 409 mapping, so it survives a revert of the fix. Don't prune it as dead
    // weight: the assignee check below is what catches the users.role rewrite
    // escaping the rename's transaction.
    const roleRows = await db.select().from(schema.roles).where(inArray(schema.roles.id, ids));
    expect(roleRows.filter((r) => r.name === target)).toHaveLength(1);
    const survivor = roleRows.find((r) => r.name !== target);
    expect(survivor).toBeDefined();

    // The loser rolls back whole: its assignee keeps the old role name
    // rather than following a rename that never committed. Fails if the
    // users.role rewrite ever escapes the rename's transaction.
    const assignees = await db.select().from(schema.users).where(inArray(schema.users.id, userIds));
    expect(assignees.map((u) => u.role).sort()).toEqual([survivor?.name, target].sort());

    // The 409 loser must not leave a phantom audit row; ROLE_UPDATED is only
    // written once the transaction has committed. Filtered to this test's own
    // role ids because an earlier test in the file writes ROLE_UPDATED too.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_UPDATED'`);
    const mine = auditRows.filter((r) =>
      ids.includes((r.details as { roleId?: string } | null)?.roleId ?? ""),
    );
    expect(mine).toHaveLength(1);
    const winnerId = roleRows.find((r) => r.name === target)?.id;
    expect((mine[0]?.details as { roleId?: string } | null)?.roleId).toBe(winnerId);

    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await db.delete(schema.roles).where(inArray(schema.roles.id, ids));
  });

  it("concurrent renames of one role to two names keep its users on the surviving name", async () => {
    // Issue #1152: both renames read the role's name before either
    // transaction opened, then used it as the users.role predicate. The
    // second one's rewrite matched nothing (the rows already carried the
    // first new name), its roles UPDATE still landed, and every assignee was
    // stranded on a name with no row behind it. The row lock makes the
    // second rename wait for the first and re-read the name it commits.
    const suffix = Date.now().toString(36);
    const name = `race-fork-${suffix}`;
    const created = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, permissions: ["tools:use"] },
    });
    expect(created.statusCode).toBe(201);
    const roleId = JSON.parse(created.body).id;
    const userId = `assignee-${name}`;
    await db.insert(schema.users).values({ id: userId, username: userId, role: name });

    const targets = [`${name}-x`, `${name}-y`];
    const results = await raceRowLocks("roles", 2, () =>
      Promise.all(targets.map((target) => rename(roleId, target))),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);

    // Serialized, so the later rename wins. Whichever that was, the assignee
    // has to follow it: a role name nobody holds means the user has no
    // permissions and the role lists nobody.
    const [row] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
    expect(targets).toContain(row?.name);
    const [assignee] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(assignee?.role).toBe(row?.name);

    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
  });

  it("renaming a role deleted after its pre-checks returns 404 and audits nothing", async () => {
    // Issue #1152, second symptom: with the role read outside the
    // transaction, a delete landing in between left the roles UPDATE
    // matching zero rows while the caller still got 200 and a ROLE_UPDATED
    // audit row for a role that no longer existed. The delete runs on the
    // harness's locking transaction, which is the only session that can
    // write while the rename is parked at its row lock.
    const suffix = Date.now().toString(36);
    const created = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `race-gone-${suffix}`, permissions: ["tools:use"] },
    });
    expect(created.statusCode).toBe(201);
    const roleId = JSON.parse(created.body).id;

    const res = await raceRowLocks(
      "roles",
      1,
      () => rename(roleId, `race-gone-${suffix}-x`),
      (tx) => tx.delete(schema.roles).where(eq(schema.roles.id, roleId)),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Role not found", code: "NOT_FOUND" });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_UPDATED'`);
    expect(
      auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === roleId),
    ).toHaveLength(0);
  });

  it("a rename racing a delete of the same role never deadlocks and frees its users", async () => {
    // The rename locks the role row before it rewrites users.role, so the
    // delete has to take that same lock first too. Left as users-then-roles,
    // the two would each hold the row the other needs and Postgres would
    // kill one of them with 40P01, a 500 for a pair of valid requests.
    // The order is staged: the rename is holding the role row (parked at its
    // users rewrite) before the delete starts, so the delete queues behind
    // that lock and has to rewrite from the renamed row it re-reads. A
    // delete that starts with users instead either deadlocks against the
    // rename or strands the assignee on the renamed name.
    const suffix = Date.now().toString(36);
    const name = `race-drop-${suffix}`;
    const created = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, permissions: ["tools:use"] },
    });
    expect(created.statusCode).toBe(201);
    const roleId = JSON.parse(created.body).id;
    const userId = `assignee-${name}`;
    await db.insert(schema.users).values({ id: userId, username: userId, role: name });

    const [renamed, deleted] = await raceRowLocks("users", 2, async () => {
      const renaming = rename(roleId, `${name}-x`);
      await waitForLockWaiters(1);
      return Promise.all([renaming, remove(roleId)]);
    });
    expect(renamed.statusCode).toBe(200);
    expect(deleted.statusCode).toBe(200);

    const rows = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
    expect(rows).toHaveLength(0);
    const [assignee] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(assignee?.role).toBe("user");

    // The audit names the role as it was when the delete ran, the renamed
    // one, not the name the handler read before its transaction.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_DELETED'`);
    const mine = auditRows.filter(
      (r) => (r.details as { roleId?: string } | null)?.roleId === roleId,
    );
    expect(mine.map((r) => (r.details as { roleName?: string } | null)?.roleName)).toEqual([
      `${name}-x`,
    ]);

    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("deleting a role removed after its pre-checks returns 404 and audits nothing", async () => {
    // The delete's side of the same window: its pre-checks read the row, the
    // harness removes it before the transaction can lock it, and the
    // transaction finds nothing to lock. Without the lock this committed an
    // empty users rewrite, deleted zero rows and still audited ROLE_DELETED.
    const suffix = Date.now().toString(36);
    const created = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `race-gone-del-${suffix}`, permissions: ["tools:use"] },
    });
    expect(created.statusCode).toBe(201);
    const roleId = JSON.parse(created.body).id;

    const res = await raceRowLocks(
      "roles",
      1,
      () => remove(roleId),
      (tx) => tx.delete(schema.roles).where(eq(schema.roles.id, roleId)),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Role not found", code: "NOT_FOUND" });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_DELETED'`);
    expect(
      auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === roleId),
    ).toHaveLength(0);
  });

  it("rethrows a non-unique constraint failure instead of answering 200", async () => {
    // The catch added for #991 returns 409 only for a 23505 on roles.name.
    // Every other failure has to keep travelling to the error handler, or a
    // rename that never committed comes back as a success. A CHECK constraint
    // gives a deterministic 23514 through that same catch.
    const suffix = Date.now().toString(36);
    const name = `rethrow-src-${suffix}`;
    const created = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, permissions: ["tools:use"] },
    });
    expect(created.statusCode).toBe(201);
    const roleId = JSON.parse(created.body).id;

    // DDL is not among the runtime role's grants (#821), so the probe
    // constraint goes on and comes off over the owning role's connection.
    const owner = new pg.Client({ connectionString: process.env.TEST_PRIVILEGED_DATABASE_URL });
    await owner.connect();
    await owner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT roles_rethrow_probe CHECK (name <> 'rethrow-blocked')`,
    );
    try {
      const res = await testApp.app.inject({
        method: "PUT",
        url: `/api/v1/roles/${roleId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "rethrow-blocked" },
      });
      expect(res.statusCode).toBe(500);

      const [row] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
      expect(row?.name).toBe(name);

      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(sql`${schema.auditLog.action} = 'ROLE_UPDATED'`);
      expect(
        auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === roleId),
      ).toHaveLength(0);
    } finally {
      await owner.query(`ALTER TABLE "roles" DROP CONSTRAINT roles_rethrow_probe`);
      await owner.end();
      await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
    }
  });

  it("cannot modify built-in roles", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const builtinRole = JSON.parse(listRes.body).roles.find((r: any) => r.name === "admin");
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${builtinRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot delete built-in roles", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const builtinRole = JSON.parse(listRes.body).roles.find((r: any) => r.name === "admin");
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${builtinRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("deleting custom role reassigns users to user", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${customRoleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const body = JSON.parse(loginRes.body);
    expect(body.user.role).toBe("user");
  });

  it("requires users:manage to create roles", async () => {
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "hacker", permissions: ["users:manage"] },
    });
    expect(res.statusCode).toBe(403);
  });
});
