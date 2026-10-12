import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { env } from "../../apps/api/src/config.js";
import { db } from "../../apps/api/src/db/index.js";
import { userFiles, users } from "../../apps/api/src/db/schema.js";
import { autoSaveToLibrary } from "../../apps/api/src/jobs/postprocess.js";
import { buildTestApp, type TestApp } from "./test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.cleanup();
});

test("autoSaveToLibrary respects quota after fix", async () => {
  // Create user with tight quota
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    username: `quota-user-${crypto.randomUUID()}`,
    email: `quota-autosave-${userId}@example.com`,
    passwordHash: "x",
    storageUsed: 0,
    storageQuota: 100, // 100 bytes
  });

  // Create a parent file
  const fileId = crypto.randomUUID();
  await db.insert(userFiles).values({
    id: fileId,
    userId,
    originalName: "parent.jpg",
    storedName: "parent-stored.jpg",
    mimeType: "image/jpeg",
    size: 10,
    version: 1,
  });

  // Attempt auto-save with a buffer larger than quota
  const buffer = Buffer.alloc(200, "x");

  const autoSaveResult = await autoSaveToLibrary({
    userId,
    fileId,
    buffer,
    outName: "child.jpg",
    contentType: "image/jpeg",
    toolId: "resize",
    saveMode: "new",
  });

  // Fixed behavior: it should return an error
  expect(autoSaveResult.error).toContain("Storage quota exceeded");
  expect(autoSaveResult.fileId).toBeUndefined();

  // File was not inserted
  const childFiles = await db.select().from(userFiles).where(eq(userFiles.parentId, fileId));
  expect(childFiles.length).toBe(0);

  // storageUsed is unchanged
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  expect(user.storageUsed).toBe(0);
});

test("autoSaveToLibrary successfully increments storageUsed", async () => {
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    username: `quota-user-${crypto.randomUUID()}`,
    email: `happy-autosave-${userId}@example.com`,
    passwordHash: "x",
    storageUsed: 0,
    storageQuota: 1000,
  });

  const fileId = crypto.randomUUID();
  await db.insert(userFiles).values({
    id: fileId,
    userId,
    originalName: "parent.jpg",
    storedName: "parent-stored.jpg",
    mimeType: "image/jpeg",
    size: 10,
    version: 1,
  });

  const buffer = Buffer.alloc(200, "x");

  const autoSaveResult = await autoSaveToLibrary({
    userId,
    fileId,
    buffer,
    outName: "child.jpg",
    contentType: "image/jpeg",
    toolId: "resize",
    saveMode: "new",
  });

  expect(autoSaveResult.error).toBeUndefined();
  expect(autoSaveResult.fileId).toBeDefined();

  const childFiles = await db
    .select()
    .from(userFiles)
    .where(eq(userFiles.id, autoSaveResult.fileId!));
  expect(childFiles.length).toBe(1);

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  expect(user.storageUsed).toBe(200);
});
