import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  pretty: z.boolean().default(true),
});

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
        if (!Array.isArray(data)) {
          throw new InputValidationError(
            "JSON input must be an array of objects to convert to CSV",
          );
        }
        if (data.some((r) => r === null || typeof r !== "object" || Array.isArray(r))) {
          throw new InputValidationError("JSON array elements must be objects to convert to CSV");
        }
        // Flatten nested objects/arrays to JSON strings (Papa would otherwise emit
        // "[object Object]"), and pass the union of all keys so columns appearing
        // only in later rows are not dropped.
        const flattened = (data as Record<string, unknown>[]).map((row) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(row)) {
            out[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
          }
          return out;
        });
        const columns = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
        const csv = Papa.unparse(flattened, { columns });
        return {
          buffer: Buffer.from(csv, "utf8"),
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
