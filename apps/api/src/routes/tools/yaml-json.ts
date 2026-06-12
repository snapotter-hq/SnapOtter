import type { FastifyInstance } from "fastify";
import jsYaml from "js-yaml";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

const TEN_MIB = 10 * 1024 * 1024;

export function registerYamlJson(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "yaml-json",
    settingsSchema,
    process: async () => {
      throw new Error("yaml-json is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const lower = input.filename.toLowerCase();

      if (input.buffer.length > TEN_MIB) {
        throw new InputValidationError("File too large for conversion (10 MB limit)");
      }

      const text = input.buffer.toString("utf8");

      if (lower.endsWith(".json")) {
        // JSON -> YAML
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new InputValidationError(`Not valid JSON: ${msg.split("\n")[0]}`);
        }
        const yaml = jsYaml.dump(data);
        return {
          buffer: Buffer.from(yaml, "utf8"),
          filename: `${base}.yaml`,
          contentType: "text/yaml",
        };
      }

      // YAML -> JSON (handles .yaml and .yml)
      let parsed: unknown;
      try {
        parsed = jsYaml.load(text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new InputValidationError(`Not valid YAML: ${msg.split("\n")[0]}`);
      }
      const json = JSON.stringify(parsed, null, 2);
      return {
        buffer: Buffer.from(json, "utf8"),
        filename: `${base}.json`,
        contentType: "application/json",
      };
    },
  });
}
