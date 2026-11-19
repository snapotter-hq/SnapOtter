import { createRequire } from "node:module";
import type { Readable } from "node:stream";
import Papa from "papaparse";
import { type Entry, fromBuffer, type ZipFile } from "yauzl";
import { MAX_BUFFERED_OUTPUT_BYTES } from "../jobs/output-resolve.js";
import { InputValidationError } from "../modality/contract.js";

// Rows read between event-loop yields, matching csv-to-xlsx.ts.
const ROWS_PER_YIELD = 2000;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const WORKSHEET_REL_TYPE = /\/worksheet$/;

// Excel's sheet limits. A reference past them can only come from a crafted file, and
// padding a row out to one would let a few bytes of XML ask for gigabytes of CSV.
const MAX_COLUMNS = 16_384;
const MAX_ROWS = 1_048_576;
// Merged ranges are repeated into every cell they cover, so a single crafted range
// like A2:XFD60000 would do the same. Real sheets merge headers, not a million cells.
const MAX_MERGED_CELLS = 1_000_000;
// Neither bound above caps the total: one cell at XFD on every row is about 40 bytes of
// XML and 16 KB of CSV, so a small upload could still ask for gigabytes (#4857). The
// CSV is held in memory as one buffer, so it gets the same ceiling as any buffered
// tool output.
const DEFAULT_MAX_OUTPUT_BYTES = MAX_BUFFERED_OUTPUT_BYTES;

type SharedString = string | null | { richText: { text: string | null }[] };

interface SaxNode {
  name: string;
  attributes: Record<string, string>;
}

type SaxEvent =
  | { eventType: "opentag"; value: SaxNode }
  | { eventType: "closetag"; value: SaxNode }
  | { eventType: "text"; value: string };

/**
 * The parts of ExcelJS's streaming WorkbookReader this module drives by hand. Its own
 * iterator can't be used: it reads the zip in entry order and races on ExcelJS-written
 * files (whose workbook.xml comes last), losing the workbook model and throwing
 * "Cannot read properties of undefined (reading 'sheets')" on most reads. Reading the
 * entries ourselves, in dependency order, through yauzl's central directory avoids
 * both. These helpers are underscored internals of exceljs 4.4.0; the parity tests in
 * tests/unit/api/xlsx-to-csv.test.ts break if an upgrade changes them.
 */
interface WorkbookParts {
  _parseRels(entry: Readable): Promise<void>;
  _parseWorkbook(entry: Readable): Promise<void>;
  _parseSharedStrings(entry: Readable): AsyncGenerator<unknown>;
  _parseStyles(entry: Readable): Promise<void>;
  workbookRels?: { Id: string; Target: string; Type: string }[];
  model?: { sheets?: { rId: string }[] };
  // The workbookPr xform, not its model: the flag is at properties.model.date1904.
  properties?: { model?: { date1904?: boolean } };
  sharedStrings?: SharedString[];
  styles: { getStyleModel(id: number): { numFmt?: string } | null };
}

type ParseSax = (iterable: AsyncIterable<unknown>) => AsyncGenerator<SaxEvent[]>;

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("Failed to open zip"));
      resolve(zipfile);
    });
  });
}

function listEntries(zipfile: ZipFile): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Entry>();
    zipfile.on("entry", (entry: Entry) => {
      entries.set(entry.fileName, entry);
      zipfile.readEntry();
    });
    zipfile.on("end", () => resolve(entries));
    zipfile.on("error", reject);
    zipfile.readEntry();
  });
}

function openEntry(zipfile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error(`Failed to read ${entry.fileName}`));
      resolve(stream);
    });
  });
}

/** Resolve a workbook relationship target (relative to xl/, or absolute) to a zip path. */
function resolveTarget(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** Same test ExcelJS applies to a number format to decide a numeric cell is a date. */
function isDateFmt(fmt: string | undefined): boolean {
  if (!fmt) return false;
  const stripped = fmt.replace(/\[[^\]]*]/g, "").replace(/"[^"]*"/g, "");
  return /[ymdhMsb]+/.test(stripped);
}

function excelSerialToIso(serial: number, date1904: boolean): string {
  const ms = Math.round((serial - 25569 + (date1904 ? 1462 : 0)) * 24 * 3600 * 1000);
  return new Date(ms).toISOString();
}

function sharedStringText(value: SharedString | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value.richText.map((run) => run.text ?? "").join("");
}

interface CellState {
  col: number;
  type: string | undefined;
  styleId: number;
  hasFormula: boolean;
  value: string | null;
  inPhonetic: boolean;
}

/** Column number of a cell reference such as "AB12" (1-based), or 0 when absent. */
function columnOf(ref: string | undefined): number {
  if (!ref) return 0;
  let col = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    col = col * 26 + (code - 64);
  }
  return col;
}

function checkBounds(row: number, col: number): void {
  if (row > MAX_ROWS || col > MAX_COLUMNS) {
    throw new InputValidationError(
      `Cell reference past Excel's limits (row ${row}, column ${col}); the file may be corrupt`,
    );
  }
}

/** Row number of a cell reference such as "AB12", or 0 when absent. */
function rowOf(ref: string): number {
  const digits = /\d+$/.exec(ref);
  return digits ? Number.parseInt(digits[0], 10) : 0;
}

interface MergeRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
  text: string;
}

const MERGE_CELL = /<mergeCell\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"/g;
// Longest plausible <mergeCell .../> element, kept across chunk boundaries.
const MERGE_SCAN_OVERLAP = 256;

/**
 * Collect a sheet's merged ranges. They sit after <sheetData> in the XML, but ExcelJS
 * repeated a range's top-left value into every cell of it, so they're needed before the
 * rows: this pass inflates the sheet once more and only string-searches it.
 */
async function readMergeRanges(stream: Readable): Promise<MergeRange[]> {
  const merges: MergeRange[] = [];
  let mergedCells = 0;
  let tail = "";
  for await (const chunk of stream) {
    const text = tail + (chunk as Buffer).toString("utf8");
    let lastEnd = 0;
    for (const match of text.matchAll(MERGE_CELL)) {
      const [first, second] = [match[1], match[2]];
      const merge = {
        top: Math.min(rowOf(first), rowOf(second)),
        bottom: Math.max(rowOf(first), rowOf(second)),
        left: Math.min(columnOf(first), columnOf(second)),
        right: Math.max(columnOf(first), columnOf(second)),
        text: "",
      };
      checkBounds(merge.bottom, merge.right);
      mergedCells += (merge.bottom - merge.top + 1) * (merge.right - merge.left + 1);
      if (mergedCells > MAX_MERGED_CELLS) {
        throw new InputValidationError(
          `The sheet merges more than ${MAX_MERGED_CELLS.toLocaleString("en-US")} cells; unmerge them and try again`,
        );
      }
      merges.push(merge);
      lastEnd = (match.index ?? 0) + match[0].length;
    }
    tail = text.slice(Math.max(lastEnd, text.length - MERGE_SCAN_OVERLAP));
  }
  return merges.sort((a, b) => a.top - b.top);
}

/**
 * Convert one worksheet of an XLSX to CSV without building ExcelJS's in-memory model,
 * which keeps an object per cell and held about 3 KB of heap per row (#4846). The
 * sheet XML is streamed; only the shared strings table (one entry per distinct value),
 * the merged ranges, and the CSV text stay in memory.
 *
 * Cells render as ExcelJS's `cell.text` did, with two deliberate differences: dates,
 * including a formula's cached date result, are ISO 8601 (the old route already did
 * this for plain date cells), and a formula's cached boolean or error renders as Excel
 * shows it ("true", "#DIV/0!") instead of "1" or "[object Object]".
 */
export async function xlsxToCsv(
  buffer: Buffer,
  sheetNumber: number,
  { maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES }: { maxOutputBytes?: number } = {},
): Promise<Buffer> {
  // exceljs is CJS, so under ESM the constructor lives on the default export.
  const { default: ExcelJS } = await import("exceljs");
  const requireFromExceljs = createRequire(createRequire(import.meta.url).resolve("exceljs"));
  const parseSax = requireFromExceljs("./lib/utils/parse-sax.js") as ParseSax;

  let zipfile: ZipFile;
  let entries: Map<string, Entry>;
  try {
    zipfile = await openZip(buffer);
    entries = await listEntries(zipfile);
  } catch (err) {
    throw new InputValidationError(`Not a readable XLSX file: ${(err as Error).message}`);
  }
  try {
    const parts = new ExcelJS.stream.xlsx.WorkbookReader(undefined as never, {
      sharedStrings: "cache",
      styles: "cache",
    }) as unknown as WorkbookParts;

    const read = async (path: string) => {
      const entry = entries.get(path);
      return entry ? openEntry(zipfile, entry) : null;
    };

    const rels = await read("xl/_rels/workbook.xml.rels");
    const workbookXml = await read("xl/workbook.xml");
    if (!rels || !workbookXml) throw new InputValidationError("Not a readable XLSX file");
    await parts._parseRels(rels);
    await parts._parseWorkbook(workbookXml);
    const sharedStrings = await read("xl/sharedStrings.xml");
    if (sharedStrings) for await (const _ of parts._parseSharedStrings(sharedStrings));
    const styles = await read("xl/styles.xml");
    if (styles) await parts._parseStyles(styles);

    const relById = new Map((parts.workbookRels ?? []).map((rel) => [rel.Id, rel]));
    const worksheetPaths: string[] = [];
    for (const sheet of parts.model?.sheets ?? []) {
      const rel = relById.get(sheet.rId);
      if (rel && WORKSHEET_REL_TYPE.test(rel.Type)) worksheetPaths.push(resolveTarget(rel.Target));
    }
    const sheetPath = worksheetPaths[sheetNumber - 1];
    const sheetMergeStream = sheetPath ? await read(sheetPath) : null;
    if (!sheetPath || !sheetMergeStream) {
      throw new InputValidationError(
        `Worksheet ${sheetNumber} not found (workbook has ${worksheetPaths.length} sheets)`,
      );
    }
    const merges = await readMergeRanges(sheetMergeStream);
    const sheetEntry = await read(sheetPath);
    if (!sheetEntry) throw new InputValidationError("Not a readable XLSX file");

    const date1904 = Boolean(parts.properties?.model?.date1904);
    const strings = parts.sharedStrings ?? [];
    const dateStyles = new Map<number, boolean>();
    const isDateStyle = (styleId: number) => {
      let isDate = dateStyles.get(styleId);
      if (isDate === undefined) {
        isDate = isDateFmt(parts.styles.getStyleModel(styleId)?.numFmt);
        dateStyles.set(styleId, isDate);
      }
      return isDate;
    };

    const renderCell = (cell: CellState): string | null => {
      const raw = cell.value;
      // A formula with no cached result still counted as a cell value for ExcelJS.
      if (raw === null) return cell.hasFormula ? "" : null;
      switch (cell.type) {
        case "s":
          return cell.hasFormula ? raw : sharedStringText(strings[Number.parseInt(raw, 10)]);
        case "str":
        case "inlineStr":
        case "e":
          return raw;
        case "b":
          return Number.parseInt(raw, 10) !== 0 ? "true" : "false";
        case "d": {
          const date = new Date(raw);
          return Number.isNaN(date.getTime()) ? raw : date.toISOString();
        }
        default: {
          const num = Number.parseFloat(raw);
          if (Number.isNaN(num)) return raw;
          return isDateStyle(cell.styleId) ? excelSerialToIso(num, date1904) : String(num);
        }
      }
    };

    // Rows go out as UTF-8 Buffers a batch at a time. Holding every row as a JS string
    // kept Papa's concatenated pieces alive and ran a 256 MB heap out of memory.
    const output: Buffer[] = [];
    let batch: string[] = [];
    const flush = () => {
      if (batch.length === 0) return;
      const separator = output.length > 0 ? "\r\n" : "";
      output.push(Buffer.from(separator + batch.join("\r\n"), "utf8"));
      batch = [];
    };
    let outputBytes = 0;
    let nextMerge = 0;
    let activeMerges: MergeRange[] = [];
    let lastRow = 0;

    // Overlay merged ranges on a row and emit it if anything is in it. ExcelJS gave
    // every cell of a range the top-left cell's text, and skipped rows with no values.
    const emitRow = async (rowNumber: number, cells: string[], rowHasValue: boolean) => {
      let hasValue = rowHasValue;
      while (nextMerge < merges.length && merges[nextMerge].top <= rowNumber) {
        activeMerges.push(merges[nextMerge++]);
      }
      if (activeMerges.length > 0) {
        activeMerges = activeMerges.filter((merge) => merge.bottom >= rowNumber);
        for (const merge of activeMerges) {
          if (merge.top === rowNumber && cells[merge.left - 1] !== undefined) {
            merge.text = cells[merge.left - 1];
          }
          while (cells.length < merge.right) cells.push("");
          for (let col = merge.left; col <= merge.right; col++) {
            if (merge.top !== rowNumber || col !== merge.left) cells[col - 1] = merge.text;
          }
          hasValue = true;
        }
      }
      lastRow = rowNumber;
      if (!hasValue) return;
      const line = Papa.unparse([cells]);
      // Counted per row, so a sheet over the cap stops before another batch is built.
      outputBytes += Buffer.byteLength(line, "utf8") + (outputBytes > 0 ? 2 : 0);
      if (outputBytes > maxOutputBytes) {
        const limitMb = Math.max(1, Math.floor(maxOutputBytes / (1024 * 1024)));
        throw new InputValidationError(
          `The CSV would be larger than ${limitMb.toLocaleString("en-US")} MB; split the sheet into smaller ones and try again`,
        );
      }
      batch.push(line);
      if (batch.length === ROWS_PER_YIELD) {
        flush();
        await yieldToEventLoop();
      }
    };

    // Rows missing from the XML still exist for ExcelJS when a merged range covers them.
    const emitGapRows = async (untilRow: number) => {
      for (let row = lastRow + 1; row < untilRow; row++) {
        const covered =
          activeMerges.some((merge) => merge.bottom >= row) ||
          (nextMerge < merges.length && merges[nextMerge].top <= row);
        if (covered) await emitRow(row, [], false);
        else if (nextMerge >= merges.length) break;
        else row = Math.min(untilRow, merges[nextMerge].top) - 1;
      }
    };

    let rowNumber = 0;
    let rowCells: string[] = [];
    let rowHasValue = false;
    let lastCol = 0;
    let cell: CellState | null = null;
    let collecting = false;

    for await (const events of parseSax(sheetEntry)) {
      for (const event of events) {
        if (event.eventType === "opentag") {
          const node = event.value;
          switch (node.name) {
            case "row":
              rowNumber = Number.parseInt(node.attributes.r ?? "", 10) || lastRow + 1;
              checkBounds(rowNumber, 0);
              await emitGapRows(rowNumber);
              rowCells = [];
              rowHasValue = false;
              lastCol = 0;
              break;
            case "c":
              cell = {
                col: columnOf(node.attributes.r) || lastCol + 1,
                type: node.attributes.t,
                styleId: Number.parseInt(node.attributes.s ?? "0", 10),
                hasFormula: false,
                value: null,
                inPhonetic: false,
              };
              lastCol = cell.col;
              checkBounds(rowNumber, cell.col);
              while (rowCells.length < cell.col) rowCells.push("");
              break;
            case "f":
              if (cell) cell.hasFormula = true;
              break;
            case "v":
              if (cell) {
                cell.value = "";
                collecting = true;
              }
              break;
            case "is":
              if (cell) cell.value = "";
              break;
            case "rPh":
              if (cell) cell.inPhonetic = true;
              break;
            case "t":
              if (cell && cell.value !== null && !cell.inPhonetic) collecting = true;
              break;
          }
        } else if (event.eventType === "text") {
          if (collecting && cell) cell.value += event.value;
        } else {
          switch (event.value.name) {
            case "v":
            case "t":
              collecting = false;
              break;
            case "rPh":
              if (cell) cell.inPhonetic = false;
              break;
            case "c":
              if (cell) {
                const text = renderCell(cell);
                if (text !== null) {
                  rowCells[cell.col - 1] = text;
                  rowHasValue = true;
                }
              }
              cell = null;
              break;
            case "row":
              await emitRow(rowNumber, rowCells, rowHasValue);
              break;
          }
        }
      }
    }
    const lastMergedRow = merges.reduce((max, merge) => Math.max(max, merge.bottom), 0);
    await emitGapRows(lastMergedRow + 1);
    flush();
    return Buffer.concat(output);
  } catch (err) {
    // Malformed XML and corrupt zip streams are bad input, like a file that won't open.
    if (err instanceof InputValidationError) throw err;
    throw new InputValidationError(`Not a readable XLSX file: ${(err as Error).message}`);
  } finally {
    zipfile.close();
  }
}
