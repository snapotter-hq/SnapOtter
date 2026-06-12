import { XMLParser } from "fast-xml-parser";
import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

const TEN_MIB = 10 * 1024 * 1024;

/**
 * Walk the parsed XML tree depth-first and return the first value that
 * is an array of objects (the "repeating elements" suitable for tabulation).
 */
function findFirstArray(node: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(node)) {
    if (node.length > 0 && typeof node[0] === "object" && node[0] !== null) {
      return node as Record<string, unknown>[];
    }
    return null;
  }
  if (typeof node === "object" && node !== null) {
    for (const val of Object.values(node)) {
      const found = findFirstArray(val);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Flatten one level: nested objects and arrays become JSON strings in the cell.
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (val !== null && typeof val === "object") {
      out[key] = JSON.stringify(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function registerXmlToCsv(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "xml-to-csv",
    settingsSchema,
    process: async () => {
      throw new Error("xml-to-csv is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");

      if (input.buffer.length > TEN_MIB) {
        throw new InputValidationError("File too large for conversion (10 MB limit)");
      }

      const text = input.buffer.toString("utf8");

      // Mirror json-xml.ts parser options
      const parser = new XMLParser({ ignoreAttributes: false });
      let parsed: unknown;
      try {
        parsed = parser.parse(text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new InputValidationError(`XML parse failed: ${msg.split("\n")[0]}`);
      }

      const rows = findFirstArray(parsed);
      if (!rows || rows.length === 0) {
        throw new InputValidationError("No repeating elements found to tabulate");
      }

      const flattened = rows.map(flattenRow);
      const csv = Papa.unparse(flattened);

      return {
        buffer: Buffer.from(csv, "utf8"),
        filename: `${base}.csv`,
        contentType: "text/csv",
        resultPayload: { rows: flattened.length },
      };
    },
  });
}
