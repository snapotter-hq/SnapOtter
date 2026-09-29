import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { getStoredFilePath, saveThumbnail } from "../../../apps/api/src/lib/file-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * Deleting a user from the admin panel removed the user row and let the FK
 * cascade drop their user_files rows, but left every stored object, thumbnail,
 * and cached preview on disk with nothing pointing at them (#1405). The GDPR
 * purge already cleaned storage; the admin delete has to do the same.
 */
const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function uploadAs(token: string): Promise<{ id: string; storedName: string }> {
  const payload = createMultipartPayload([
    { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": payload.contentType },
    body: payload.body,
  });
  expect(res.statusCode, res.body).toBe(201);
  const { id } = JSON.parse(res.body).files[0] as { id: string };
  const [row] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));
  return { id, storedName: row?.storedName ?? "" };
}

function thumbnailPath(storedName: string): string {
  return join(env.FILES_STORAGE_PATH, ".thumbs", `${storedName}.thumb.jpg`);
}

function previewPath(id: string): string {
  return join(env.FILES_STORAGE_PATH, ".previews", `${id}.pdf`);
}

describe("admin user delete removes the user's library storage (#1405)", () => {
  it("removes stored files, thumbnails, and cached previews along with the user", async () => {
    const { token, userId } = await createUserAndLogin(testApp.app, "doomed-1405");
    const files = [await uploadAs(token), await uploadAs(token)];
    for (const file of files) {
      await saveThumbnail(file.storedName, Buffer.from("thumb"));
      await mkdir(join(env.FILES_STORAGE_PATH, ".previews"), { recursive: true });
      await writeFile(previewPath(file.id), "preview");
      expect(existsSync(getStoredFilePath(file.storedName))).toBe(true);
      expect(existsSync(thumbnailPath(file.storedName))).toBe(true);
    }

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);

    const rows = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.userId, userId));
    expect(rows).toEqual([]);
    for (const file of files) {
      expect(existsSync(getStoredFilePath(file.storedName)), "stored file").toBe(false);
      expect(existsSync(thumbnailPath(file.storedName)), "thumbnail").toBe(false);
      expect(existsSync(previewPath(file.id)), "cached preview").toBe(false);
    }
  });

  it("leaves another user's files alone", async () => {
    const keeper = await createUserAndLogin(testApp.app, "keeper-1405");
    const doomed = await createUserAndLogin(testApp.app, "doomed2-1405");
    const kept = await uploadAs(keeper.token);
    await uploadAs(doomed.token);

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${doomed.userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(existsSync(getStoredFilePath(kept.storedName))).toBe(true);
  });
});

describe("library delete removes cached previews (#1320, #1407)", () => {
  it("deletes every cached preview for the file along with it", async () => {
    const { token } = await createUserAndLogin(testApp.app, "library-1407");
    const file = await uploadAs(token);
    const previews = [".mp4", ".mp3", ".pdf"].map((ext) =>
      join(env.FILES_STORAGE_PATH, ".previews", `${file.id}${ext}`),
    );
    await mkdir(join(env.FILES_STORAGE_PATH, ".previews"), { recursive: true });
    for (const path of previews) await writeFile(path, "preview");

    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${token}` },
      payload: { ids: [file.id] },
    });
    expect(res.statusCode, res.body).toBe(200);
    for (const path of previews) expect(existsSync(path), path).toBe(false);
    expect(existsSync(getStoredFilePath(file.storedName))).toBe(false);
  });
});
