import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSqlite,
  countLibraryBlobs,
  evaluateBootState,
  resolveSource,
} from "../../../apps/api/src/db/sqlite-import.js";
import { buildLegacySqlite, seedRealistic1xData } from "../../helpers/legacy-sqlite-fixture.js";

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
