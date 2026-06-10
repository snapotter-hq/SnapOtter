import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../apps/api/src/config.js";
import { db, schema } from "../../apps/api/src/db/index.js";
import { runMigrations } from "../../apps/api/src/db/migrate.js";
import {
  getMaxAgeMs,
  shouldRunStartupCleanup,
  startCleanupCron,
} from "../../apps/api/src/lib/cleanup.js";

beforeAll(async () => {
  await runMigrations();
});

async function setSetting(key: string, value: string) {
  const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing) {
    await db
      .update(schema.settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.settings.key, key));
  } else {
    await db.insert(schema.settings).values({ key, value });
  }
}

async function removeSetting(key: string) {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

async function waitForCleanup(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  await removeSetting("tempFileMaxAgeHours");
  await removeSetting("startupCleanup");
});

describe("getMaxAgeMs", () => {
  it("returns DB value when tempFileMaxAgeHours is set", async () => {
    await setSetting("tempFileMaxAgeHours", "48");
    const result = await getMaxAgeMs();
    expect(result).toBe(48 * 60 * 60 * 1000);
  });

  it("returns env fallback when no DB setting exists", async () => {
    await removeSetting("tempFileMaxAgeHours");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for invalid (non-numeric) DB value", async () => {
    await setSetting("tempFileMaxAgeHours", "notanumber");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for zero or negative DB value", async () => {
    await setSetting("tempFileMaxAgeHours", "0");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);

    await setSetting("tempFileMaxAgeHours", "-5");
    const result2 = await getMaxAgeMs();
    expect(result2).toBe(1 * 60 * 60 * 1000);
  });

  it("handles fractional hours", async () => {
    await setSetting("tempFileMaxAgeHours", "0.5");
    const result = await getMaxAgeMs();
    expect(result).toBe(0.5 * 60 * 60 * 1000);
  });
});

describe("shouldRunStartupCleanup", () => {
  it("returns false when setting is 'false'", async () => {
    await setSetting("startupCleanup", "false");
    expect(await shouldRunStartupCleanup()).toBe(false);
  });

  it("returns true when setting is 'true'", async () => {
    await setSetting("startupCleanup", "true");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true when setting is not set", async () => {
    await removeSetting("startupCleanup");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true for any value other than 'false'", async () => {
    await setSetting("startupCleanup", "yes");
    expect(await shouldRunStartupCleanup()).toBe(true);

    await setSetting("startupCleanup", "1");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });
});

describe("startCleanupCron", () => {
  let tempDir: string;
  let originalWorkspacePath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `cleanup-test-${randomUUID().slice(0, 8)}`);
    originalWorkspacePath = env.WORKSPACE_PATH;
    env.WORKSPACE_PATH = tempDir;
    await setSetting("startupCleanup", "false");
  });

  afterEach(async () => {
    env.WORKSPACE_PATH = originalWorkspacePath;
    await removeSetting("startupCleanup");
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns object with stop() method", async () => {
    vi.useFakeTimers();
    const cron = await startCleanupCron();
    expect(typeof cron.stop).toBe("function");
    cron.stop();
    vi.useRealTimers();
  });

  it("creates workspace directory", async () => {
    vi.useFakeTimers();
    expect(existsSync(tempDir)).toBe(false);
    const cron = await startCleanupCron();
    expect(existsSync(tempDir)).toBe(true);
    cron.stop();
    vi.useRealTimers();
  });

  it("stop() clears intervals", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const cron = await startCleanupCron();
    cron.stop();
    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it("removes old files on startup cleanup", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldFile = join(tempDir, "old-file.txt");
    writeFileSync(oldFile, "old content");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(oldFile, pastTime, pastTime);

    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldFile)).toBe(false);
    cron.stop();
  });

  it("keeps recent files on startup cleanup", async () => {
    mkdirSync(tempDir, { recursive: true });
    const recentFile = join(tempDir, "recent-file.txt");
    writeFileSync(recentFile, "recent content");

    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();
    await waitForCleanup();
    expect(existsSync(recentFile)).toBe(true);
    cron.stop();
  });

  it("removes old subdirectory when its mtime is expired", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldDir = join(tempDir, "old-dir");
    mkdirSync(oldDir);
    const nestedFile = join(oldDir, "nested.txt");
    writeFileSync(nestedFile, "nested");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(nestedFile, pastTime, pastTime);
    utimesSync(oldDir, pastTime, pastTime);

    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldDir)).toBe(false);
    cron.stop();
  });

  it("skips startup cleanup when startupCleanup is false", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldFile = join(tempDir, "skip-old.txt");
    writeFileSync(oldFile, "old");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(oldFile, pastTime, pastTime);

    await setSetting("startupCleanup", "false");
    const cron = await startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldFile)).toBe(true);
    cron.stop();
  });

  it("purges expired sessions on startup when enabled", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const userId = `test-user-${randomUUID().slice(0, 8)}`;
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!existing) {
      await db.insert(schema.users).values({
        id: userId,
        username: `cleanup-test-${randomUUID().slice(0, 8)}`,
        passwordHash: "hash",
        role: "user",
        team: "Default",
        mustChangePassword: false,
      });
    }

    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      expiresAt: pastDate,
    });

    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    expect(session).toBeUndefined();
    cron.stop();

    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("does not purge non-expired sessions", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const userId = `test-user-${randomUUID().slice(0, 8)}`;
    await db.insert(schema.users).values({
      id: userId,
      username: `cleanup-keep-${randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      role: "user",
      team: "Default",
      mustChangePassword: false,
    });

    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      expiresAt: futureDate,
    });

    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    expect(session).toBeDefined();
    cron.stop();

    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("handles empty workspace directory gracefully", async () => {
    mkdirSync(tempDir, { recursive: true });
    await setSetting("startupCleanup", "true");
    const cron = await startCleanupCron();
    await waitForCleanup();
    expect(existsSync(tempDir)).toBe(true);
    cron.stop();
  });
});
