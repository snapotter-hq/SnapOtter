import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, toolSection } from "@snapotter/shared";
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

  it("gives every operation a unique operationId", () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents a statusUrl and a Location header on every 202", () => {
    const accepted = operations.filter((o) => o.op.responses?.["202"]);
    expect(accepted.length).toBeGreaterThan(0);
    for (const { path, method, op } of accepted) {
      const r = op.responses?.["202"];
      expect(r?.headers?.Location, `${method} ${path} Location`).toBeDefined();
      expect(
        r?.content?.["application/json"]?.schema?.properties?.statusUrl,
        `${method} ${path} statusUrl`,
      ).toBeDefined();
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
});
