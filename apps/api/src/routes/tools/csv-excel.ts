import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  sheet: z.number().int().min(1).default(1),
});

export function registerCsvExcel(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "csv-excel",
    settingsSchema,
    process: async () => {
      throw new Error("csv-excel is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const lower = input.filename.toLowerCase();

      // Dynamic import: exceljs is heavy; load it only when this tool runs.
      // exceljs is CJS, so under ESM the constructor lives on the default export
      // (namespace `.Workbook` is undefined -> "is not a constructor").
      const { default: ExcelJS } = await import("exceljs");

      if (lower.endsWith(".xlsx")) {
        // xlsx -> csv: load workbook, pick the Nth worksheet, extract rows
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
        const ws = workbook.worksheets[settings.sheet - 1];
        if (!ws) {
          throw new InputValidationError(
            `Worksheet ${settings.sheet} not found (workbook has ${workbook.worksheets.length} sheets)`,
          );
        }
        const rows: string[][] = [];
        ws.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            // cell.text renders dates via Date.toString() (timezone-dependent and
            // not round-trippable); emit ISO 8601 for Date values instead.
            cells.push(cell.value instanceof Date ? cell.value.toISOString() : cell.text);
          });
          rows.push(cells);
        });
        const csv = Papa.unparse(rows);
        return {
          buffer: Buffer.from(csv, "utf8"),
          filename: `${base}.csv`,
          contentType: "text/csv",
        };
      }

      // csv -> xlsx: parse CSV rows, build a workbook
      const parsed = Papa.parse<string[]>(input.buffer.toString("utf8"), {
        header: false,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) {
        throw new InputValidationError(`CSV parse failed: ${parsed.errors[0].message}`);
      }
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Sheet1");
      ws.addRows(parsed.data);
      const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return {
        buffer: xlsxBuffer,
        filename: `${base}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    },
  });
}
