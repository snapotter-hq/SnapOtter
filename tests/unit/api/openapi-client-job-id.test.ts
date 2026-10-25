import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath, BASE_CONFIG, CONVERSION_PRESETS } from "@snapotter/shared";
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

// Non-registry conversion presets whose single-file route still documents
// clientJobId in openapi.yaml without reading it. Drop an entry with its fix.
const DOCUMENTED_WITHOUT_CLIENT_JOB_ID_READ: Record<string, string> = {
  "/api/v1/tools/image/svg-to-jpg":
    "#4018: single-file svg-to-raster route does not read clientJobId",
  "/api/v1/tools/image/svg-to-png":
    "#4018: single-file svg-to-raster route does not read clientJobId",
};

interface OpenApiDoc {
  paths?: Record<
    string,
    {
      post?: {
        requestBody?: {
          content?: {
            "multipart/form-data"?: {
              schema?: {
                properties?: Record<string, unknown>;
              };
            };
          };
        };
      };
    }
  >;
}

function hasMultipartClientJobId(spec: OpenApiDoc, path: string): boolean {
  const props =
    spec.paths?.[path]?.post?.requestBody?.content?.["multipart/form-data"]?.schema?.properties;
  return Boolean(props && "clientJobId" in props);
}

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

    it(`${file} omits clientJobId on image-to-pdf and single-file pdf-to-image routes (#1735)`, () => {
      const spec = yaml.load(readFileSync(join(SPEC_DIR, file), "utf8")) as OpenApiDoc;
      const inlinePdfRoutes = [
        apiToolPath("image-to-pdf"),
        apiToolPath("pdf-to-image"),
        ...CONVERSION_PRESETS.filter(
          (preset) => preset.base === "image-to-pdf" || preset.base === "pdf-to-image",
        ).map((preset) => apiToolPath(preset.id)),
      ];

      const documented = inlinePdfRoutes.filter((path) => hasMultipartClientJobId(spec, path));
      expect(documented).toEqual([]);
    });
  }

  it("documents clientJobId on conversion presets only when backed by createToolRoute", () => {
    const spec = yaml.load(readFileSync(join(SPEC_DIR, "openapi.yaml"), "utf8")) as OpenApiDoc;
    const registryPresetsMissing = CONVERSION_PRESETS.filter(
      (preset) => BASE_CONFIG[preset.base].group === "registry",
    )
      .map((preset) => apiToolPath(preset.id))
      .filter((path) => !hasMultipartClientJobId(spec, path));
    expect(registryPresetsMissing).toEqual([]);

    const nonRegistryPresetsWithClientJobId = CONVERSION_PRESETS.filter(
      (preset) => BASE_CONFIG[preset.base].group !== "registry",
    )
      .map((preset) => apiToolPath(preset.id))
      .filter((path) => hasMultipartClientJobId(spec, path))
      .sort();
    expect(nonRegistryPresetsWithClientJobId).toEqual(
      Object.keys(DOCUMENTED_WITHOUT_CLIENT_JOB_ID_READ).sort(),
    );
  });
});
