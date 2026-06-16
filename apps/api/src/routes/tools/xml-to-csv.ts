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
 * Fallback for a single (non-repeating) record: depth-first, find the first
 * object whose values are all scalar (a leaf record), skipping the XML
 * declaration (keys starting with "?"). Lets a 1-element XML still tabulate.
 */
function findFirstRecord(node: unknown): Record<string, unknown> | null {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return null;
  const entries = Object.entries(node as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("?"),
  );
  const objectChildren = entries.filter(([, v]) => typeof v === "object" && v !== null);
  const hasScalar = entries.some(([, v]) => v === null || typeof v !== "object");
  if (hasScalar && objectChildren.length === 0) {
    return Object.fromEntries(entries);
  }
  for (const [, v] of objectChildren) {
    const found = findFirstRecord(v);
    if (found) return found;
  }
  return null;
}

/**
 * Flatten one level: nested objects and arrays become JSON strings in the cell.
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const original = new Set(Object.keys(row));
  for (const [key, val] of Object.entries(row)) {
    // Strip fast-xml-parser's internal markers from column names: "@_" on
    // attributes and "#text" for an element's text content -- unless a sibling
    // element already owns the cleaned-up name.
    let bare = key;
    if (key.startsWith("@_")) bare = key.slice(2);
    else if (key === "#text") bare = "text";
    const outKey = bare !== key && original.has(bare) ? key : bare;
    out[outKey] = val !== null && typeof val === "object" ? JSON.stringify(val) : val;
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

      let rows = findFirstArray(parsed);
      if (!rows) {
        // No repeating array: fall back to a single record (1-row table).
        const single = findFirstRecord(parsed);
        if (single) rows = [single];
      }
      if (!rows || rows.length === 0) {
        throw new InputValidationError("No repeating elements found to tabulate");
      }

      const flattened = rows.map(flattenRow);
      // Papa.unparse derives columns from the first row only; pass the union of
      // all keys so heterogeneous records don't silently drop columns.
      const columns = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
      const csv = Papa.unparse(flattened, { columns });

      return {
        buffer: Buffer.from(csv, "utf8"),
        filename: `${base}.csv`,
        contentType: "text/csv",
        resultPayload: { rows: flattened.length },
      };
    },
  });
}
