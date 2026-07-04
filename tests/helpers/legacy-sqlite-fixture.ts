import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { hashPassword } from "../../apps/api/src/plugins/auth.js";

const LEGACY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api/drizzle-sqlite-legacy",
);

/**
 * Rebuild the final 1.17.2 SQLite schema by replaying every archived legacy
 * migration in filename order. Drizzle separates statements with the marker
 * "--> statement-breakpoint"; each chunk is a single statement, so prepare().run()
 * applies it. Standalone comment lines (some migrations, e.g. 0012, prefix a
 * statement with them) are stripped first. Using the real migrations (not a
 * hand-written schema) guarantees the fixture matches what a real 1.x instance
 * has, including columns 2.x later dropped.
 */
export function buildLegacySqlite(path: string): void {
  const files = readdirSync(LEGACY_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const s = new Database(path);
  try {
    s.pragma("foreign_keys = OFF");
    for (const file of files) {
      const sql = readFileSync(join(LEGACY_DIR, file), "utf8");
      for (const chunk of sql.split("--> statement-breakpoint")) {
        // Drop standalone comment lines, trailing semicolon, and surrounding whitespace.
        const stmt = chunk
          .replace(/^\s*--.*$/gm, "")
          .trim()
          .replace(/;\s*$/, "");
        if (!stmt) continue;
        s.prepare(stmt).run();
      }
    }
  } finally {
    s.close();
  }
}

/**
 * Insert a small but representative 1.17.2 dataset: a user with a REAL scrypt
 * password hash (so login-after-migrate can be verified), populated analytics
 * columns (the drop-me case), a saved file, a pipeline, jobs whose statuses
 * include the out-of-2.x-enum value "error", and an unexpired session (to prove
 * sessions are NOT copied). Returns the plaintext password and admin id to assert on.
 */
export async function seedRealistic1xData(
  path: string,
): Promise<{ password: string; adminId: string }> {
  const password = "correct horse battery staple";
  const passwordHash = await hashPassword(password);
  const now = 1748000000; // epoch seconds, as 1.x stored
  const s = new Database(path);
  try {
    s.prepare(
      `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
        auth_provider, external_id, email, created_at, updated_at,
        analytics_enabled, analytics_consent_shown_at, analytics_consent_remind_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "u-admin",
      "admin",
      passwordHash,
      "admin",
      "Default",
      0,
      "local",
      null,
      "admin@example.com",
      now,
      now,
      1,
      now,
      null,
    );
    // The "Default" team is already seeded by legacy migration 0005; add a
    // distinct custom team so the copy exercises a non-default row too.
    s.prepare("INSERT INTO teams (id, name, created_at) VALUES (?,?,?)").run(
      "tm-eng",
      "Engineering",
      now,
    );
    s.prepare(
      "INSERT INTO pipelines (id, user_id, name, steps, created_at) VALUES (?,?,?,?,?)",
    ).run("p-1", "u-admin", "Shrink", '[{"toolId":"compress","settings":{"quality":70}}]', now);
    // job with an out-of-enum status "error" (must map to "failed")
    s.prepare(
      "INSERT INTO jobs (id, type, status, progress, input_files, created_at) VALUES (?,?,?,?,?,?)",
    ).run("j-err", "single", "error", 0.5, '["a.png"]', now);
    s.prepare(
      "INSERT INTO jobs (id, type, status, progress, input_files, created_at, completed_at) VALUES (?,?,?,?,?,?,?)",
    ).run("j-ok", "single", "completed", 1.0, '["b.png"]', now, now);
    s.prepare(
      "INSERT INTO user_files (id, user_id, original_name, stored_name, mime_type, size, version, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run("uf-1", "u-admin", "photo.png", "abc123.png", "image/png", 1024, 1, now);
    s.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)").run(
      "ses-1",
      "u-admin",
      4102444800,
      now,
    ); // expires year 2100
  } finally {
    s.close();
  }
  return { password, adminId: "u-admin" };
}
