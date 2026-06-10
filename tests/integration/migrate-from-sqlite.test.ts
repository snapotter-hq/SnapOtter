import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../apps/api/src/db/index.js";
import { migrateFromSqlite } from "../../apps/api/src/db/migrate-from-sqlite.js";

function buildFixtureSqlite(path: string): void {
  const s = new Database(path);
  s.exec(`
    CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL, password_hash text,
      role text NOT NULL DEFAULT 'user', team text NOT NULL DEFAULT 'Default',
      must_change_password integer NOT NULL DEFAULT 1, auth_provider text NOT NULL DEFAULT 'local',
      external_id text, email text, created_at integer NOT NULL, updated_at integer NOT NULL,
      analytics_enabled integer, analytics_consent_shown_at integer, analytics_consent_remind_at integer);
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
    "INSERT INTO users (id, username, password_hash, must_change_password, created_at, updated_at, analytics_enabled, analytics_consent_shown_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run("u1", "alice", "hash", 0, now, now, 1, null);
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
    await db.execute(
      sql`TRUNCATE user_files, audit_log, jobs, pipelines, api_keys, sessions, roles, settings, teams, users CASCADE`,
    );
  });

  afterAll(async () => {
    await db.execute(
      sql`TRUNCATE user_files, audit_log, jobs, pipelines, api_keys, sessions, roles, settings, teams, users CASCADE`,
    );
  });

  it("copies all rows with converted types", async () => {
    const result = await migrateFromSqlite(sqlitePath, { force: false });
    expect(result.tables.users).toBe(1);
    expect(result.tables.pipelines).toBe(1);
    const [user] = (await db.execute(sql`SELECT * FROM users WHERE id = 'u1'`)).rows;
    expect(user.username).toBe("alice");
    expect(user.must_change_password).toBe(false); // 0 became boolean false
    expect(user.analytics_enabled).toBe(true); // 1 became boolean true
    expect(user.analytics_consent_shown_at).toBeNull(); // explicit NULL preserved
    expect(new Date(user.created_at as string).getTime()).toBe(1750000000 * 1000); // seconds became timestamptz
    const [pipeline] = (await db.execute(sql`SELECT * FROM pipelines WHERE id = 'p1'`)).rows;
    expect((pipeline.steps as Array<{ toolId: string }>)[0].toolId).toBe("compress"); // text JSON became jsonb
    const [setting] = (await db.execute(sql`SELECT * FROM settings WHERE key = 'cookieSecret'`))
      .rows;
    expect(setting.value).toBe("not-json-value"); // settings.value stayed text, untouched
    const [job] = (await db.execute(sql`SELECT * FROM jobs WHERE id = 'j1'`)).rows;
    expect(job.completed_at).toBeNull(); // explicit NULL preserved
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
