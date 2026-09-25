import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../apps/api/src/db/index.js";
import {
  MIGRATED_TABLES,
  type MigrationResult,
  migrateFromSqlite,
} from "../../../apps/api/src/db/migrate-from-sqlite.js";
import { buildLegacySqlite, seedRealistic1xData } from "../../helpers/legacy-sqlite-fixture.js";

/**
 * Empty the tables the importer writes into, so each suite starts from the
 * "fresh 2.0 install" the migrator expects.
 *
 * On its own connection as the owning role: TRUNCATE is not among the runtime
 * role's grants and must not become one, since the app never truncates. Only
 * this reset does, and that is a test-fixture need rather than an application
 * one.
 */
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

function buildFixtureSqlite(path: string): void {
  const s = new Database(path);
  s.exec(`
    CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL, password_hash text,
      role text NOT NULL DEFAULT 'user', team text NOT NULL DEFAULT 'Default',
      must_change_password integer NOT NULL DEFAULT 1, auth_provider text NOT NULL DEFAULT 'local',
      external_id text, email text, created_at integer NOT NULL, updated_at integer NOT NULL);
    CREATE TABLE teams (id text PRIMARY KEY, name text NOT NULL, created_at integer NOT NULL);
    CREATE TABLE settings ("key" text PRIMARY KEY, value text NOT NULL, updated_at integer NOT NULL);
    CREATE TABLE roles (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
      permissions text NOT NULL, is_builtin integer NOT NULL DEFAULT 0, created_by text,
      created_at integer NOT NULL, updated_at integer NOT NULL);
    CREATE TABLE sessions (id text PRIMARY KEY, user_id text NOT NULL, expires_at integer NOT NULL,
      id_token text, created_at integer NOT NULL);
    CREATE TABLE api_keys (id text PRIMARY KEY, user_id text NOT NULL, key_hash text NOT NULL,
      key_prefix text, name text NOT NULL DEFAULT 'Default API Key', permissions text,
      created_at integer NOT NULL, last_used_at integer, expires_at integer);
    CREATE TABLE pipelines (id text PRIMARY KEY, user_id text, name text NOT NULL, description text,
      steps text NOT NULL, created_at integer NOT NULL);
    CREATE TABLE jobs (id text PRIMARY KEY, type text NOT NULL, status text NOT NULL DEFAULT 'queued',
      progress real NOT NULL DEFAULT 0, input_files text NOT NULL, output_path text, settings text,
      error text, created_at integer NOT NULL, completed_at integer);
    CREATE TABLE audit_log (id text PRIMARY KEY, actor_id text, actor_username text NOT NULL,
      action text NOT NULL, target_type text, target_id text, details text, ip_address text,
      created_at integer NOT NULL);
    CREATE TABLE user_files (id text PRIMARY KEY, user_id text, original_name text NOT NULL,
      stored_name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL, width integer,
      height integer, version integer NOT NULL DEFAULT 1, parent_id text, tool_chain text,
      created_at integer NOT NULL);
  `);
  const now = 1750000000; // seconds epoch, as 1.x stored
  s.prepare(
    "INSERT INTO users (id, username, password_hash, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?)",
  ).run("u1", "alice", "hash", 0, now, now);
  s.prepare("INSERT INTO teams (id, name, created_at) VALUES (?,?,?)").run("t1", "Legal", now);
  s.prepare('INSERT INTO settings ("key", value, updated_at) VALUES (?,?,?)').run(
    "cookieSecret",
    "not-json-value",
    now,
  );
  s.prepare(
    "INSERT INTO roles (id, name, permissions, is_builtin, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run("r1", "auditor", '["audit:read"]', 1, "u1", now, now);
  s.prepare("INSERT INTO pipelines (id, user_id, name, steps, created_at) VALUES (?,?,?,?,?)").run(
    "p1",
    "u1",
    "shrink",
    '[{"toolId":"compress","settings":{"quality":70}}]',
    now,
  );
  s.prepare(
    "INSERT INTO jobs (id, type, status, progress, input_files, created_at, completed_at) VALUES (?,?,?,?,?,?,?)",
  ).run("j1", "batch", "completed", 1, '["a.png"]', now, null);
  s.prepare(
    "INSERT INTO jobs (id, type, status, progress, input_files, output_path, error, created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run("j2", "single", "failed", 0.5, "[]", "/out/result.png", "Something broke", now);
  s.prepare(
    "INSERT INTO audit_log (id, actor_username, action, details, created_at) VALUES (?,?,?,?,?)",
  ).run("al1", "alice", "login", null, now);
  s.prepare(
    "INSERT INTO user_files (id, user_id, original_name, stored_name, mime_type, size, version, tool_chain, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run("uf1", "u1", "photo.png", "abc123.png", "image/png", 1024, 1, null, now);
  s.close();
}

describe("migrate-from-sqlite", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapotter-migrator-"));
  const sqlitePath = join(dir, "snapotter-1x.db");

  beforeAll(async () => {
    buildFixtureSqlite(sqlitePath);
    // simulate empty 2.0 target: wipe all rows the suite DB may have
    await truncateMigratedTables();
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("copies all rows with converted types", async () => {
    const result = await migrateFromSqlite(sqlitePath, { force: false });
    expect(result.tables.users).toBe(1);
    expect(result.tables.pipelines).toBe(1);
    const [user] = (await db.execute(sql`SELECT * FROM users WHERE id = 'u1'`)).rows;
    expect(user.username).toBe("alice");
    expect(user.must_change_password).toBe(false); // 0 became boolean false
    expect(new Date(user.created_at as string).getTime()).toBe(1750000000 * 1000); // seconds became timestamptz
    const [pipeline] = (await db.execute(sql`SELECT * FROM pipelines WHERE id = 'p1'`)).rows;
    expect((pipeline.steps as Array<{ toolId: string }>)[0].toolId).toBe("compress"); // text JSON became jsonb
    const [setting] = (await db.execute(sql`SELECT * FROM settings WHERE key = 'cookieSecret'`))
      .rows;
    expect(setting.value).toBe("not-json-value"); // settings.value stayed text, untouched
    const [job] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j1'`)).rows;
    expect(job.completed_at).toBeNull(); // explicit NULL preserved
    // 1.x progress (real 1.0) became jsonb {percent: 100}
    expect(job.progress).toEqual({ percent: 100 });
    // 1.x input_files became input_refs (empty array, dead paths discarded)
    expect(job.input_refs).toEqual([]);
    // 1.x error NULL preserved as null
    expect(job.error).toBeNull();
    // Verify j2: error text became jsonb, progress 0.5 became {percent: 50}, output_path became output_refs
    const [job2] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j2'`)).rows;
    expect(job2.progress).toEqual({ percent: 50 });
    expect(job2.error).toEqual({ message: "Something broke" });
    expect(job2.input_refs).toEqual([]);
    expect(job2.output_refs).toEqual([]);
    // audit_log with NULL details
    const alRows = (await db.execute(sql`SELECT * FROM audit_log WHERE id = 'al1'`)).rows;
    expect(alRows).toHaveLength(1);
    expect(alRows[0].details).toBeNull();
    expect(result.tables.audit_log).toBe(1);
    // user_files with NULL tool_chain
    const ufRows = (await db.execute(sql`SELECT * FROM user_files WHERE id = 'uf1'`)).rows;
    expect(ufRows).toHaveLength(1);
    expect(ufRows[0].tool_chain).toBeNull();
    expect(result.tables.user_files).toBe(1);
  });

  it("refuses a non-empty target without force", async () => {
    await expect(migrateFromSqlite(sqlitePath, { force: false })).rejects.toThrow(/non-empty/i);
  });

  it("force on populated target fails on PK collision and rolls back", async () => {
    // The first test already inserted rows; forcing again should hit a PK/unique violation
    await expect(migrateFromSqlite(sqlitePath, { force: true })).rejects.toThrow();
    // Rollback must leave previous data intact
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
    expect(rows[0].n).toBe(1);
  });
});

/**
 * Representative 1.x import: a more realistic SQLite database with multiple
 * rows, diverse type-conversion edge cases (booleans, timestamps, JSON
 * columns, NULLs), and all 10 tables populated.
 */
describe("migrate-from-sqlite (representative 1.x database)", () => {
  const reprDir = mkdtempSync(join(tmpdir(), "snapotter-migrator-repr-"));
  const reprPath = join(reprDir, "snapotter-1x-representative.db");

  function buildRepresentativeSqlite(path: string): void {
    const s = new Database(path);
    s.exec(`
      CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL, password_hash text,
        role text NOT NULL DEFAULT 'user', team text NOT NULL DEFAULT 'Default',
        must_change_password integer NOT NULL DEFAULT 1, auth_provider text NOT NULL DEFAULT 'local',
        external_id text, email text, created_at integer NOT NULL, updated_at integer NOT NULL);
      CREATE TABLE teams (id text PRIMARY KEY, name text NOT NULL, created_at integer NOT NULL);
      CREATE TABLE settings ("key" text PRIMARY KEY, value text NOT NULL, updated_at integer NOT NULL);
      CREATE TABLE roles (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
        permissions text NOT NULL, is_builtin integer NOT NULL DEFAULT 0, created_by text,
        created_at integer NOT NULL, updated_at integer NOT NULL);
      CREATE TABLE sessions (id text PRIMARY KEY, user_id text NOT NULL, expires_at integer NOT NULL,
        id_token text, created_at integer NOT NULL);
      CREATE TABLE api_keys (id text PRIMARY KEY, user_id text NOT NULL, key_hash text NOT NULL,
        key_prefix text, name text NOT NULL DEFAULT 'Default API Key', permissions text,
        created_at integer NOT NULL, last_used_at integer, expires_at integer);
      CREATE TABLE pipelines (id text PRIMARY KEY, user_id text, name text NOT NULL, description text,
        steps text NOT NULL, created_at integer NOT NULL);
      CREATE TABLE jobs (id text PRIMARY KEY, type text NOT NULL, status text NOT NULL DEFAULT 'queued',
        progress real NOT NULL DEFAULT 0, input_files text NOT NULL, output_path text, settings text,
        error text, created_at integer NOT NULL, completed_at integer);
      CREATE TABLE audit_log (id text PRIMARY KEY, actor_id text, actor_username text NOT NULL,
        action text NOT NULL, target_type text, target_id text, details text, ip_address text,
        created_at integer NOT NULL);
      CREATE TABLE user_files (id text PRIMARY KEY, user_id text, original_name text NOT NULL,
        stored_name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL, width integer,
        height integer, version integer NOT NULL DEFAULT 1, parent_id text, tool_chain text,
        created_at integer NOT NULL);
    `);

    const t1 = 1748000000; // epoch seconds
    const t2 = 1748100000;
    const t3 = 1748200000;

    // ── Users: multiple users with diverse boolean/null combos ──
    const insU = s.prepare(
      `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
        auth_provider, external_id, email, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insU.run(
      "u-admin",
      "admin",
      "scrypt-hash-1",
      "admin",
      "Default",
      0,
      "local",
      null,
      "admin@example.com",
      t1,
      t1,
    );
    insU.run(
      "u-editor",
      "editor",
      "scrypt-hash-2",
      "editor",
      "Design",
      1,
      "local",
      null,
      null,
      t2,
      t2,
    );
    insU.run(
      "u-oidc",
      "sso-user",
      null,
      "user",
      "Default",
      0,
      "oidc",
      "ext-id-123",
      "sso@corp.com",
      t3,
      t3,
    );

    // ── Teams ──
    const insT = s.prepare("INSERT INTO teams (id, name, created_at) VALUES (?,?,?)");
    insT.run("tm-1", "Default", t1);
    insT.run("tm-2", "Design", t1);
    insT.run("tm-3", "Engineering", t2);

    // ── Settings: plain string, JSON-like string, numeric string ──
    const insS = s.prepare('INSERT INTO settings ("key", value, updated_at) VALUES (?,?,?)');
    insS.run("cookieSecret", "super-secret-value", t1);
    insS.run("siteName", "My SnapOtter", t1);
    insS.run("maxUploadSize", "50", t2);

    // ── Roles: builtin and custom ──
    const insR = s.prepare(
      `INSERT INTO roles (id, name, description, permissions, is_builtin, created_by,
        created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    );
    insR.run("r-admin", "admin", "Full access", '["*"]', 1, null, t1, t1);
    insR.run(
      "r-custom",
      "reviewer",
      "Can view audit logs",
      '["audit:read","files:read"]',
      0,
      "u-admin",
      t2,
      t2,
    );

    // ── Sessions ──
    const insSes = s.prepare(
      "INSERT INTO sessions (id, user_id, expires_at, id_token, created_at) VALUES (?,?,?,?,?)",
    );
    insSes.run("ses-1", "u-admin", t3, null, t1);
    insSes.run("ses-2", "u-oidc", t3, "eyJhbGciOiJSUzI1NiJ9.fake-jwt-token", t2);

    // ── API Keys: with and without permissions/expiry ──
    const insK = s.prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, permissions,
        created_at, last_used_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    insK.run("ak-1", "u-admin", "hash-abc", "si_abc", "Admin Key", '["*"]', t1, t2, null);
    insK.run("ak-2", "u-editor", "hash-def", "si_def", "Read-Only", '["files:read"]', t2, null, t3);

    // ── Pipelines: single-step and multi-step ──
    const insP = s.prepare(
      `INSERT INTO pipelines (id, user_id, name, description, steps, created_at)
       VALUES (?,?,?,?,?,?)`,
    );
    insP.run(
      "p-1",
      "u-admin",
      "Quick Shrink",
      "Compress to 70%",
      '[{"toolId":"compress","settings":{"quality":70}}]',
      t1,
    );
    insP.run(
      "p-2",
      "u-editor",
      "Full Process",
      null,
      '[{"toolId":"resize","settings":{"width":800}},{"toolId":"compress","settings":{"quality":80}}]',
      t2,
    );

    // ── Jobs: diverse statuses, progress, errors, timestamps ──
    const insJ = s.prepare(
      `INSERT INTO jobs (id, type, status, progress, input_files, output_path, settings,
        error, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    insJ.run(
      "j-done",
      "single",
      "completed",
      1.0,
      '["uploads/photo.png"]',
      "/out/photo_compressed.png",
      '{"quality":70}',
      null,
      t1,
      t2,
    );
    insJ.run(
      "j-fail",
      "single",
      "failed",
      0.33,
      "[]",
      null,
      '{"width":99999}',
      "Out of memory",
      t1,
      t1,
    );
    insJ.run(
      "j-queue",
      "batch",
      "queued",
      0.0,
      '["a.png","b.png","c.png"]',
      null,
      null,
      null,
      t2,
      null,
    );
    insJ.run("j-null", "single", "completed", 1.0, '["x.jpg"]', "/out/x.jpg", null, null, t3, t3);

    // ── Audit log: various actions with and without details/target ──
    const insA = s.prepare(
      `INSERT INTO audit_log (id, actor_id, actor_username, action, target_type,
        target_id, details, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    insA.run("al-1", "u-admin", "admin", "login", null, null, null, "192.168.1.1", t1);
    insA.run(
      "al-2",
      "u-admin",
      "admin",
      "settings.update",
      "setting",
      "siteName",
      '{"key":"siteName","oldValue":"SnapOtter","newValue":"My SnapOtter"}',
      "192.168.1.1",
      t1,
    );
    insA.run("al-3", "u-editor", "editor", "file.upload", "file", "uf-1", null, "10.0.0.5", t2);
    insA.run(
      "al-4",
      null,
      "system",
      "user.create",
      "user",
      "u-oidc",
      '{"provider":"oidc"}',
      null,
      t3,
    );

    // ── User files: various types, dimensions, tool_chain, parent ──
    const insUF = s.prepare(
      `INSERT INTO user_files (id, user_id, original_name, stored_name, mime_type,
        size, width, height, version, parent_id, tool_chain, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insUF.run(
      "uf-1",
      "u-editor",
      "photo.png",
      "abc123.png",
      "image/png",
      204800,
      1920,
      1080,
      1,
      null,
      null,
      t1,
    );
    insUF.run(
      "uf-2",
      "u-editor",
      "photo_compressed.png",
      "def456.png",
      "image/png",
      102400,
      1920,
      1080,
      2,
      "uf-1",
      '["compress"]',
      t2,
    );
    insUF.run(
      "uf-3",
      "u-admin",
      "report.pdf",
      "ghi789.pdf",
      "application/pdf",
      512000,
      null,
      null,
      1,
      null,
      null,
      t2,
    );
    insUF.run(
      "uf-4",
      "u-oidc",
      "meeting.mp4",
      "jkl012.mp4",
      "video/mp4",
      10485760,
      null,
      null,
      1,
      null,
      '["trim-video","compress-video"]',
      t3,
    );

    s.close();
  }

  beforeAll(async () => {
    buildRepresentativeSqlite(reprPath);
    await truncateMigratedTables();
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("imports all tables with correct row counts", async () => {
    const result = await migrateFromSqlite(reprPath, { force: false });
    expect(result.tables.users).toBe(3);
    expect(result.tables.teams).toBe(3);
    expect(result.tables.settings).toBe(3);
    expect(result.tables.roles).toBe(2);
    expect(result.tables.api_keys).toBe(2);
    expect(result.tables.pipelines).toBe(2);
    expect(result.tables.jobs).toBe(4);
    expect(result.tables.audit_log).toBe(4);
    expect(result.tables.user_files).toBe(4);
  });

  it("boolean conversions: 0 -> false, 1 -> true", async () => {
    const users = (await db.execute(sql`SELECT * FROM users ORDER BY id`)).rows;
    // u-admin: must_change_password=0 -> false
    const admin = users.find((u) => u.id === "u-admin");
    expect(admin?.must_change_password).toBe(false);
    // u-editor: must_change_password=1 -> true
    const editor = users.find((u) => u.id === "u-editor");
    expect(editor?.must_change_password).toBe(true);
    // u-oidc: must_change_password=0 -> false
    const oidc = users.find((u) => u.id === "u-oidc");
    expect(oidc?.must_change_password).toBe(false);
  });

  it("timestamp conversions: epoch seconds -> timestamptz", async () => {
    const [admin] = (await db.execute(sql`SELECT * FROM users WHERE id = 'u-admin'`)).rows;
    expect(new Date(admin.created_at as string).getTime()).toBe(1748000000 * 1000);
    expect(new Date(admin.updated_at as string).getTime()).toBe(1748000000 * 1000);
    // A different row's distinct timestamp also converts
    const [oidc] = (await db.execute(sql`SELECT * FROM users WHERE id = 'u-oidc'`)).rows;
    expect(new Date(oidc.created_at as string).getTime()).toBe(1748200000 * 1000);
  });

  it("JSON column conversions: text -> jsonb", async () => {
    // Pipelines: steps text -> jsonb array
    const [p1] = (await db.execute(sql`SELECT * FROM pipelines WHERE id = 'p-1'`)).rows;
    const steps1 = p1.steps as Array<{ toolId: string }>;
    expect(steps1).toHaveLength(1);
    expect(steps1[0].toolId).toBe("compress");
    // Multi-step pipeline
    const [p2] = (await db.execute(sql`SELECT * FROM pipelines WHERE id = 'p-2'`)).rows;
    const steps2 = p2.steps as Array<{ toolId: string }>;
    expect(steps2).toHaveLength(2);
    expect(steps2[0].toolId).toBe("resize");
    expect(steps2[1].toolId).toBe("compress");

    // Roles: permissions text -> jsonb array
    const [rAdmin] = (await db.execute(sql`SELECT * FROM roles WHERE id = 'r-admin'`)).rows;
    expect(rAdmin.permissions).toEqual(["*"]);
    const [rCustom] = (await db.execute(sql`SELECT * FROM roles WHERE id = 'r-custom'`)).rows;
    expect(rCustom.permissions).toEqual(["audit:read", "files:read"]);

    // API keys: permissions
    const [ak1] = (await db.execute(sql`SELECT * FROM api_keys WHERE id = 'ak-1'`)).rows;
    expect(ak1.permissions).toEqual(["*"]);
  });

  it("jobs: progress/error/input/output column remapping", async () => {
    // Completed: progress 1.0 -> {percent: 100}, error null
    const [jDone] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j-done'`)).rows;
    expect(jDone.progress).toEqual({ percent: 100 });
    expect(jDone.error).toBeNull();
    expect(jDone.input_refs).toEqual([]);
    expect(jDone.output_refs).toEqual([]);
    expect(jDone.settings).toEqual({ quality: 70 });
    expect(jDone.completed_at).not.toBeNull();

    // Failed: progress 0.33 -> {percent: 33}, error text -> {message}
    const [jFail] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j-fail'`)).rows;
    expect(jFail.progress).toEqual({ percent: 33 });
    expect(jFail.error).toEqual({ message: "Out of memory" });

    // Queued: progress 0 -> {percent: 0}, null settings, null completed_at
    const [jQueue] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j-queue'`)).rows;
    expect(jQueue.progress).toEqual({ percent: 0 });
    expect(jQueue.settings).toBeNull();
    expect(jQueue.completed_at).toBeNull();

    // Null settings round-trips
    const [jNull] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j-null'`)).rows;
    expect(jNull.settings).toBeNull();
    expect(jNull.completed_at).not.toBeNull();
  });

  it("audit_log: details null and JSON both handled", async () => {
    const rows = (await db.execute(sql`SELECT * FROM audit_log ORDER BY id`)).rows;
    expect(rows).toHaveLength(4);
    const al1 = rows.find((r) => r.id === "al-1");
    expect(al1?.details).toBeNull();
    const al2 = rows.find((r) => r.id === "al-2");
    expect(al2?.details).toEqual({
      key: "siteName",
      oldValue: "SnapOtter",
      newValue: "My SnapOtter",
    });
    const al4 = rows.find((r) => r.id === "al-4");
    expect(al4?.actor_id).toBeNull();
    expect(al4?.details).toEqual({ provider: "oidc" });
  });

  it("user_files: tool_chain null and JSON, width/height null", async () => {
    const rows = (await db.execute(sql`SELECT * FROM user_files ORDER BY id`)).rows;
    expect(rows).toHaveLength(4);
    const uf1 = rows.find((r) => r.id === "uf-1");
    expect(uf1?.tool_chain).toBeNull();
    expect(uf1?.width).toBe(1920);
    expect(uf1?.height).toBe(1080);
    const uf2 = rows.find((r) => r.id === "uf-2");
    expect(uf2?.tool_chain).toEqual(["compress"]);
    expect(uf2?.parent_id).toBe("uf-1");
    expect(uf2?.version).toBe(2);
    const uf3 = rows.find((r) => r.id === "uf-3");
    expect(uf3?.width).toBeNull();
    expect(uf3?.height).toBeNull();
    const uf4 = rows.find((r) => r.id === "uf-4");
    expect(uf4?.tool_chain).toEqual(["trim-video", "compress-video"]);
  });

  it("settings: plain string values preserved as-is", async () => {
    const rows = (await db.execute(sql`SELECT * FROM settings ORDER BY key`)).rows;
    expect(rows).toHaveLength(3);
    const cookie = rows.find((r) => r.key === "cookieSecret");
    expect(cookie?.value).toBe("super-secret-value");
    const maxUpload = rows.find((r) => r.key === "maxUploadSize");
    expect(maxUpload?.value).toBe("50");
  });

  // Note: sessions are intentionally NOT migrated (see the real-1.17.2 suite below).
});

/** One 1.x users row, named rather than positional so the twins' difference is visible. */
interface TwinUserRow {
  id: string;
  username: string;
  provider: string;
  externalId: string | null;
  createdAt: number;
}

const NON_USER_TABLES = [
  "teams",
  "settings",
  "roles",
  "api_keys",
  "pipelines",
  "jobs",
  "audit_log",
  "user_files",
];

/**
 * Build a 1.x source carrying `users` rows and nothing else, on the real 1.17.2
 * schema replayed from the archived legacy migrations. Those migrations seed a
 * Default team and the builtin roles, whose own unique names would collide under
 * --force, so everything outside users is cleared.
 */
function buildTwinSource(path: string, users: TwinUserRow[]): void {
  buildLegacySqlite(path);
  const s = new Database(path);
  try {
    const ins = s.prepare(
      `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
        auth_provider, external_id, email, created_at, updated_at)
       VALUES (?,?,NULL,'user','Default',0,?,?,NULL,?,?)`,
    );
    for (const u of users) {
      ins.run(u.id, u.username, u.provider, u.externalId, u.createdAt, u.createdAt);
    }
    for (const table of NON_USER_TABLES) s.prepare(`DELETE FROM ${table}`).run();
  } finally {
    s.close();
  }
}

interface CapturedImport {
  result: MigrationResult | null;
  warnings: string[];
  error: Error | null;
}

/**
 * Import with console.warn captured, keeping the warnings even when the import
 * throws, so the "a rolled-back import reports nothing" contract is assertable.
 */
async function importCapturingWarnings(
  path: string,
  opts: { force: boolean },
): Promise<CapturedImport> {
  const warnings: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  let result: MigrationResult | null = null;
  let error: Error | null = null;
  try {
    result = await migrateFromSqlite(path, opts);
  } catch (e) {
    error = e as Error;
  } finally {
    spy.mockRestore();
  }
  return { result, warnings, error };
}

/**
 * 1.x had the same auto-create race migration 0008 cleans up (issue #969), so a
 * source database can hold two rows for one external identity. The partial
 * unique index exists by the time the copy runs, so the importer has to settle
 * the twins itself rather than let the second INSERT roll the import back
 * (issue #1005).
 */
describe("migrate-from-sqlite (twin SSO identities)", () => {
  const twinDir = mkdtempSync(join(tmpdir(), "snapotter-migrator-twin-"));
  const twinPath = join(twinDir, "snapotter-1x-twins.db");
  let imported: CapturedImport;

  beforeAll(async () => {
    buildTwinSource(twinPath, [
      // The twins: one (oidc, ext-twin) identity, rows a minute apart. Ids run
      // counter to age, so a sort that reaches for id first picks wrong.
      {
        id: "u-twin-b",
        username: "sso-user",
        provider: "oidc",
        externalId: "ext-twin",
        createdAt: 1748000000,
      }, // prettier-ignore
      {
        id: "u-twin-a",
        username: "sso-user-2",
        provider: "oidc",
        externalId: "ext-twin",
        createdAt: 1748000060,
      }, // prettier-ignore
      // A third row for the same identity: the race can fire more than twice.
      {
        id: "u-twin-c",
        username: "sso-user-3",
        provider: "oidc",
        externalId: "ext-twin",
        createdAt: 1748000120,
      }, // prettier-ignore
      // Neither a local account nor a different identity may be touched.
      {
        id: "u-local",
        username: "admin",
        provider: "local",
        externalId: null,
        createdAt: 1747000000,
      }, // prettier-ignore
      {
        id: "u-other",
        username: "other-sso",
        provider: "oidc",
        externalId: "ext-other",
        createdAt: 1748000000,
      }, // prettier-ignore
    ]);
    await truncateMigratedTables();
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("imports a source holding twin identities instead of rolling back", async () => {
    imported = await importCapturingWarnings(twinPath, { force: false });
    expect(imported.error).toBeNull();
    expect(imported.result?.tables.users).toBe(5);
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
    expect(rows[0].n).toBe(5);
  });

  it("leaves the oldest twin holding the identity", async () => {
    const rows = (await db.execute(sql`SELECT * FROM users ORDER BY id`)).rows;
    expect(rows.find((u) => u.id === "u-twin-b")?.external_id).toBe("ext-twin");
    // Both younger twins arrive, keep their provider, and stop answering to the
    // identity: the shape migration 0008 leaves behind.
    for (const id of ["u-twin-a", "u-twin-c"]) {
      const row = rows.find((u) => u.id === id);
      expect(row?.external_id).toBeNull();
      expect(row?.auth_provider).toBe("oidc");
    }
    expect(rows.find((u) => u.id === "u-twin-a")?.username).toBe("sso-user-2");
  });

  it("leaves local accounts and unrelated identities alone", async () => {
    const rows = (await db.execute(sql`SELECT * FROM users ORDER BY id`)).rows;
    expect(rows.find((u) => u.id === "u-local")?.external_id).toBeNull();
    expect(rows.find((u) => u.id === "u-other")?.external_id).toBe("ext-other");
  });

  it("names both the detached row and the row that kept the identity", () => {
    const line = imported.warnings.find((w) => w.includes("u-twin-a"));
    expect(line).toBeDefined();
    expect(line).toContain("sso-user-2");
    expect(line).toContain("oidc");
    expect(line).toContain("ext-twin");
    // Remediation is hand-written SQL against external_id, so the line has to
    // name the winner too, not just the row that lost.
    expect(line).toContain("u-twin-b");
    // One line per detached row, and nothing for the rows left alone.
    expect(imported.warnings).toHaveLength(2);
  });
});

describe("migrate-from-sqlite (an identity the target already holds)", () => {
  const forceDir = mkdtempSync(join(tmpdir(), "snapotter-migrator-force-"));
  const seedPath = join(forceDir, "seed-1x.db");
  const incomingPath = join(forceDir, "incoming-1x.db");
  const collidingPath = join(forceDir, "colliding-1x.db");

  beforeAll(async () => {
    buildTwinSource(seedPath, [
      {
        id: "u-held",
        username: "sso-user",
        provider: "oidc",
        externalId: "ext-held",
        createdAt: 1748000000,
      }, // prettier-ignore
    ]);
    // Older than the row already in the target, so 0008's oldest-wins rule would
    // hand it the identity and the target-wins override has to do real work.
    buildTwinSource(incomingPath, [
      {
        id: "u-incoming",
        username: "late-sso",
        provider: "oidc",
        externalId: "ext-held",
        createdAt: 1700000000,
      }, // prettier-ignore
      // The same external id under another provider is a different identity.
      {
        id: "u-saml",
        username: "saml-user",
        provider: "saml",
        externalId: "ext-held",
        createdAt: 1700000000,
      }, // prettier-ignore
    ]);
    // Carries the held identity AND a username the target already has, so the
    // import detaches first and then dies on users_username_unique.
    buildTwinSource(collidingPath, [
      {
        id: "u-clash",
        username: "sso-user",
        provider: "oidc",
        externalId: "ext-held",
        createdAt: 1700000000,
      }, // prettier-ignore
    ]);
    await truncateMigratedTables();
    await migrateFromSqlite(seedPath, { force: false });
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("refuses a non-empty target without force, naming the identity index", async () => {
    await expect(migrateFromSqlite(incomingPath, { force: false })).rejects.toThrow(
      /auth_provider, external_id/,
    );
  });

  it("keeps the identity with the account already in the target", async () => {
    const run = await importCapturingWarnings(incomingPath, { force: true });
    expect(run.error).toBeNull();
    expect(run.result?.tables.users).toBe(2);
    const rows = (await db.execute(sql`SELECT * FROM users ORDER BY id`)).rows;
    expect(rows).toHaveLength(3);
    expect(rows.find((u) => u.id === "u-held")?.external_id).toBe("ext-held");
    expect(rows.find((u) => u.id === "u-incoming")?.external_id).toBeNull();
    expect(rows.find((u) => u.id === "u-incoming")?.username).toBe("late-sso");
    // The saml row shares only the external id, so it keeps its own link.
    expect(rows.find((u) => u.id === "u-saml")?.external_id).toBe("ext-held");
    expect(run.warnings.find((w) => w.includes("u-incoming"))).toContain("ext-held");
    expect(run.warnings).toHaveLength(1);
  });

  it("reports nothing when the import rolls back", async () => {
    // A username collision still aborts the whole import: settling identities
    // must not widen what --force absorbs.
    const run = await importCapturingWarnings(collidingPath, { force: true });
    expect(run.error).toBeInstanceOf(Error);
    expect(run.result).toBeNull();
    // Nothing landed, so nothing may be reported.
    expect(run.warnings).toEqual([]);
    const rows = (await db.execute(sql`SELECT * FROM users ORDER BY id`)).rows;
    expect(rows.find((u) => u.id === "u-clash")).toBeUndefined();
    expect(rows.find((u) => u.id === "u-held")?.external_id).toBe("ext-held");
  });
});

describe("migrate-from-sqlite (real 1.17.2 schema)", () => {
  const realDir = mkdtempSync(join(tmpdir(), "snapotter-migrator-real-"));
  const realPath = join(realDir, "real-1x.db");
  let seeded: { password: string; adminId: string };

  beforeAll(async () => {
    buildLegacySqlite(realPath);
    seeded = await seedRealistic1xData(realPath);
    await truncateMigratedTables();
  });
  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("excludes sessions from the migrated set", () => {
    expect(MIGRATED_TABLES).not.toContain("sessions");
  });

  it("imports a real 1.17.2 database (analytics columns do not break it)", async () => {
    const result = await migrateFromSqlite(realPath, { force: false });
    expect(result.tables.users).toBe(1);
    expect(result.tables).not.toHaveProperty("sessions");
    const [u] = (await db.execute(sql`SELECT * FROM users WHERE id = 'u-admin'`)).rows;
    expect(u.username).toBe("admin");
    expect(u).not.toHaveProperty("analytics_enabled");
  });

  it("maps the out-of-enum job status 'error' to 'failed'", async () => {
    const [j] = (await db.execute(sql`SELECT status FROM jobs WHERE id = 'j-err'`)).rows;
    expect(j.status).toBe("failed");
  });

  it("does not copy the sessions table", async () => {
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM sessions`);
    expect(rows[0].n).toBe(0);
  });

  it("migrated user can still log in and the library row is intact", async () => {
    const { verifyPassword } = await import("../../../apps/api/src/plugins/auth.js");
    const [u] = (
      await db.execute(sql`SELECT password_hash FROM users WHERE id = ${seeded.adminId}`)
    ).rows;
    expect(await verifyPassword(seeded.password, u.password_hash as string)).toBe(true);
    const [f] = (await db.execute(sql`SELECT stored_name FROM user_files WHERE id = 'uf-1'`)).rows;
    expect(f.stored_name).toBe("abc123.png");
  });
});

/**
 * Run DDL as the owning role. The runtime role the importer serves as may only
 * do DML, so a fixture that needs a trigger installed reaches for owner rights
 * the same way truncateMigratedTables does, rather than widening a grant.
 */
async function withPrivileged<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.TEST_PRIVILEGED_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe("migrate-from-sqlite (a dropped row under force)", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapotter-migrator-drop-"));
  const seedPath = join(dir, "seed-1x.db");
  const incomingPath = join(dir, "incoming-1x.db");

  beforeAll(async () => {
    // One local account already in the target, so the second import runs against
    // a populated table under --force.
    buildTwinSource(seedPath, [
      {
        id: "drop-seed",
        username: "drop-seed-user",
        provider: "local",
        externalId: null,
        createdAt: 1748000000,
      }, // prettier-ignore
    ]);
    // Two more local accounts. A trigger will drop one before it lands, so the
    // import inserts one row fewer than the source held.
    buildTwinSource(incomingPath, [
      {
        id: "drop-keep",
        username: "drop-keep-user",
        provider: "local",
        externalId: null,
        createdAt: 1748000060,
      }, // prettier-ignore
      {
        id: "drop-gone",
        username: "drop-gone-user",
        provider: "local",
        externalId: null,
        createdAt: 1748000120,
      }, // prettier-ignore
    ]);
    await truncateMigratedTables();
    await migrateFromSqlite(seedPath, { force: false });
  });

  afterAll(async () => {
    await truncateMigratedTables();
  });

  it("throws when a row goes missing on a populated target under force", async () => {
    // There is no path today that drops a row silently (issue #1217): every
    // INSERT is unconditional. A BEFORE INSERT trigger that returns NULL for one
    // incoming row stands in for a future change that could, so the guard is
    // tested against the case it exists to catch.
    await withPrivileged(async (client) => {
      await client.query(`
        CREATE OR REPLACE FUNCTION test_drop_gone_1217() RETURNS trigger AS $$
        BEGIN
          IF NEW.id = 'drop-gone' THEN RETURN NULL; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_drop_gone_1217 BEFORE INSERT ON users
          FOR EACH ROW EXECUTE FUNCTION test_drop_gone_1217();
      `);
    });
    try {
      // The target already holds drop-seed, so a whole-table count(*) after the
      // insert loop is 2 (seed + drop-keep) and stays >= the source's rows.length
      // of 2: the old guard never fires. Comparing the delta (1 inserted vs 2
      // expected) does.
      await expect(migrateFromSqlite(incomingPath, { force: true })).rejects.toThrow(
        /Row count mismatch for users: sqlite=2 inserted=1/,
      );
    } finally {
      await withPrivileged(async (client) => {
        await client.query("DROP TRIGGER IF EXISTS test_drop_gone_1217 ON users");
        await client.query("DROP FUNCTION IF EXISTS test_drop_gone_1217()");
      });
    }
    // The guard threw inside the transaction, so nothing from the second import
    // landed: only the seed row remains.
    const rows = (await db.execute(sql`SELECT id FROM users ORDER BY id`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("drop-seed");
  });
});
