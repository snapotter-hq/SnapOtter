import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";

// Rows written between event-loop yields. Small enough that a large conversion on the
// in-process worker never holds the loop for long (health checks, other requests).
const ROWS_PER_YIELD = 2000;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Write rows as a one-sheet XLSX. Uses ExcelJS's streaming writer because the in-memory
 * `Workbook` keeps a model object for every cell, and a 25 MB CSV ran the API process
 * out of V8 heap (#4376). Strings go straight into the sheet XML: a shared-strings
 * table would hold every distinct cell value in memory until the end.
 */
export async function rowsToXlsx(rows: readonly unknown[][]): Promise<Buffer> {
  // exceljs is CJS, so under ESM the constructor lives on the default export.
  const { default: ExcelJS } = await import("exceljs");

  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (chunk: Buffer) => chunks.push(chunk));

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: sink,
    useSharedStrings: false,
    useStyles: false,
  });
  const ws = workbook.addWorksheet("Sheet1");
  for (let i = 0; i < rows.length; i++) {
    ws.addRow(rows[i]).commit();
    if ((i + 1) % ROWS_PER_YIELD === 0) await yieldToEventLoop();
  }
  ws.commit();
  await workbook.commit();
  await finished(sink);
  return Buffer.concat(chunks);
}
