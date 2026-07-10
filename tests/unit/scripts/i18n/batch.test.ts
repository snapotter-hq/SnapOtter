// tests/unit/scripts/i18n/batch.test.ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  batchResultTranslator,
  readDone,
  writePending,
} from "../../../../scripts/i18n/lib/batch.mjs";

describe("batch handoff", () => {
  it("writes pending units as masked {id, masked} pairs", () => {
    const dir = mkdtempSync(join(tmpdir(), "i18n-batch-"));
    const path = writePending(dir, "docs", "de", [
      { unit: { id: "a", sourceText: "Run `x` for {n}" }, srcHash: "h" },
    ]);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed[0].id).toBe("a");
    expect(parsed[0].masked).not.toContain("`x`"); // masked
    expect(parsed[0].masked).not.toContain("{n}");
  });

  it("batchResultTranslator restores tokens from the done map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "i18n-batch-"));
    // Simulate a subagent producing a done file that keeps the mask tokens.
    // Build the expected masked form by masking the same source the translator will mask.
    const units = [{ id: "a", sourceText: "Run `x` for {n}" }];
    // The subagent returns the translated masked text; here we fake "DE " prefix.
    writePending(
      dir,
      "docs",
      "de",
      units.map((u) => ({ unit: u, srcHash: "h" })),
    );
    const pending = JSON.parse(readFileSync(join(dir, "docs.de.pending.json"), "utf8"));
    const done = { a: `DE ${pending[0].masked}` };
    writeFileSync(join(dir, "docs.de.done.json"), JSON.stringify(done));

    const doneMap = readDone(dir, "docs", "de");
    const translate = batchResultTranslator(doneMap);
    const out = await translate(units, "de");
    expect(out.get("a")).toContain("`x`"); // restored
    expect(out.get("a")).toContain("{n}");
    expect(out.get("a")).toContain("DE ");
  });

  it("batchResultTranslator returns null for a missing id", async () => {
    const translate = batchResultTranslator(new Map());
    const out = await translate([{ id: "z", sourceText: "hi" }], "de");
    expect(out.get("z")).toBeNull();
  });
});
