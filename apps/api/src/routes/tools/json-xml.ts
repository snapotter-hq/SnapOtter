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

/**
 * Shape parsed JSON so the builder emits exactly one root element (#4377).
 * The builder repeats a key once per array item and turns `@_` keys and
 * `#text` into attributes and text, so only an object with a single plain key
 * holding a non-array value already has one root. Anything else goes under
 * `<root>`, with top-level array items as `<item>` children.
 */
export function withSingleRoot(data: object): object {
  if (Array.isArray(data)) return { root: { item: data } };
  const keys = Object.keys(data);
  const [only] = keys;
  const singleElement =
    keys.length === 1 &&
    !only.startsWith("@_") &&
    only !== "#text" &&
    !Array.isArray((data as Record<string, unknown>)[only]);
  return singleElement ? data : { root: data };
}

const INVALID_TEXT_NODE = "INVALID_TEXT_NODE";

/**
 * Reject a `#text` value the builder can't write as element text (#4985). An
 * array made it throw a plain TypeError, and an object became the text
 * `[object Object]`. Scalars and null still convert, so XML -> JSON output
 * (`{"@_id": "1", "#text": "hi"}`) round-trips. Deeper than the nesting cap
 * the builder refuses the document anyway, so the walk stops there.
 */
export function assertScalarTextNodes(value: unknown, depth = 0): void {
  if (value === null || typeof value !== "object" || depth > MAX_NESTING) return;
  if (Array.isArray(value)) {
    for (const item of value) assertScalarTextNodes(item, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "#text" && child !== null && typeof child === "object") {
      throw new InputValidationError(
        'JSON "#text" values must be text, a number, a boolean or null',
        400,
        undefined,
        INVALID_TEXT_NODE,
      );
    }
    assertScalarTextNodes(child, depth + 1);
  }
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
      assertScalarTextNodes(data);
      const wrapped = withSingleRoot(data);
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
