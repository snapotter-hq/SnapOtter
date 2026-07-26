/**
 * Builds the 1.x SQLite fixture pair the backup drill needs.
 *
 * SnapOtter 1.x runs SQLite in WAL mode, so at any moment an unknown share of
 * committed data lives in `snapotter.db-wal` rather than `snapotter.db`. An
 * operator who backs up only `snapotter.db` (the obvious thing to do) silently
 * loses it. This produces two directories from one database so the drill can
 * demonstrate that rather than assert it:
 *
 *   full/     snapotter.db + snapotter.db-wal + snapotter.db-shm  (correct backup)
 *   db-only/  snapotter.db                                        (naive backup)
 *
 * The copies are taken while a connection is still open with autocheckpoint
 * disabled, which is exactly the state a live 1.x install is in.
 *
 * The schema is replayed from the archived 1.x Drizzle migrations, so the
 * fixture is what a real 1.17.2 instance has rather than a hand-written guess.
 * better-sqlite3 lives in the API workspace, so it is required through an
 * explicit base rather than the repo root.
 *
 *   node --experimental-strip-types tests/qa/backup-restore-legacy-fixture.mts <output-dir>
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../..");
const LEGACY_MIGRATIONS = join(REPO_ROOT, "apps/api/drizzle-sqlite-legacy");
const require = createRequire(join(REPO_ROOT, "apps/api/package.json"));
// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 is required out of another workspace.
const Database = require("better-sqlite3") as any;

const WAL_ONLY_PIPELINES = 4;
const NOW = 1748000000;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Replay every archived 1.x migration in filename order. */
function buildLegacySchema(path: string): void {
  const files = readdirSync(LEGACY_MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const database = new Database(path);
  try {
    database.pragma("foreign_keys = OFF");
    for (const file of files) {
      const source = readFileSync(join(LEGACY_MIGRATIONS, file), "utf8");
      for (const chunk of source.split("--> statement-breakpoint")) {
        const statement = chunk
          .replace(/^\s*--.*$/gm, "")
          .trim()
          .replace(/;\s*$/, "");
        if (statement) database.prepare(statement).run();
      }
    }
  } finally {
    database.close();
  }
}

function seedCheckpointedRows(path: string): number {
  const database = new Database(path);
  try {
    database
      .prepare(
        `INSERT INTO users (id, username, password_hash, role, team, must_change_password,
          auth_provider, email, created_at, updated_at, analytics_enabled)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        "u-admin",
        "admin",
        "scrypt$notavalidhash",
        "admin",
        "Default",
        0,
        "local",
        "admin@example.com",
        NOW,
        NOW,
        1,
      );
    database
      .prepare("INSERT INTO pipelines (id, user_id, name, steps, created_at) VALUES (?,?,?,?,?)")
      .run("p-checkpointed", "u-admin", "Shrink", '[{"toolId":"compress"}]', NOW);
    database
      .prepare(
        "INSERT INTO user_files (id, user_id, original_name, stored_name, mime_type, size, version, created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run("uf-1", "u-admin", "photo.png", "abc123.png", "image/png", 1024, 1, NOW);
    return (database.prepare("SELECT count(*) AS n FROM pipelines").get() as { n: number }).n;
  } finally {
    database.close();
  }
}

function countPipelines(path: string): number {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare("SELECT count(*) AS n FROM pipelines").get() as { n: number }).n;
  } finally {
    database.close();
  }
}

function main(): void {
  const outputDir = process.argv[2];
  if (!outputDir) throw new Error("usage: backup-restore-legacy-fixture.mts <output-dir>");

  const stagingDir = join(outputDir, "staging");
  const fullDir = join(outputDir, "full");
  const dbOnlyDir = join(outputDir, "db-only");
  for (const dir of [stagingDir, fullDir, dbOnlyDir]) mkdirSync(dir, { recursive: true });

  const source = join(stagingDir, "snapotter.db");
  buildLegacySchema(source);
  const checkpointed = seedCheckpointedRows(source);

  // Everything from here lands in the WAL and stays there.
  const live = new Database(source);
  live.pragma("journal_mode = WAL");
  live.pragma("wal_autocheckpoint = 0");
  for (let index = 0; index < WAL_ONLY_PIPELINES; index += 1) {
    live
      .prepare("INSERT INTO pipelines (id, user_id, name, steps, created_at) VALUES (?,?,?,?,?)")
      .run(
        `p-wal-${index}`,
        "u-admin",
        `WAL only ${index}`,
        '[{"toolId":"resize","settings":{"width":800}}]',
        NOW + 1 + index,
      );
  }

  // Copy while the connection is open: SQLite checkpoints on last-connection
  // close, which would destroy the very state under test.
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${source}${suffix}`;
    if (existsSync(from)) copyFileSync(from, join(fullDir, `snapotter.db${suffix}`));
  }
  copyFileSync(source, join(dbOnlyDir, "snapotter.db"));
  live.close();

  const fullCount = countPipelines(join(fullDir, "snapotter.db"));
  const dbOnlyCount = countPipelines(join(dbOnlyDir, "snapotter.db"));
  if (fullCount !== checkpointed + WAL_ONLY_PIPELINES) {
    throw new Error(
      `full copy sees ${fullCount} pipelines, expected ${checkpointed + WAL_ONLY_PIPELINES}`,
    );
  }
  if (dbOnlyCount !== checkpointed) {
    throw new Error(
      `db-only copy sees ${dbOnlyCount} pipelines; the WAL rows were not withheld, so the fixture proves nothing`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        pipelines: {
          checkpointed,
          walOnly: WAL_ONLY_PIPELINES,
          full: fullCount,
          dbOnly: dbOnlyCount,
        },
        full: {
          db: {
            bytes: statSync(join(fullDir, "snapotter.db")).size,
            sha256: sha256(join(fullDir, "snapotter.db")),
          },
          wal: {
            bytes: statSync(join(fullDir, "snapotter.db-wal")).size,
            sha256: sha256(join(fullDir, "snapotter.db-wal")),
          },
        },
        dbOnly: {
          db: {
            bytes: statSync(join(dbOnlyDir, "snapotter.db")).size,
            sha256: sha256(join(dbOnlyDir, "snapotter.db")),
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

main();
