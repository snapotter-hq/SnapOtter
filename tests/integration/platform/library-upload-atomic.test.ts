/**
 * A multi-file library upload is all-or-nothing (#1342). The handler used to
 * write, record, and charge each file inside its read loop, so a later file
 * that failed (over the upload limit, over quota) left the earlier ones saved
 * while the client got an error and assumed nothing was.
 *
 * Every failure case checks all three places a file lands: the user_files rows
 * and the users.storage_used counter (this fork's own database), and the blobs
 * this request wrote. The blobs are tracked by name through a saveFile wrapper
 * rather than by counting the folder: FILES_STORAGE_PATH isn't per-fork, so
 * other test files write and delete there while this one runs (#1471).
 */
import { access } from "node:fs/promises";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  savedNames: [] as string[],
  /** 1-based saveFile call that throws, or 0 for none. */
  failSaveOnCall: 0,
  /** When set, sanitizeSvg throws a non-400 error (the handler's 500 branch). */
  svgUnexpectedError: false,
}));

vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (buffer: Buffer, originalName: string) => {
      if (hooks.failSaveOnCall && hooks.savedNames.length + 1 === hooks.failSaveOnCall) {
        throw new Error("simulated disk failure");
      }
      const storedName = await actual.saveFile(buffer, originalName);
      hooks.savedNames.push(storedName);
      return storedName;
    },
  };
});

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  return {
    ...actual,
    sanitizeSvg: (buffer: Buffer) => {
      if (hooks.svgUnexpectedError) throw new Error("simulated sanitizer crash");
      return actual.sanitizeSvg(buffer);
    },
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { deleteStoredFile, getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
// vitest runs with MAX_UPLOAD_SIZE_MB=10 (vitest.config.ts).
const OVER_LIMIT = Buffer.alloc(11 * 1024 * 1024, 1);
// 5001 elements clear the sanitizer's 5000 cap (svg-upload-sanitization test).
const OVER_CAP_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
);
const SMALL_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

let testApp: TestApp;
let adminToken: string;
let adminId: string;
let adminTeam: string;
/** Rows and blobs the success cases keep, removed in afterAll. */
const keptIds: string[] = [];
const keptBlobs: string[] = [];

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  const [admin] = await db
    .select({ id: schema.users.id, team: schema.users.team })
    .from(schema.users)
    .where(eq(schema.users.username, "admin"));
  adminId = admin.id;
  adminTeam = admin.team;
}, 30_000);

afterAll(async () => {
  if (keptIds.length)
    await db.delete(schema.userFiles).where(inArray(schema.userFiles.id, keptIds));
  await Promise.all(keptBlobs.map((name) => deleteStoredFile(name)));
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  hooks.savedNames.length = 0;
  hooks.failSaveOnCall = 0;
  hooks.svgUnexpectedError = false;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db
    .update(schema.users)
    .set({ storageQuota: null, team: adminTeam })
    .where(eq(schema.users.id, adminId));
  await db.update(schema.teams).set({ storageQuota: null });
});

async function dbState() {
  const rows = await db
    .select({ id: schema.userFiles.id })
    .from(schema.userFiles)
    .where(eq(schema.userFiles.userId, adminId));
  const [user] = await db
    .select({ storageUsed: schema.users.storageUsed })
    .from(schema.users)
    .where(eq(schema.users.id, adminId));
  return { rows: rows.length, storageUsed: user.storageUsed };
}

/** The blobs this request wrote that are still on disk. */
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

function upload(files: { name: string; content: Buffer; type: string }[]) {
  const { body, contentType } = createMultipartPayload(
    files.map((f) => ({ name: "file", filename: f.name, contentType: f.type, content: f.content })),
  );
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    payload: body,
  });
}

const png = (name = "a.png") => ({ name, content: PNG, type: "image/png" });
const jpg = (name = "b.jpg") => ({ name, content: JPG, type: "image/jpeg" });

/** An upload that failed must leave no row, no charge, and no blob behind. */
async function expectNothingSaved(before: Awaited<ReturnType<typeof dbState>>, staged: number) {
  expect(await dbState()).toEqual(before);
  // Proves the rollback had something to undo, not that nothing was tried.
  expect(hooks.savedNames).toHaveLength(staged);
  expect(await survivingBlobs()).toEqual([]);
}

describe("multi-file library upload is all-or-nothing (#1342)", () => {
  it("saves nothing when a later file is over the upload limit", async () => {
    const before = await dbState();
    const res = await upload([
      png("ok.png"),
      { name: "big.bin", content: OVER_LIMIT, type: "application/octet-stream" },
    ]);
    expect(res.statusCode).toBe(413);
    await expectNothingSaved(before, 1);
  });

  it("saves nothing when a later file puts the batch over the user's quota", async () => {
    const before = await dbState();
    // Room for the PNG but not the PNG plus the JPG.
    await db
      .update(schema.users)
      .set({ storageQuota: before.storageUsed + PNG.length + 1 })
      .where(eq(schema.users.id, adminId));

    const res = await upload([png(), jpg()]);
    expect(res.statusCode).toBe(413);
    await expectNothingSaved(before, 1);
  });

  it("saves nothing when a later file puts the batch over the team's quota", async () => {
    const before = await dbState();
    const [team] = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    // users.team holds a team id for users created through the API; the
    // bootstrap admin keeps the column default, so point it at the real row.
    await db.update(schema.users).set({ team: team.id }).where(eq(schema.users.id, adminId));
    // Summed the way checkStorageQuota does: other users in this fork's
    // database may share the team.
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)` })
      .from(schema.users)
      .where(eq(schema.users.team, team.id));
    await db
      .update(schema.teams)
      .set({ storageQuota: Number(total) + PNG.length + 1 })
      .where(eq(schema.teams.id, team.id));

    const res = await upload([png(), jpg()]);
    expect(res.statusCode).toBe(413);
    await expectNothingSaved(before, 1);
  });

  it("saves nothing when a later SVG is over the sanitizer's element cap", async () => {
    const before = await dbState();
    const res = await upload([
      png(),
      { name: "huge.svg", content: OVER_CAP_SVG, type: "image/svg+xml" },
    ]);
    expect(res.statusCode).toBe(400);
    await expectNothingSaved(before, 1);
  });

  it("saves nothing when the sanitizer crashes on a later SVG", async () => {
    const before = await dbState();
    hooks.svgUnexpectedError = true;
    const res = await upload([png(), { name: "x.svg", content: SMALL_SVG, type: "image/svg+xml" }]);
    expect(res.statusCode).toBe(500);
    await expectNothingSaved(before, 1);
  });

  it("saves nothing when writing a later file to storage fails", async () => {
    const before = await dbState();
    hooks.failSaveOnCall = 2;
    const res = await upload([png(), jpg()]);
    expect(res.statusCode).toBe(500);
    await expectNothingSaved(before, 1);
  });

  it("rolls back the rows and removes the blobs when the commit fails after inserting", async () => {
    const before = await dbState();
    // Run the real transaction, insert and all, then fail before it commits.
    const real = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(((fn: Parameters<typeof real>[0]) =>
      real(async (tx) => {
        await fn(tx);
        throw new Error("connection reset");
      })) as typeof db.transaction);

    const res = await upload([png(), jpg()]);
    expect(res.statusCode).toBe(500);
    await expectNothingSaved(before, 2);
  });

  it("skips an empty part and saves the rest", async () => {
    const before = await dbState();
    const res = await upload([
      { name: "empty.png", content: Buffer.alloc(0), type: "image/png" },
      png(),
    ]);
    expect(res.statusCode).toBe(201);
    const files = JSON.parse(res.body).files as { id: string; originalName: string }[];
    expect(files.map((f) => f.originalName)).toEqual(["a.png"]);
    keptIds.push(...files.map((f) => f.id));
    keptBlobs.push(...hooks.savedNames);
    expect(await dbState()).toEqual({
      rows: before.rows + 1,
      storageUsed: before.storageUsed + PNG.length,
    });
  });

  it("saves every file and charges the quota once when all of them are fine", async () => {
    const before = await dbState();
    const res = await upload([png(), jpg()]);

    expect(res.statusCode).toBe(201);
    const files = JSON.parse(res.body).files as { id: string; originalName: string }[];
    expect(files.map((f) => f.originalName)).toEqual(["a.png", "b.jpg"]);
    keptIds.push(...files.map((f) => f.id));
    keptBlobs.push(...hooks.savedNames);
    expect(await dbState()).toEqual({
      rows: before.rows + 2,
      storageUsed: before.storageUsed + PNG.length + JPG.length,
    });
    expect(hooks.savedNames).toHaveLength(2);
    expect(await survivingBlobs()).toEqual(hooks.savedNames);
  });
});
