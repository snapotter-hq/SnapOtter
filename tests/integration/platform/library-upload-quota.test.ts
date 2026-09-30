/**
 * The library upload's quota and error answers (#1473):
 *
 * - A database fault while checking the quota is a server error (500,
 *   reported), never a 413: the client and the review panel both treat 413 as
 *   "you're out of space" and report nothing.
 * - The quota holds under concurrent uploads. Each upload used to check the
 *   quota before anything was charged and outside any transaction, so two
 *   uploads that each fit could both pass and together go over.
 * - A request the multipart parser rejects (too many files, an oversized
 *   field, a body cut off mid-file, a dropped connection) is the client's
 *   fault: 4xx with nothing kept, not a reported 500 or a handler left hanging.
 *
 * Blobs are tracked by name through a saveFile wrapper, as in
 * library-upload-atomic.test.ts.
 */
import { access } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { PassThrough } from "node:stream";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ savedNames: [] as string[] }));

vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (buffer: Buffer, originalName: string) => {
      const storedName = await actual.saveFile(buffer, originalName);
      hooks.savedNames.push(storedName);
      return storedName;
    },
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { deleteStoredFile, getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const TEAM_ID = "t1473-quota";

let testApp: TestApp;
let adminToken: string;
let adminId: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, "admin"));
  adminId = admin.id;
}, 30_000);

afterAll(async () => {
  const rows = await db.select({ storedName: schema.userFiles.storedName }).from(schema.userFiles);
  await Promise.all(rows.map((r) => deleteStoredFile(r.storedName)));
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  hooks.savedNames.length = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.update(schema.users).set({ storageQuota: null });
  await db.update(schema.teams).set({ storageQuota: null });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function upload(token: string, files: { name: string; content: Buffer; type: string }[]) {
  const { body, contentType } = createMultipartPayload(
    files.map((f) => ({ name: "file", filename: f.name, contentType: f.type, content: f.content })),
  );
  return rawUpload(token, contentType, body);
}

function rawUpload(token: string, contentType: string, payload: Buffer | NodeJS.ReadableStream) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload,
  });
}

const png = (name = "a.png") => ({ name, content: PNG, type: "image/png" });

async function libraryState(userIds: string[]) {
  const rows = await db
    .select({ id: schema.userFiles.id })
    .from(schema.userFiles)
    .where(inArray(schema.userFiles.userId, userIds));
  const users = await db
    .select({ storageUsed: schema.users.storageUsed })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  return { rows: rows.length, storageUsed: users.reduce((sum, u) => sum + u.storageUsed, 0) };
}

/** The blobs this test's requests wrote that are still on disk. */
async function survivingBlobs(): Promise<string[]> {
  const present = await Promise.all(
    hooks.savedNames.map((name) =>
      access(getStoredFilePath(name)).then(
        () => name,
        () => null,
      ),
    ),
  );
  return present.filter((n): n is string => n !== null);
}

/**
 * Make the Nth quota lookup (a select of storageUsed, storageQuota and team
 * off users) throw the way a dropped connection does. Other queries pass.
 */
function failQuotaLookup(nth: number) {
  const real = db.select.bind(db);
  let seen = 0;
  vi.spyOn(db, "select").mockImplementation(((fields?: Record<string, unknown>) => {
    if (fields && "storageUsed" in fields && "storageQuota" in fields && "team" in fields) {
      seen++;
      if (seen === nth) throw new Error("Connection terminated unexpectedly");
    }
    return real(fields as never);
  }) as typeof db.select);
}

describe("a database fault in the quota check is a 500, not a 413 (#1473)", () => {
  it("answers 500 when the check before reading any part fails", async () => {
    failQuotaLookup(1);
    const before = await libraryState([adminId]);

    const res = await upload(adminToken, [png()]);

    expect(res.statusCode).toBe(500);
    expect(await libraryState([adminId])).toEqual(before);
    expect(hooks.savedNames).toEqual([]);
  });

  it("answers 500 and keeps nothing when a later file's check fails", async () => {
    // 1: before reading, 2: the first file, 3: the second file.
    failQuotaLookup(3);
    const before = await libraryState([adminId]);

    const res = await upload(adminToken, [png("a.png"), png("b.png")]);

    expect(res.statusCode).toBe(500);
    expect(await libraryState([adminId])).toEqual(before);
    expect(hooks.savedNames).toHaveLength(1);
    expect(await survivingBlobs()).toEqual([]);
  });
});

describe("the quota holds under concurrent uploads (#1473)", () => {
  /**
   * Lock a row the way a slow upload's commit would, in a transaction of its
   * own, until release() is called.
   */
  async function holdRowLock(table: "users" | "teams", id: string) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const done = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${sql.identifier(table)} WHERE id = ${id} FOR UPDATE`);
      locked();
      await released;
    });
    await isLocked;
    return async () => {
      release();
      await done;
    };
  }

  async function sessionsWaitingOnALock(): Promise<number> {
    const { rows } = await db.execute(
      sql`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return Number((rows[0] as { n: number }).n);
  }

  /**
   * Start the uploads while a row they need is locked, wait until both are
   * queued on it (so both have passed every check that runs before the
   * commit), then let them go. Deterministic: without the commit's locked
   * re-check, both land.
   */
  async function raceBehindLock(
    release: () => Promise<void>,
    uploads: Array<() => ReturnType<typeof upload>>,
  ) {
    let settled = 0;
    const pending = uploads.map((start) =>
      start().finally(() => {
        settled++;
      }),
    );
    let bothQueued = false;
    try {
      await vi.waitFor(
        async () => {
          if ((await sessionsWaitingOnALock()) >= uploads.length) {
            bothQueued = true;
            return;
          }
          if (settled === uploads.length) return;
          throw new Error("the uploads haven't reached the lock yet");
        },
        { timeout: 10_000, interval: 20 },
      );
    } finally {
      await release();
    }
    return { results: await Promise.all(pending), bothQueued };
  }

  it("refuses one of two uploads that each fit the user's quota but not together", async () => {
    const before = await libraryState([adminId]);
    await db
      .update(schema.users)
      .set({ storageQuota: before.storageUsed + PNG.length + Math.floor(PNG.length / 2) })
      .where(eq(schema.users.id, adminId));

    const { results, bothQueued } = await raceBehindLock(await holdRowLock("users", adminId), [
      () => upload(adminToken, [png("a.png")]),
      () => upload(adminToken, [png("b.png")]),
    ]);

    expect(bothQueued, "both uploads should queue on the user's row").toBe(true);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 413]);
    const refused = results.find((r) => r.statusCode === 413);
    expect(JSON.parse(refused?.body ?? "{}").error).toMatch(/^Storage quota exceeded/);
    // The web app reads this code to say the library is full (#1350).
    expect(JSON.parse(refused?.body ?? "{}").code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(await libraryState([adminId])).toEqual({
      rows: before.rows + 1,
      storageUsed: before.storageUsed + PNG.length,
    });
    expect(hooks.savedNames).toHaveLength(2);
    expect(await survivingBlobs()).toHaveLength(1);
  });

  it("refuses one of two members' uploads that each fit the team's quota but not together", async () => {
    await db.insert(schema.teams).values({ id: TEAM_ID, name: "Quota1473" }).onConflictDoNothing();
    const first = await createUserAndLogin(testApp.app, "quota1473a");
    const second = await createUserAndLogin(testApp.app, "quota1473b");
    const members = [first.userId, second.userId];
    await db.update(schema.users).set({ team: TEAM_ID }).where(inArray(schema.users.id, members));
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)` })
      .from(schema.users)
      .where(eq(schema.users.team, TEAM_ID));
    await db
      .update(schema.teams)
      .set({ storageQuota: Number(total) + PNG.length + Math.floor(PNG.length / 2) })
      .where(eq(schema.teams.id, TEAM_ID));
    const before = await libraryState(members);

    const { results, bothQueued } = await raceBehindLock(await holdRowLock("teams", TEAM_ID), [
      () => upload(first.token, [png("a.png")]),
      () => upload(second.token, [png("b.png")]),
    ]);

    // Different users, so only the team's row can make them wait.
    expect(bothQueued, "both uploads should queue on the team's row").toBe(true);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 413]);
    const refused = results.find((r) => r.statusCode === 413);
    expect(JSON.parse(refused?.body ?? "{}").error).toMatch(/^Team storage quota exceeded/);
    // The web app reads this code to say the library is full (#1350).
    expect(JSON.parse(refused?.body ?? "{}").code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(await libraryState(members)).toEqual({
      rows: before.rows + 1,
      storageUsed: before.storageUsed + PNG.length,
    });
    expect(await survivingBlobs()).toHaveLength(1);
  });
});

describe("a request the multipart parser rejects is a 4xx (#1473)", () => {
  async function expectRejected(res: Awaited<ReturnType<typeof upload>>, before: object) {
    expect(res.statusCode, res.body).toBe(400);
    expect(await libraryState([adminId])).toEqual(before);
    expect(await survivingBlobs()).toEqual([]);
  }

  it("answers 400 for more files than MAX_BATCH_SIZE, keeping none of them", async () => {
    const before = await libraryState([adminId]);
    // vitest.config.ts sets MAX_BATCH_SIZE=10.
    const files = Array.from({ length: 11 }, (_, i) => png(`f${i}.png`));

    const res = await upload(adminToken, files);

    await expectRejected(res, before);
    expect(hooks.savedNames.length).toBeGreaterThan(0);
  });

  it("answers 400 for a field value over the size limit", async () => {
    const before = await libraryState([adminId]);
    const { body, contentType } = createMultipartPayload([
      { name: "toolId", content: "x".repeat(1024 * 1024 + 1) },
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    ]);

    const res = await rawUpload(adminToken, contentType, body);

    await expectRejected(res, before);
  });

  it("answers 400 for a body that ends partway through a file, keeping nothing", async () => {
    const before = await libraryState([adminId]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    // Cut the second file off halfway. The whole body is there before the
    // handler reaches that part, and busboy ends the part as if it were
    // complete: the handler must not save the half it can read.
    const truncated = body.subarray(0, body.length - Math.floor(PNG.length / 2));

    const res = await rawUpload(adminToken, contentType, truncated);

    await expectRejected(res, before);
    expect(hooks.savedNames).toHaveLength(1);
  });

  it("answers 400 when the body stops while a file is being read, keeping nothing", async () => {
    // Streamed, so the body ends after the handler has moved on to the
    // second file.
    const before = await libraryState([adminId]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    const payload = new PassThrough();
    payload.write(body.subarray(0, body.length - Math.floor(PNG.length / 2)));

    const response = rawUpload(adminToken, contentType, payload);
    await vi.waitFor(() => expect(hooks.savedNames).toHaveLength(1));
    await sleep(20);
    payload.end();

    await expectRejected(await response, before);
    expect(hooks.savedNames).toHaveLength(1);
  });

  it("discards the staged files when the client drops the connection mid-file", async () => {
    // A real dropped connection errors the request and never ends it, so
    // busboy never fails the part the handler is reading. The handler used to
    // wait on it forever and never discard the file it had already staged.
    const before = await libraryState([adminId]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    const address = await testApp.app.listen({ port: 0, host: "127.0.0.1" });
    const client = httpRequest(`${address}/api/v1/files/upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
        "content-length": body.length,
      },
    });
    client.on("error", () => {}); // the socket is dropped on purpose
    client.write(body.subarray(0, body.length - Math.floor(PNG.length / 2)));

    await vi.waitFor(() => expect(hooks.savedNames).toHaveLength(1), { timeout: 5_000 });
    await sleep(20);
    client.destroy();

    await vi.waitFor(async () => expect(await survivingBlobs()).toEqual([]), { timeout: 5_000 });
    expect(await libraryState([adminId])).toEqual(before);
  });
});

describe("save-result answers quota refusals and faults the same way (#1473)", () => {
  let parentId: string;

  beforeAll(async () => {
    const res = await upload(adminToken, [png("parent.png")]);
    expect(res.statusCode).toBe(201);
    parentId = JSON.parse(res.body).files[0].id;
  });

  function saveResult() {
    const { body, contentType } = createMultipartPayload([
      { name: "parentId", content: parentId },
      { name: "toolId", content: "resize" },
      { name: "file", filename: "result.png", contentType: "image/png", content: PNG },
    ]);
    return testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });
  }

  async function setAdminQuota(quota: (used: number) => number) {
    const { storageUsed } = await libraryState([adminId]);
    await db
      .update(schema.users)
      .set({ storageQuota: quota(storageUsed) })
      .where(eq(schema.users.id, adminId));
  }

  it("answers 500, not 413, when the quota lookup fails", async () => {
    failQuotaLookup(1);

    const res = await saveResult();

    expect(res.statusCode).toBe(500);
    expect(hooks.savedNames).toEqual([]);
  });

  it("answers 413 and stores nothing for a user already over quota", async () => {
    await setAdminQuota(() => 1);

    const res = await saveResult();

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toMatch(/^Storage quota exceeded/);
    expect(JSON.parse(res.body).code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(hooks.savedNames).toEqual([]);
  });

  it("answers 413 and stores nothing for a result that doesn't fit", async () => {
    await setAdminQuota((used) => used + 1);

    const res = await saveResult();

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toMatch(/^Storage quota exceeded/);
    expect(JSON.parse(res.body).code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(hooks.savedNames).toEqual([]);
  });
});
