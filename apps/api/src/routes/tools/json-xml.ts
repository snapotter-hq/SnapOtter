import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

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
        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(text);
        const json = JSON.stringify(parsed, null, settings.pretty ? 2 : 0);
        return {
          buffer: Buffer.from(json, "utf8"),
          filename: `${base}.json`,
          contentType: "application/json",
        };
      }

      // json -> xml
      const data: unknown = JSON.parse(text);
      // Wrap in a root element when the top level is an array or has
      // multiple keys, so the XML is well-formed with a single root.
      const wrapped =
        Array.isArray(data) ||
        (typeof data === "object" && data !== null && Object.keys(data).length !== 1)
          ? { root: data }
          : data;
      const builder = new XMLBuilder({ format: settings.pretty, ignoreAttributes: false });
      const xml = builder.build(wrapped) as string;
      return {
        buffer: Buffer.from(xml, "utf8"),
        filename: `${base}.xml`,
        contentType: "application/xml",
      };
    },
  });
}
