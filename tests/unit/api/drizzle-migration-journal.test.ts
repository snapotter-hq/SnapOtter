import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Two PRs written in parallel can each generate the "next" migration. Git only
// catches that when both touch the same journal lines, and a hand-resolved
// conflict can still leave a journal drizzle will misapply. These checks pin
// the invariants the migrator relies on.

const drizzleDir = path.resolve(import.meta.dirname, "../../../apps/api/drizzle");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const entries: JournalEntry[] = JSON.parse(
  readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
).entries;
const sqlTags = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, ""))
  .sort();

describe("drizzle migration journal", () => {
  it("numbers entries 0..n-1 in order", () => {
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i));
  });

  it("gives every migration a unique number prefix that matches its idx", () => {
    for (const e of entries) {
      expect(e.tag, `${e.tag} at idx ${e.idx}`).toMatch(
        new RegExp(`^${String(e.idx).padStart(4, "0")}_`),
      );
    }
    const prefixes = sqlTags.map((t) => t.slice(0, 4));
    expect(new Set(prefixes).size, `duplicate migration numbers in ${sqlTags.join(", ")}`).toBe(
      prefixes.length,
    );
  });

  it("lists exactly the .sql files on disk", () => {
    expect(entries.map((e) => e.tag).sort()).toEqual(sqlTags);
  });

  // The pg migrator applies a migration only when its `when` is newer than the
  // newest one already recorded in the database (drizzle-orm pg-core dialect),
  // so an older timestamp merged after a newer one is silently skipped on every
  // install that already ran the newer migration.
  it("has strictly increasing timestamps", () => {
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i].when,
        `${entries[i].tag} is not newer than ${entries[i - 1].tag}; regenerate it after rebasing`,
      ).toBeGreaterThan(entries[i - 1].when);
    }
  });
});
