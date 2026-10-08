import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  pretty: z.boolean().default(true),
});

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Normalise parsed JSON into rows for CSV. Accepts an array of objects, a
 * single-key wrapper around one ({"data": [...]}), or a flat object of scalars
 * (emitted as key/value rows). A wrapper with several keys is refused rather
 * than picking one and silently dropping the rest.
 */
export function jsonToRows(data: unknown): Record<string, unknown>[] {
  let rows = data;
  if (isPlainObject(data)) {
    const entries = Object.entries(data);
    if (entries.length === 1 && Array.isArray(entries[0][1])) {
      rows = entries[0][1];
    } else if (
      entries.length > 0 &&
      entries.every(([, v]) => v === null || typeof v !== "object")
    ) {
      return entries.map(([key, value]) => ({ key, value }));
    }
  }
  if (!Array.isArray(rows)) {
    throw new InputValidationError(
      'JSON input must be an array of objects, an object wrapping one (like {"data": [...]}), or a flat object of key/value pairs',
    );
  }
  if (!rows.every(isPlainObject)) {
    throw new InputValidationError("JSON array elements must be objects to convert to CSV");
  }
  if (rows.length === 0) {
    throw new InputValidationError("JSON input has no rows to convert to CSV (the array is empty)");
  }
  return rows;
}

/**
 * Flatten nested objects/arrays to JSON strings (Papa would otherwise emit
 * "[object Object]"), and pass the union of all keys so columns appearing only
 * in later rows are not dropped. Rows are null-prototype objects: on a `{}`
 * literal, assigning a `__proto__` key hits the prototype setter and the column
 * silently vanishes (#2062).
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const flattened = rows.map((row) => {
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(row)) {
      out[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return out;
  });
  const columns = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) {
    throw new InputValidationError(
      "JSON rows have no fields, so there are no CSV columns to write",
    );
  }
  return Papa.unparse(flattened, { columns });
}

export function registerCsvJson(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "csv-json",
    settingsSchema,
    process: async () => {
      throw new Error("csv-json is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const lower = input.filename.toLowerCase();

      if (lower.endsWith(".json")) {
        let data: unknown;
        try {
          data = JSON.parse(input.buffer.toString("utf8"));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new InputValidationError(`Not valid JSON: ${msg.split("\n")[0]}`);
        }
        const rows = jsonToRows(data);
        return {
          buffer: Buffer.from(rowsToCsv(rows), "utf8"),
          filename: `${base}.csv`,
          contentType: "text/csv",
        };
      }

      const parsed = Papa.parse<Record<string, unknown>>(input.buffer.toString("utf8"), {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) {
        throw new InputValidationError(`CSV parse failed: ${parsed.errors[0].message}`);
      }
      const json = JSON.stringify(parsed.data, null, settings.pretty ? 2 : 0);
      return {
        buffer: Buffer.from(json, "utf8"),
        filename: `${base}.json`,
        contentType: "application/json",
      };
    },
  });
}
