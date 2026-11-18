import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

// fast-xml-parser and fast-xml-builder both refuse documents nested deeper
// than this (their default), throwing a plain Error that used to read as our
// bug (NODE-A8). The cap guards the recursive builder, so keep it and say so.
const MAX_NESTING = 100;
const NESTING_TOO_DEEP = "NESTING_TOO_DEEP";

function isNestingLimitError(err: unknown): boolean {
  return err instanceof Error && err.message === "Maximum nested tags exceeded";
}

function nestingTooDeep(kind: "JSON" | "XML"): InputValidationError {
  return new InputValidationError(
    `${kind} is nested more than ${MAX_NESTING} levels deep, which is the conversion limit`,
    400,
    undefined,
    NESTING_TOO_DEEP,
  );
}

const settingsSchema = z.object({
  pretty: z.boolean().default(true),
});

export function registerJsonXml(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "json-xml",
    settingsSchema,
    process: async () => {
      throw new Error("json-xml is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const lower = input.filename.toLowerCase();
      const text = input.buffer.toString("utf8");

      if (lower.endsWith(".xml")) {
        // xml -> json
        const parser = new XMLParser({ ignoreAttributes: false, maxNestedTags: MAX_NESTING });
        let parsed: unknown;
        try {
          parsed = parser.parse(text);
        } catch (err: unknown) {
          if (isNestingLimitError(err)) throw nestingTooDeep("XML");
          throw err;
        }
        const json = JSON.stringify(parsed, null, settings.pretty ? 2 : 0);
        return {
          buffer: Buffer.from(json, "utf8"),
          filename: `${base}.json`,
          contentType: "application/json",
        };
      }

      // json -> xml
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new InputValidationError(`Not valid JSON: ${msg.split("\n")[0]}`);
      }
      // The builder needs an object/array root; primitives (null, string, number,
      // boolean) crash builder.build or produce per-character garbage XML.
      if (data === null || typeof data !== "object") {
        throw new InputValidationError("JSON must be an object or array to convert to XML");
      }
      // Wrap in a root element when the top level is an array or has multiple
      // keys, so the XML is well-formed with a single root.
      const wrapped = Array.isArray(data) || Object.keys(data).length !== 1 ? { root: data } : data;
      const builder = new XMLBuilder({
        format: settings.pretty,
        ignoreAttributes: false,
        maxNestedTags: MAX_NESTING,
      });
      let xml: string;
      try {
        xml = builder.build(wrapped) as string;
      } catch (err: unknown) {
        if (isNestingLimitError(err)) throw nestingTooDeep("JSON");
        throw err;
      }
      return {
        buffer: Buffer.from(xml, "utf8"),
        filename: `${base}.xml`,
        contentType: "application/xml",
      };
    },
  });
}
