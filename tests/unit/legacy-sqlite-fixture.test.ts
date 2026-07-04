import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildLegacySqlite, seedRealistic1xData } from "../helpers/legacy-sqlite-fixture.js";

describe("legacy sqlite fixture builder", () => {
  it("reconstructs the 1.17.2 schema including dropped-in-2.x columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "legacy-fixture-"));
    const path = join(dir, "legacy.db");
    buildLegacySqlite(path);
    const s = new Database(path, { readonly: true });
    const cols = (s.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    s.close();
    // These three exist in 1.17.2 (legacy migration 0009) but NOT in the 2.x schema.
    expect(cols).toContain("analytics_enabled");
    expect(cols).toContain("analytics_consent_shown_at");
    expect(cols).toContain("analytics_consent_remind_at");
  });

  it("seeds realistic rows including an out-of-enum job status", async () => {
    const dir = mkdtempSync(join(tmpdir(), "legacy-fixture-"));
    const path = join(dir, "legacy.db");
    buildLegacySqlite(path);
    await seedRealistic1xData(path);
    const s = new Database(path, { readonly: true });
    const statuses = (s.prepare("SELECT status FROM jobs").all() as Array<{ status: string }>).map(
      (r) => r.status,
    );
    s.close();
    expect(statuses).toContain("error"); // not a 2.x enum member — must be mapped on import
  });
});
