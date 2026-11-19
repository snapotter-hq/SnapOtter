/**
 * #4376: csv-excel built the whole workbook in memory (an ExcelJS model object per
 * cell), so a 25 MB CSV ran the API process out of V8 heap and restarted it.
 * rowsToXlsx streams the sheet instead, with no shared strings table.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type ExcelJSType from "exceljs";
import { describe, expect, it } from "vitest";
import { rowsToXlsx } from "../../../apps/api/src/lib/csv-to-xlsx.js";

const API_DIR = resolve(__dirname, "../../../apps/api");
const HELPER = resolve(API_DIR, "src/lib/csv-to-xlsx.ts");
// exceljs is an apps/api dependency, not a root one.
const ExcelJS = createRequire(resolve(API_DIR, "package.json"))("exceljs") as typeof ExcelJSType;

async function readSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets;
}

describe("rowsToXlsx", () => {
  it("writes every row to one sheet named Sheet1, keeping cells as text", async () => {
    const rows = [
      ["id", "name", "zip"],
      ["1", "Ada", "007"],
      ["2", "Grace, Hopper", "0100"],
    ];
    const buffer = await rowsToXlsx(rows);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const sheets = await readSheet(buffer);
    expect(sheets.map((ws) => ws.name)).toEqual(["Sheet1"]);
    const read: unknown[][] = [];
    sheets[0].eachRow((row) => {
      read.push((row.values as unknown[]).slice(1));
    });
    expect(read).toEqual(rows);
  });

  it("writes an empty sheet for no rows", async () => {
    const sheets = await readSheet(await rowsToXlsx([]));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rowCount).toBe(0);
  });

  it("converts 200k rows inside a 256 MB heap", () => {
    // The in-memory Workbook needed several hundred MB of heap for this many rows
    // and died with "Reached heap limit"; the streaming writer stays far below it.
    const script = `
      import { rowsToXlsx } from ${JSON.stringify(HELPER)};
      const rows = [["id", "name", "value", "note"]];
      for (let i = 1; i <= 200000; i++) rows.push([String(i), "name-" + i, String(i * 0.37), "lorem ipsum"]);
      const buffer = await rowsToXlsx(rows);
      process.stdout.write(String(buffer.length));
    `;
    const result = spawnSync(
      process.execPath,
      ["--max-old-space-size=256", "--import", "tsx", "--input-type=module", "-e", script],
      { cwd: API_DIR, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.stderr).not.toContain("heap out of memory");
    expect(result.status).toBe(0);
    expect(Number(result.stdout)).toBeGreaterThan(1_000_000);
  }, 150_000);
});
