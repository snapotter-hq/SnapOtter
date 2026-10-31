/**
 * Integration tests for the weekly storage reconciliation job.
 *
 * Exercises the real code path against an isolated per-fork Postgres database:
 * summing userFiles sizes per user, correcting drift on users.storageUsed,
 * skipping the null-userId group, and both zero-out branches (some users have
 * files vs. no users have files).
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import { storageReconciliationJob } from "../../../apps/api/src/jobs/storage-reconciliation.js";

beforeAll(async () => {
  await runMigrations();
});

// Track everything created per test so we can clean up deterministically. The
// job scans the WHOLE users/userFiles tables in the fork DB, so leftover rows
// would leak into the "no users have files" branch of later tests.
let createdUserIds: string[] = [];
let createdFileIds: string[] = [];

afterEach(async () => {
  try {
    if (createdFileIds.length > 0) {
      await db.delete(schema.userFiles).where(inArray(schema.userFiles.id, createdFileIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(schema.userFiles).where(inArray(schema.userFiles.userId, createdUserIds));
      await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
    }
  } finally {
    createdUserIds = [];
    createdFileIds = [];
  }
});

async function makeUser(storageUsed: number): Promise<string> {
  const id = `recon-${randomUUID().slice(0, 12)}`;
  await db.insert(schema.users).values({
    id,
    username: `recon-${randomUUID().slice(0, 12)}`,
    passwordHash: "hash",
    role: "user",
    team: "Default",
    mustChangePassword: false,
    storageUsed,
  });
  createdUserIds.push(id);
  return id;
}

async function addFile(userId: string | null, size: number): Promise<string> {
  const id = `file-${randomUUID().slice(0, 12)}`;
  await db.insert(schema.userFiles).values({
    id,
    userId,
    originalName: "recon.bin",
    storedName: `recon-${id}.bin`,
    mimeType: "application/octet-stream",
    size,
  });
  createdFileIds.push(id);
  return id;
}

async function storageOf(userId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ storageUsed: schema.users.storageUsed })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.storageUsed;
}

describe("storageReconciliationJob (integration)", () => {
  it("corrects an undercounted storageUsed to the real file-size sum", async () => {
    const userId = await makeUser(0); // counter stale at 0
    await addFile(userId, 500);
    await addFile(userId, 1500);

    await storageReconciliationJob();

    // coalesce(sum(size)) == 2000, so the counter is rewritten
    expect(await storageOf(userId)).toBe(2000);
  });

  it("corrects an overcounted storageUsed down to the real sum", async () => {
    const userId = await makeUser(9_999); // counter far too high
    await addFile(userId, 42);

    await storageReconciliationJob();

    expect(await storageOf(userId)).toBe(42);
  });

  it("leaves an already-correct counter untouched (no update, updated stays 0)", async () => {
    const userId = await makeUser(1234);
    await addFile(userId, 1234);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      // Snapshot before mockRestore(), which clears mock.calls.
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    // Value unchanged, and the != guard means the UPDATE matched no row so it
    // was not counted as a correction.
    expect(await storageOf(userId)).toBe(1234);
    const line = logLines.find((s) => s.includes("reconciliation"));
    expect(line).toBe("Storage reconciliation complete: 1 users checked, 0 corrected");
  });

  it("skips the null-userId group without crashing, excludes it from checked count, and still reconciles real users", async () => {
    const userId = await makeUser(0);
    await addFile(userId, 700);
    // Orphaned file with no owner: grouped under a null userId and skipped.
    await addFile(null, 999);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await expect(storageReconciliationJob()).resolves.toBeUndefined();
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    expect(await storageOf(userId)).toBe(700);
    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toBe("Storage reconciliation complete: 1 users checked, 1 corrected");
  });

  it("zeros positive and negative stale counters on fileless users and counts them as corrections (notInArray branch)", async () => {
    const withFiles = await makeUser(300);
    await addFile(withFiles, 300);
    // Has positive and negative nonzero counters with zero files: both must be zeroed.
    const stalePositive = await makeUser(5_000);
    const staleNegative = await makeUser(-500);
    const alreadyZero = await makeUser(0);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    expect(await storageOf(withFiles)).toBe(300);
    expect(await storageOf(stalePositive)).toBe(0);
    expect(await storageOf(staleNegative)).toBe(0);
    expect(await storageOf(alreadyZero)).toBe(0);
    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toBe("Storage reconciliation complete: 3 users checked, 2 corrected");
  });

  it("zeros every positive and negative stale counter when no user in the DB has any files and counts them (else branch)", async () => {
    // Force the else branch: remove ALL userFiles so `actual` is empty.
    await db.delete(schema.userFiles);
    createdFileIds = [];

    const stalePositive = await makeUser(7_777);
    const staleNegative = await makeUser(-500);
    const alreadyZero = await makeUser(0);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    expect(await storageOf(stalePositive)).toBe(0);
    expect(await storageOf(staleNegative)).toBe(0);
    expect(await storageOf(alreadyZero)).toBe(0);
    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toBe("Storage reconciliation complete: 2 users checked, 2 corrected");
  });

  it("does not touch a fileless user whose counter is already 0 in the else branch", async () => {
    await db.delete(schema.userFiles);
    createdFileIds = [];

    const zeroed = await makeUser(0);

    // Should be a no-op (WHERE storageUsed != 0 excludes it); still 0 afterwards.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    expect(await storageOf(zeroed)).toBe(0);
    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toBe("Storage reconciliation complete: 0 users checked, 0 corrected");
  });

  it("sums multiple files across two users independently", async () => {
    const a = await makeUser(0);
    const b = await makeUser(0);
    await addFile(a, 100);
    await addFile(a, 250);
    await addFile(b, 40);

    await storageReconciliationJob();

    expect(await storageOf(a)).toBe(350);
    expect(await storageOf(b)).toBe(40);
  });

  it("logs the completion summary counting checked users and corrections", async () => {
    const userId = await makeUser(0);
    await addFile(userId, 88);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      // Snapshot before mockRestore(), which clears mock.calls.
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toBeDefined();
    expect(line as string).toMatch(/\d+ users checked, \d+ corrected/);
  });

  it("coalesces the sum to a plain integer (no NaN / bigint drift)", async () => {
    const userId = await makeUser(0);
    await addFile(userId, 0); // zero-size file: coalesce keeps sum at 0

    await storageReconciliationJob();

    const value = await storageOf(userId);
    expect(value).toBe(0);
    expect(Number.isInteger(value)).toBe(true);
  });

  it("reconciles a user whose library sum exceeds 2 GiB (32-bit signed integer limit) without failing (#1531)", async () => {
    const heavyUser = await makeUser(0);
    const otherUser = await makeUser(0);
    await addFile(heavyUser, 1_000_000_000);
    await addFile(heavyUser, 1_000_000_000);
    await addFile(heavyUser, 1_000_000_000);
    await addFile(otherUser, 500);

    await storageReconciliationJob();

    expect(await storageOf(heavyUser)).toBe(3_000_000_000);
    expect(await storageOf(otherUser)).toBe(500);

    // Second run with storageUsed already at 3_000_000_000 (> 2^31 - 1) must
    // match the != guard and report 0 corrections.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let logLines: string[] = [];
    try {
      await storageReconciliationJob();
      logLines = logSpy.mock.calls.map((c) => String(c[0]));
    } finally {
      logSpy.mockRestore();
    }

    expect(await storageOf(heavyUser)).toBe(3_000_000_000);
    expect(await storageOf(otherUser)).toBe(500);
    const line = logLines.find((s) => s.includes("Storage reconciliation complete"));
    expect(line).toContain("0 corrected");
  });
});
