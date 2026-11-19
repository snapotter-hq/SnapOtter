/**
 * #4846: csv-excel's xlsx -> csv direction loaded the whole workbook with ExcelJS's
 * in-memory Workbook, about 3 KB of heap per row, so a large XLSX could take the API
 * process down. xlsxToCsv streams the sheet XML instead. The in-memory conversion the
 * route used to run is kept here as the oracle the streamed output has to match.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import type ExcelJSType from "exceljs";
import { describe, expect, it } from "vitest";
import { xlsxToCsv } from "../../../apps/api/src/lib/xlsx-to-csv.js";

const API_DIR = resolve(__dirname, "../../../apps/api");
const HELPER = resolve(API_DIR, "src/lib/xlsx-to-csv.ts");
const WRITER = resolve(API_DIR, "src/lib/csv-to-xlsx.ts");
// exceljs and papaparse are apps/api dependencies, not root ones.
const requireFromApi = createRequire(resolve(API_DIR, "package.json"));
const ExcelJS = requireFromApi("exceljs") as typeof ExcelJSType;
const Papa = requireFromApi("papaparse") as { unparse(rows: string[][]): string };

/** The conversion csv-excel ran before #4846. */
async function inMemoryCsv(buffer: Buffer, sheet: number): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const rows: string[][] = [];
  workbook.worksheets[sheet - 1].eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cell.value instanceof Date ? cell.value.toISOString() : cell.text);
    });
    rows.push(cells);
  });
  return Papa.unparse(rows);
}

async function write(workbook: ExcelJSType.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function csvOf(buffer: Buffer, sheet = 1): Promise<string> {
  return (await xlsxToCsv(buffer, sheet)).toString("utf8");
}

describe("xlsxToCsv", () => {
  it("matches the in-memory conversion for plain, rich, linked, sparse and merged cells", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Data");
    ws.addRow(["text", 1.5, true, new Date(Date.UTC(2024, 0, 2, 3, 4, 5))]);
    ws.getCell("A2").value = {
      richText: [{ text: "rich " }, { font: { bold: true }, text: "bold" }],
    };
    ws.getCell("B2").value = { formula: "1+1", result: 2 };
    ws.getCell("C2").value = { formula: '"x"&"y"', result: "xy" };
    ws.getCell("A3").value = { text: "link", hyperlink: "https://example.com" };
    ws.getCell("B3").value = { error: "#N/A" };
    ws.getCell("A5").value = "after an empty row";
    ws.getCell("D5").value = "sparse";
    ws.getCell("A6").value = "merged";
    ws.mergeCells("A6:B7");
    ws.getCell("C8").value = 'quote "x", comma\nnewline';
    ws.getCell("A9").value = "styled empty cells after";
    ws.getCell("E9").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
    ws.getCell("A10").value = 0.42;
    ws.getCell("A10").numFmt = "0.00%";
    ws.getCell("A11").value = "Ünïcödé 日本語";
    const buffer = await write(workbook);

    const streamed = await csvOf(buffer);
    expect(streamed).toBe(await inMemoryCsv(buffer, 1));
    expect(streamed).toContain("merged,merged\r\nmerged,merged");
  });

  it("matches the in-memory conversion when a merged range covers rows missing from the XML", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Data");
    ws.getCell("A1").value = "head";
    ws.getCell("B3").value = "tall";
    ws.mergeCells("B3:C5");
    ws.getCell("A8").value = "tail";
    const buffer = await write(workbook);

    expect(await csvOf(buffer)).toBe(await inMemoryCsv(buffer, 1));
  });

  it("renders a formula's cached date, boolean and error the way Excel shows them", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Data");
    ws.getCell("A1").value = { formula: "DATE(2024,1,1)", result: new Date(Date.UTC(2024, 0, 1)) };
    ws.getCell("A1").numFmt = "yyyy-mm-dd";
    ws.getCell("B1").value = { formula: "TRUE()", result: true };
    ws.getCell("C1").value = { formula: "1/0", result: { error: "#DIV/0!" } };
    ws.getCell("D1").value = { formula: "NOW()" };

    // The in-memory route gave a timezone-dependent Date.toString() and
    // "[object Object]" for the first and third.
    expect(await csvOf(await write(workbook))).toBe("2024-01-01T00:00:00.000Z,true,#DIV/0!,");
  });

  it("picks the sheet by its position in the workbook, not its file name", async () => {
    const workbook = new ExcelJS.Workbook();
    // orderNo (a sheet's place in workbook.xml) is real but missing from ExcelJS's types.
    type Ordered = ExcelJSType.Worksheet & { orderNo: number };
    const storedFirst = workbook.addWorksheet("Stored first") as Ordered;
    const storedSecond = workbook.addWorksheet("Stored second") as Ordered;
    storedFirst.addRow(["file sheet1"]);
    storedSecond.addRow(["file sheet2"]);
    storedFirst.orderNo = 2;
    storedSecond.orderNo = 1;
    const buffer = await write(workbook);

    expect(await csvOf(buffer, 1)).toBe("file sheet2");
    expect(await csvOf(buffer, 2)).toBe("file sheet1");
  });

  it("reads files whose workbook.xml comes after the sheets, every time", async () => {
    // ExcelJS writes workbook.xml last; its own streaming reader loses the workbook
    // model on most reads of such a file.
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("One").addRow(["a", 1]);
    workbook.addWorksheet("Two").addRow(["b", 2]);
    const buffer = await write(workbook);
    for (let i = 0; i < 20; i++) {
      expect(await csvOf(buffer, 2)).toBe("b,2");
    }
  });

  it("names the sheet count when the requested sheet doesn't exist", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("One").addRow(["a"]);
    workbook.addWorksheet("Two").addRow(["b"]);
    await expect(xlsxToCsv(await write(workbook), 3)).rejects.toThrow(
      "Worksheet 3 not found (workbook has 2 sheets)",
    );
  });

  it("refuses input that isn't an XLSX zip", async () => {
    await expect(xlsxToCsv(Buffer.from("id,name\n1,Ada\n"), 1)).rejects.toThrow(
      /Not a readable XLSX file/,
    );
  });

  describe("XML ExcelJS never writes", () => {
    /**
     * An ExcelJS file whose sheet1.xml <sheetData> is swapped for hand-written XML.
     * Its A1 carries a date format, so `s="<dateStyle>"` marks a date cell.
     */
    async function patchedWorkbook(
      sheetData: (dateStyle: string) => string,
      { date1904 = false, mergeCells = "" } = {},
    ): Promise<Buffer> {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Data");
      ws.getCell("A1").value = new Date(Date.UTC(2024, 0, 1));
      ws.getCell("A1").numFmt = "yyyy-mm-dd";
      const zip = new AdmZip(await write(workbook));
      const sheetXml = zip.getEntry("xl/worksheets/sheet1.xml")?.getData().toString("utf8") ?? "";
      const dateStyle = /<c r="A1" s="(\d+)"/.exec(sheetXml)?.[1] ?? "";
      expect(dateStyle).not.toBe("");
      const patched = sheetXml
        .replace(
          /<sheetData>[\s\S]*<\/sheetData>/,
          `<sheetData>${sheetData(dateStyle)}</sheetData>`,
        )
        .replace(/<mergeCells[\s\S]*<\/mergeCells>/, "")
        .replace("</sheetData>", `</sheetData>${mergeCells}`);
      zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(patched));
      if (date1904) {
        const workbookXml = zip.getEntry("xl/workbook.xml")?.getData().toString("utf8") ?? "";
        zip.updateFile(
          "xl/workbook.xml",
          Buffer.from(workbookXml.replace("<workbookPr", '<workbookPr date1904="1"')),
        );
      }
      return zip.toBuffer();
    }

    it("reads inline strings, skipping phonetic runs, and t=d dates", async () => {
      const buffer = await patchedWorkbook(
        () =>
          '<row r="1"><c r="A1" t="inlineStr"><is><r><t>rich </t></r><r><t>inline</t></r></is></c>' +
          '<c r="B1" t="inlineStr"><is><t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh></is></c>' +
          '<c r="C1" t="d"><v>2024-03-04T05:06:07Z</v></c></row>',
      );
      expect(await csvOf(buffer)).toBe("rich inline,漢字,2024-03-04T05:06:07.000Z");
    });

    it("places rows and cells that have no r attribute after the previous one", async () => {
      const buffer = await patchedWorkbook(
        () =>
          '<row r="2"><c r="B2" t="inlineStr"><is><t>b2</t></is></c><c t="inlineStr"><is><t>c2</t></is></c></row>' +
          '<row><c t="inlineStr"><is><t>a3</t></is></c></row>',
      );
      expect(await csvOf(buffer)).toBe(",b2,c2\r\na3");
    });

    it("reads date serials against the 1904 epoch when the workbook says so", async () => {
      const sheet = (dateStyle: string) =>
        `<row r="1"><c r="A1" s="${dateStyle}"><v>0</v></c></row>`;
      expect(await csvOf(await patchedWorkbook(sheet))).toBe("1899-12-30T00:00:00.000Z");
      expect(await csvOf(await patchedWorkbook(sheet, { date1904: true }))).toBe(
        "1904-01-01T00:00:00.000Z",
      );
    });

    it("refuses a cell reference past Excel's column limit", async () => {
      const buffer = await patchedWorkbook(() => '<row r="1"><c r="ZZZZZZ1"><v>1</v></c></row>');
      await expect(xlsxToCsv(buffer, 1)).rejects.toThrow(/past Excel's limits/);
    });

    it("refuses merged ranges that would repeat into a million cells", async () => {
      const buffer = await patchedWorkbook(() => '<row r="1"><c r="A1"><v>1</v></c></row>', {
        mergeCells: '<mergeCells count="1"><mergeCell ref="A2:XFD60000"/></mergeCells>',
      });
      await expect(xlsxToCsv(buffer, 1)).rejects.toThrow(/merges more than 1,000,000 cells/);
    });

    it("refuses a sheet whose CSV would pass the output cap (#4857)", async () => {
      // One cell at XFD per row is about 40 bytes of XML and 16 KB of commas.
      const rows = Array.from(
        { length: 200 },
        (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}"><v>1</v></c></row>`,
      ).join("");
      const buffer = await patchedWorkbook(() => rows);
      await expect(xlsxToCsv(buffer, 1, { maxOutputBytes: 1024 * 1024 })).rejects.toThrow(
        /CSV would be larger than 1 MB/,
      );
    });

    it("allows wide rows that stay under the output cap", async () => {
      const buffer = await patchedWorkbook(() => '<row r="1"><c r="XFD1"><v>1</v></c></row>');
      const csv = await xlsxToCsv(buffer, 1, { maxOutputBytes: 1024 * 1024 });
      expect(csv.toString("utf8")).toBe(`${",".repeat(16_383)}1`);
    });

    it("counts the cap in UTF-8 bytes, not characters", async () => {
      const buffer = await patchedWorkbook(
        () => '<row r="1"><c r="A1" t="inlineStr"><is><t>漢字漢字</t></is></c></row>',
      );
      // Four characters, twelve bytes.
      await expect(xlsxToCsv(buffer, 1, { maxOutputBytes: 11 })).rejects.toThrow(/larger than/);
      expect((await xlsxToCsv(buffer, 1, { maxOutputBytes: 12 })).toString("utf8")).toBe(
        "漢字漢字",
      );
    });

    it("reports malformed sheet XML as unreadable input", async () => {
      const buffer = await patchedWorkbook(() => '<row r="1"><c r="A1"><v>1</v></row>');
      await expect(xlsxToCsv(buffer, 1)).rejects.toThrow(/Not a readable XLSX file/);
    });
  });

  it("converts 200k rows inside a 256 MB heap", () => {
    // The in-memory Workbook held about 3 KB per row and died with "Reached heap
    // limit" well before 200k rows; the streaming reader stays far below it.
    const script = `
      import { rowsToXlsx } from ${JSON.stringify(WRITER)};
      import { xlsxToCsv } from ${JSON.stringify(HELPER)};
      let xlsx;
      {
        const rows = [["id", "name", "value", "note"]];
        for (let i = 1; i <= 200000; i++) rows.push([String(i), "name-" + i, String(i * 0.37), "lorem ipsum"]);
        xlsx = await rowsToXlsx(rows);
      }
      const csv = await xlsxToCsv(xlsx, 1);
      const text = csv.toString("utf8");
      process.stdout.write(JSON.stringify({ lines: text.split("\\r\\n").length, last: text.slice(text.lastIndexOf("\\r\\n") + 2) }));
    `;
    const result = spawnSync(
      process.execPath,
      ["--max-old-space-size=256", "--import", "tsx", "--input-type=module", "-e", script],
      { cwd: API_DIR, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.stderr).not.toContain("heap out of memory");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      lines: 200001,
      last: `200000,name-200000,${String(200000 * 0.37)},lorem ipsum`,
    });
  }, 150_000);
});
