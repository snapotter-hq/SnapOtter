/**
 * A multi-file library upload is all-or-nothing (#1342). The handler used to
 * write, record, and charge each file inside its read loop, so a later file
 * that failed (over the upload limit, over quota) left the earlier ones saved
 * while the client got an error and assumed nothing was.
 *
 * Every case checks all three places a file lands: the user_files rows and the
 * users.storage_used counter (this fork's own database), and the blobs this
 * request wrote. The blobs are tracked by name through a saveFile wrapper
 * rather than by counting the folder: FILES_STORAGE_PATH isn't per-fork, so
 * other test files write and delete there while this one runs.
 */
import { access } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const savedNames = vi.hoisted(() => [] as string[]);
vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (buffer: Buffer, originalName: string) => {
      const storedName = await actual.saveFile(buffer, originalName);
      savedNames.push(storedName);
      return storedName;
    },
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
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
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  savedNames.length = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.update(schema.users).set({ storageQuota: null }).where(eq(schema.users.id, adminId));
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
    savedNames.map((name) =>
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

describe("multi-file library upload is all-or-nothing (#1342)", () => {
  it("saves nothing when a later file is over the upload limit", async () => {
    const before = await dbState();

    const res = await upload([
      { name: "ok.png", content: PNG, type: "image/png" },
      { name: "big.bin", content: OVER_LIMIT, type: "application/octet-stream" },
    ]);

    expect(res.statusCode).toBe(413);
    expect(await dbState()).toEqual(before);
    // The first file was written before the second failed; it must be gone.
    expect(savedNames).toHaveLength(1);
    expect(await survivingBlobs()).toEqual([]);
  });

  it("saves nothing when a later file puts the batch over quota", async () => {
    const before = await dbState();
    // Room for the PNG but not the PNG plus the JPG.
    await db
      .update(schema.users)
      .set({ storageQuota: before.storageUsed + PNG.length + 1 })
      .where(eq(schema.users.id, adminId));

    const res = await upload([
      { name: "a.png", content: PNG, type: "image/png" },
      { name: "b.jpg", content: JPG, type: "image/jpeg" },
    ]);

    expect(res.statusCode).toBe(413);
    expect(await dbState()).toEqual(before);
    expect(savedNames).toHaveLength(1);
    expect(await survivingBlobs()).toEqual([]);
  });

  it("removes the staged files when the database commit fails", async () => {
    const before = await dbState();
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("connection reset"));

    const res = await upload([
      { name: "a.png", content: PNG, type: "image/png" },
      { name: "b.jpg", content: JPG, type: "image/jpeg" },
    ]);

    expect(res.statusCode).toBe(409);
    expect(await dbState()).toEqual(before);
    expect(savedNames).toHaveLength(2);
    expect(await survivingBlobs()).toEqual([]);
  });

  it("saves every file and charges the quota once when all of them are fine", async () => {
    const before = await dbState();

    const res = await upload([
      { name: "a.png", content: PNG, type: "image/png" },
      { name: "b.jpg", content: JPG, type: "image/jpeg" },
    ]);

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).files.map((f: { originalName: string }) => f.originalName)).toEqual(
      ["a.png", "b.jpg"],
    );
    expect(await dbState()).toEqual({
      rows: before.rows + 2,
      storageUsed: before.storageUsed + PNG.length + JPG.length,
    });
    expect(await survivingBlobs()).toEqual(savedNames);
    expect(savedNames).toHaveLength(2);
  });
});
