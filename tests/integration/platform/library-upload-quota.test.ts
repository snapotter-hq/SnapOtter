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
 *   field, a body that ends mid-part) is the client's fault: 4xx, not a
 *   reported 500.
 *
 * Blobs are tracked by name through a saveFile wrapper, as in
 * library-upload-atomic.test.ts: FILES_STORAGE_PATH isn't per-fork (#1471).
 */
import { access } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  savedNames: [] as string[],
  /**
   * When above 0, every saveFile call waits until this many files have been
   * saved in total, so concurrent uploads all pass their per-file quota check
   * before any of them commits.
   */
  gate: 0,
  waiting: [] as Array<() => void>,
}));

vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (buffer: Buffer, originalName: string) => {
      const storedName = await actual.saveFile(buffer, originalName);
      hooks.savedNames.push(storedName);
      if (hooks.gate > 0) {
        if (hooks.savedNames.length >= hooks.gate) {
          for (const release of hooks.waiting.splice(0)) release();
        } else {
          await new Promise<void>((resolve) => hooks.waiting.push(resolve));
        }
      }
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
  hooks.gate = 0;
  hooks.waiting.length = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.update(schema.users).set({ storageQuota: null });
  await db.update(schema.teams).set({ storageQuota: null });
});

function upload(token: string, files: { name: string; content: Buffer; type: string }[]) {
  const { body, contentType } = createMultipartPayload(
    files.map((f) => ({ name: "file", filename: f.name, contentType: f.type, content: f.content })),
  );
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
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
  it("refuses one of two uploads that each fit the user's quota but not together", async () => {
    const before = await libraryState([adminId]);
    await db
      .update(schema.users)
      .set({ storageQuota: before.storageUsed + PNG.length + Math.floor(PNG.length / 2) })
      .where(eq(schema.users.id, adminId));
    hooks.gate = 2;

    const results = await Promise.all([
      upload(adminToken, [png("a.png")]),
      upload(adminToken, [png("b.png")]),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 413]);
    const refused = results.find((r) => r.statusCode === 413);
    expect(JSON.parse(refused?.body ?? "{}").error).toMatch(/^Storage quota exceeded/);
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
    hooks.gate = 2;

    const results = await Promise.all([
      upload(first.token, [png("a.png")]),
      upload(second.token, [png("b.png")]),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 413]);
    const refused = results.find((r) => r.statusCode === 413);
    expect(JSON.parse(refused?.body ?? "{}").error).toMatch(/^Team storage quota exceeded/);
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
    // Cut the second file off halfway: what the server sees when a client
    // drops the connection mid-upload.
    const truncated = body.subarray(0, body.length - Math.floor(PNG.length / 2));

    const res = await rawUpload(adminToken, contentType, truncated);

    await expectRejected(res, before);
  });

  it("answers 400 when the body stops while a file is being read, keeping nothing", async () => {
    // Over a real connection the handler is usually mid-read when the client
    // drops, so busboy fails the part stream it's reading rather than the
    // next part. Stream the body and cut it once the first file is saved.
    const before = await libraryState([adminId]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    const payload = new PassThrough();
    payload.write(body.subarray(0, body.length - Math.floor(PNG.length / 2)));

    const response = rawUpload(adminToken, contentType, payload);
    await vi.waitFor(() => expect(hooks.savedNames).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    payload.end();

    await expectRejected(await response, before);
  });
});
