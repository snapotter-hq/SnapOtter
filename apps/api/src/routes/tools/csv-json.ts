import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
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
        const data: unknown = JSON.parse(input.buffer.toString("utf8"));
        if (!Array.isArray(data)) {
          throw new Error("JSON input must be an array of objects to convert to CSV");
        }
        const csv = Papa.unparse(data as Record<string, unknown>[]);
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
        throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
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
