import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import {
  columnsEngineCanFill,
  MIGRATED_TABLES,
} from "../../../apps/api/src/db/migrate-from-sqlite.js";
import { buildLegacySqlite } from "../../helpers/legacy-sqlite-fixture.js";

describe("migrator schema drift guard", () => {
  let sourceColumns: Record<string, string[]>;

  beforeAll(async () => {
    await runMigrations(); // bring the test DB to the current schema
    const dir = mkdtempSync(join(tmpdir(), "drift-"));
    const path = join(dir, "legacy.db");
    buildLegacySqlite(path);
    const s = new Database(path, { readonly: true });
    sourceColumns = {};
    for (const table of MIGRATED_TABLES) {
      const info = s.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      sourceColumns[table] = info.map((c) => c.name);
    }
    s.close();
  });

  it("every required target column is fillable from a real 1.17.2 source", async () => {
    const unfillable: string[] = [];
    for (const table of MIGRATED_TABLES) {
      const required = await db.execute(
        sql`SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table}
              AND is_nullable = 'NO' AND column_default IS NULL`,
      );
      const canFill = columnsEngineCanFill(table, sourceColumns[table] ?? []);
      for (const row of required.rows) {
        const col = row.column_name as string;
        if (!canFill.has(col)) unfillable.push(`${table}.${col}`);
      }
    }
    // If this fails, a schema change added a required column the 1.x importer
    // cannot populate. Give it a default, make it nullable, or add a computed
    // default / rename mapping in migrate-from-sqlite.ts.
    expect(unfillable).toEqual([]);
  });

  it("the guard flags a column the engine cannot fill (self-check)", () => {
    const canFill = columnsEngineCanFill("users", ["id", "username"]);
    expect(canFill.has("username")).toBe(true);
    // A hypothetical future required column absent from the 1.17.2 source is not
    // fillable, so the drift check above would report it and fail CI.
    expect(canFill.has("some_future_required_col")).toBe(false);
  });
});
