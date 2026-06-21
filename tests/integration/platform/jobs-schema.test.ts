import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../../apps/api/src/db/index.js";

describe("jobs table (phase 2 spine)", () => {
  it("has the spine columns and canceled status", async () => {
    const cols = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    for (const expected of [
      "user_id",
      "tool_id",
      "pool",
      "attempts",
      "input_refs",
      "output_refs",
      "bytes_in",
      "bytes_out",
      "duration_ms",
      "started_at",
      "progress",
      "error",
    ]) {
      expect(names).toContain(expected);
    }
    const enumRows = await db.execute(sql`SELECT unnest(enum_range(NULL::job_status))::text AS v`);
    expect(enumRows.rows.map((r) => r.v)).toContain("canceled");
    await db.execute(
      sql`INSERT INTO jobs (id, type, status, progress, input_refs, created_at) VALUES ('schema-test', 'single', 'canceled', '{"percent":50}', '["uploads/x"]', now())`,
    );
    await db.execute(sql`DELETE FROM jobs WHERE id = 'schema-test'`);
  });
});
