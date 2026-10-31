import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeSqlite,
  countLibraryBlobs,
  detachedSummarySuffix,
  evaluateBootState,
  getImportMarker,
  resolveSource,
  runBootImport,
} from "../../../apps/api/src/db/sqlite-import.js";
import { buildLegacySqlite, seedRealistic1xData } from "../../helpers/legacy-sqlite-fixture.js";

async function truncateMigratedTables(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.TEST_PRIVILEGED_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "TRUNCATE user_files, audit_log, jobs, pipelines, api_keys, sessions, roles, settings, teams, users CASCADE",
    );
  } finally {
    await client.end();
  }
}

describe("resolveSource", () => {
  it("returns null for the 'off' sentinel", () => {
    expect(resolveSource({ SQLITE_MIGRATE_PATH: "off", DATA_DIR: "/data" })).toBeNull();
    expect(resolveSource({ SQLITE_MIGRATE_PATH: "OFF", DATA_DIR: "/data" })).toBeNull();
  });
  it("prefers an explicit path", () => {
    expect(resolveSource({ SQLITE_MIGRATE_PATH: "/x/foo.db", DATA_DIR: "/data" })).toBe(
      "/x/foo.db",
    );
  });
  it("probes DATA_DIR/snapotter.db when unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "src-"));
    writeFileSync(join(dir, "snapotter.db"), "x");
    expect(resolveSource({ SQLITE_MIGRATE_PATH: "", DATA_DIR: dir })).toBe(
      join(dir, "snapotter.db"),
    );
  });
  it("returns null when nothing is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "src-"));
    expect(resolveSource({ SQLITE_MIGRATE_PATH: "", DATA_DIR: dir })).toBeNull();
  });
});

describe("evaluateBootState", () => {
  it("import when users empty, source present, no marker", () => {
    expect(evaluateBootState({ usersCount: 0, source: "/a.db", marker: null })).toBe("import");
  });
  it("leftover when a completed marker exists", () => {
    expect(
      evaluateBootState({ usersCount: 5, source: "/a.db", marker: { status: "completed" } }),
    ).toBe("leftover");
  });
  it("locked when source present, users non-empty, no marker", () => {
    expect(evaluateBootState({ usersCount: 1, source: "/a.db", marker: null })).toBe("locked");
  });
  it("none when no source", () => {
    expect(evaluateBootState({ usersCount: 0, source: null, marker: null })).toBe("none");
  });
});

describe("countLibraryBlobs", () => {
  it("counts present and missing library blobs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "blob-"));
    const dbPath = join(dir, "legacy.db");
    buildLegacySqlite(dbPath);
    await seedRealistic1xData(dbPath); // seeds user_files uf-1 -> stored_name abc123.png
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });
    writeFileSync(join(filesDir, "abc123.png"), "img");
    expect(await countLibraryBlobs(dbPath, filesDir)).toEqual({ present: 1, missing: 0 });
  });
});

describe("analyzeSqlite", () => {
  it("reports counts, blobs, and out-of-enum statuses without a live Postgres", async () => {
    const dir = mkdtempSync(join(tmpdir(), "analyze-"));
    const dbPath = join(dir, "legacy.db");
    buildLegacySqlite(dbPath);
    await seedRealistic1xData(dbPath); // 1 user, 2 jobs (one "error"), 1 user_file
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });
    writeFileSync(join(filesDir, "abc123.png"), "img"); // the uf-1 blob
    const report = await analyzeSqlite(dbPath, filesDir);
    expect(report.tables.users).toBe(1);
    expect(report.tables.jobs).toBe(2);
    expect(report.blobs).toEqual({ present: 1, missing: 0 });
    expect(report.badStatuses).toContain("error"); // will be mapped to "failed" on import
  });
});

describe("detachedSummarySuffix", () => {
  it("formats zero, one, and multiple detached identities", () => {
    expect(detachedSummarySuffix(0)).toBe("");
    expect(detachedSummarySuffix(1)).toBe("; 1 user imported without their SSO identity");
    expect(detachedSummarySuffix(2)).toBe("; 2 users imported without their SSO identity");
  });
});

describe("runBootImport", () => {
  beforeEach(async () => {
    await truncateMigratedTables();
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("records detached SSO identities in the sqlite_import marker and logs the count", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-import-twins-"));
    const dbPath = join(dir, "snapotter.db");
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });

    buildLegacySqlite(dbPath);
    const s = new Database(dbPath);
    try {
      const ins = s.prepare(
        `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
          auth_provider, external_id, email, created_at, updated_at)
         VALUES (?,?,NULL,'user','Default',0,?,?,NULL,?,?)`,
      );
      ins.run("u-twin-b", "sso-user", "oidc", "ext-twin", 1748000000, 1748000000);
      ins.run("u-twin-a", "sso-user-2", "oidc", "ext-twin", 1748000060, 1748000060);
      ins.run("u-twin-c", "sso-user-3", "oidc", "ext-twin", 1748000120, 1748000120);
    } finally {
      s.close();
    }

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const state = await runBootImport({
        SQLITE_MIGRATE_PATH: dbPath,
        DATA_DIR: dir,
        FILES_STORAGE_PATH: filesDir,
      });
      expect(state).toBe("import");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }

    const marker = await getImportMarker();
    expect(marker?.status).toBe("completed");
    expect(marker?.detached).toEqual([
      {
        id: "u-twin-a",
        username: "sso-user-2",
        authProvider: "oidc",
        externalId: "ext-twin",
        keptBy: { id: "u-twin-b", username: "sso-user" },
      },
      {
        id: "u-twin-c",
        username: "sso-user-3",
        authProvider: "oidc",
        externalId: "ext-twin",
        keptBy: { id: "u-twin-b", username: "sso-user" },
      },
    ]);

    const importedLine = logs.find((l) => l.startsWith("Imported 1.x SQLite database:"));
    expect(importedLine).toBeDefined();
    expect(importedLine).toContain("; 2 users imported without their SSO identity");
  });

  it("uses singular phrasing when 1 user is imported without their SSO identity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-import-one-twin-"));
    const dbPath = join(dir, "snapotter.db");
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });

    buildLegacySqlite(dbPath);
    const s = new Database(dbPath);
    try {
      const ins = s.prepare(
        `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
          auth_provider, external_id, email, created_at, updated_at)
         VALUES (?,?,NULL,'user','Default',0,?,?,NULL,?,?)`,
      );
      ins.run("u-twin-1", "sso-1", "oidc", "ext-1", 1748000000, 1748000000);
      ins.run("u-twin-2", "sso-2", "oidc", "ext-1", 1748000060, 1748000060);
    } finally {
      s.close();
    }

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runBootImport({
        SQLITE_MIGRATE_PATH: dbPath,
        DATA_DIR: dir,
        FILES_STORAGE_PATH: filesDir,
      });
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }

    const importedLine = logs.find((l) => l.startsWith("Imported 1.x SQLite database:"));
    expect(importedLine).toContain("; 1 user imported without their SSO identity");
  });

  it("records an empty detached list and omits the suffix when no identities were detached", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-import-clean-"));
    const dbPath = join(dir, "snapotter.db");
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });

    buildLegacySqlite(dbPath);
    await seedRealistic1xData(dbPath);

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await runBootImport({
        SQLITE_MIGRATE_PATH: dbPath,
        DATA_DIR: dir,
        FILES_STORAGE_PATH: filesDir,
      });
    } finally {
      logSpy.mockRestore();
    }

    const marker = await getImportMarker();
    expect(marker?.status).toBe("completed");
    expect(marker?.detached).toEqual([]);

    const importedLine = logs.find((l) => l.startsWith("Imported 1.x SQLite database:"));
    expect(importedLine).toBeDefined();
    expect(importedLine).not.toContain("without their SSO identity");
  });
});
