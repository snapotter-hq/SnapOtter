import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { CLIENT_JOB_ID_PATTERN } from "../../../apps/api/src/jobs/types.js";

/**
 * Every route validates clientJobId with the same pattern and answers 400 on a
 * miss (#1691), so the spec has to say what that pattern is. Otherwise a caller
 * has no way to know "my job" will be refused. The translated specs share the
 * English structure, so they're held to the same contract.
 */

const SPEC_DIR = join(import.meta.dirname, "../../../apps/api/src");
const SPEC_FILES = readdirSync(SPEC_DIR).filter((f) => /^openapi(\.[\w-]+)?\.yaml$/.test(f));

function clientJobIdSchemas(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const item of node) clientJobIdSchemas(item, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "clientJobId" && value && typeof value === "object") out.push(value);
      clientJobIdSchemas(value, out);
    }
  }
  return out;
}

describe("OpenAPI clientJobId contract", () => {
  it("finds the English spec and every translation", () => {
    expect(SPEC_FILES).toContain("openapi.yaml");
    expect(SPEC_FILES.length).toBeGreaterThan(1);
  });

  for (const file of SPEC_FILES) {
    it(`${file} documents the server's pattern and length on every clientJobId`, () => {
      const spec = yaml.load(readFileSync(join(SPEC_DIR, file), "utf8"));
      const schemas = clientJobIdSchemas(spec);

      expect(schemas.length).toBeGreaterThan(0);
      for (const schema of schemas) {
        expect(schema).toMatchObject({
          type: "string",
          pattern: CLIENT_JOB_ID_PATTERN.source,
          maxLength: 128,
        });
      }
    });
  }
});
