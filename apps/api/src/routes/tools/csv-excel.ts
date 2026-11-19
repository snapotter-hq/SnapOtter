import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { csvParseFailure } from "../../lib/csv-parse.js";
import { rowsToXlsx } from "../../lib/csv-to-xlsx.js";
import { xlsxToCsv } from "../../lib/xlsx-to-csv.js";
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

      if (lower.endsWith(".xlsx")) {
        return {
          buffer: await xlsxToCsv(input.buffer, settings.sheet),
          filename: `${base}.csv`,
          contentType: "text/csv",
        };
      }

      // csv -> xlsx: parse CSV rows, build a workbook
      const parsed = Papa.parse<string[]>(input.buffer.toString("utf8"), {
        header: false,
        skipEmptyLines: true,
      });
      const parseFailure = csvParseFailure(parsed);
      if (parseFailure) {
        throw new InputValidationError(`CSV parse failed: ${parseFailure}`);
      }
      const xlsxBuffer = await rowsToXlsx(parsed.data);
      return {
        buffer: xlsxBuffer,
        filename: `${base}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    },
  });
}
