import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLatestRelease, TOOLS, toolSection } from "@snapotter/shared";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const spec = load(readFileSync(join(root, "apps/api/src/openapi.yaml"), "utf8")) as {
  info: { version: string };
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: {
    schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
  };
};
const METHODS = ["get", "post", "put", "patch", "delete"];
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({
    path,
    method: m,
    op: item[m] as {
      operationId: string;
      tags?: string[];
      responses?: Record<
        string,
        {
          headers?: Record<string, unknown>;
          content?: Record<string, { schema?: { properties?: Record<string, unknown> } }>;
        }
      >;
    },
  })),
);

describe("openapi.yaml contract", () => {
  it("reports an API-major version, not the app version", () => {
    expect(spec.info.version).toMatch(/^[1-9]\d*\.0\.0$/);
  });

  it("declares security on every operation instead of inheriting the global one", () => {
    const implicit = operations
      .filter((o) => !("security" in o.op))
      .map((o) => `${o.method} ${o.path}`);
    expect(implicit).toEqual([]);
  });

  it("gives every operation a unique operationId", () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents a statusUrl and a Location header on every 202", () => {
    const accepted = operations.filter((o) => o.op.responses?.["202"]);
    expect(accepted.length).toBeGreaterThan(0);
    for (const { path, method, op } of accepted) {
      const r = op.responses?.["202"];
      const props = r?.content?.["application/json"]?.schema?.properties as
        | Record<string, { items?: { properties?: Record<string, unknown> } }>
        | undefined;
      // The tools install returns one entry per bundle, so each entry carries the URL and no Location header.
      if (props?.statusUrl) {
        expect(r?.headers?.Location, `${method} ${path} Location`).toBeDefined();
      } else {
        expect(
          props?.bundles?.items?.properties?.statusUrl,
          `${method} ${path} statusUrl`,
        ).toBeDefined();
      }
    }
  });

  it("requires code and requestId on every error body", () => {
    const error = spec.components.schemas.Error;
    expect(error.required).toEqual(expect.arrayContaining(["error", "code", "requestId"]));
    expect(error.properties).toHaveProperty("code");
    expect(error.properties).toHaveProperty("requestId");
  });

  it("documents the job status route", () => {
    expect(spec.paths["/api/v1/jobs/{jobId}"]?.get).toBeDefined();
  });

  it("tags each catalog tool operation with its section", () => {
    const sectionTag: Record<string, string> = {
      image: "Image",
      video: "Video",
      audio: "Audio",
      pdf: "PDF",
      files: "Files",
    };
    const misses: string[] = [];
    for (const tool of TOOLS) {
      const section = toolSection(tool);
      const path = `/api/v1/tools/${section}/${tool.id}`;
      const op = spec.paths[path]?.post as { tags?: string[] } | undefined;
      if (!op) {
        misses.push(`${path} missing`);
        continue;
      }
      if (!op.tags?.includes(sectionTag[section])) misses.push(`${path} tags ${op.tags}`);
    }
    expect(misses).toEqual([]);
  });

  // The route answers { latest: { version, url } } or { latest: null } (#4585).
  // OpenAPI 3.1 has no `nullable`, so the type is a list.
  it("types the latest-release body as a nullable { version, url } object", () => {
    const ok = spec.paths["/api/v1/admin/latest-release"]?.get?.responses as Record<
      string,
      {
        description: string;
        content: {
          "application/json": {
            schema: { properties: { latest: Record<string, unknown> } };
            example: { latest: unknown };
          };
        };
      }
    >;
    const json = ok["200"].content["application/json"];
    const latest = json.schema.properties.latest;
    expect(latest.type).toEqual(["object", "null"]);
    expect(latest).not.toHaveProperty("nullable");
    expect(latest.required).toEqual(["version", "url"]);
    expect(Object.keys(latest.properties as object).sort()).toEqual(["url", "version"]);
    expect(parseLatestRelease(json.example.latest)).toEqual(json.example.latest);
    expect(ok["200"].description).toMatch(/analytics is off/);
  });
});
