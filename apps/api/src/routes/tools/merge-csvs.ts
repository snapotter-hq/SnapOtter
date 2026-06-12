import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMergeCsvs(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "merge-csvs",
    maxInputs: 20,
    settingsSchema,
    process: async () => {
      throw new Error("merge-csvs is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Merging needs at least two CSV files");
      }

      // Parse the first file to establish column order and delimiter
      const firstText = ctx.inputs[0].buffer.toString("utf8");
      const firstResult = Papa.parse<Record<string, unknown>>(firstText, {
        header: true,
        skipEmptyLines: true,
      });
      if (firstResult.errors.length > 0) {
        throw new InputValidationError(`CSV parse failed: ${firstResult.errors[0].message}`);
      }

      const fields = firstResult.meta.fields ?? [];
      const fieldSet = new Set(fields);
      const detectedDelimiter = firstResult.meta.delimiter || ",";
      const allRows: Record<string, unknown>[] = [...firstResult.data];

      // Parse remaining files and validate headers match
      for (let i = 1; i < ctx.inputs.length; i++) {
        const input = ctx.inputs[i];
        const text = input.buffer.toString("utf8");
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (result.errors.length > 0) {
          throw new InputValidationError(
            `CSV parse failed in ${input.filename}: ${result.errors[0].message}`,
          );
        }

        const otherFields = new Set(result.meta.fields ?? []);
        if (otherFields.size !== fieldSet.size || ![...otherFields].every((f) => fieldSet.has(f))) {
          throw new InputValidationError(`${input.filename} has different columns`);
        }

        allRows.push(...result.data);
      }

      // Unparse preserving the first file's field order and delimiter
      const merged = Papa.unparse(allRows, {
        columns: fields,
        delimiter: detectedDelimiter,
      });

      return {
        buffer: Buffer.from(merged, "utf8"),
        filename: "merged.csv",
        contentType: "text/csv",
      };
    },
  });
}
