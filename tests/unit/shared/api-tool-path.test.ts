import { apiToolPath, TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("apiToolPath", () => {
  it("builds /api/v1/tools/<section>/<id>", () => {
    expect(apiToolPath("crop")).toBe("/api/v1/tools/image/crop");
    expect(apiToolPath("merge-pdf")).toBe("/api/v1/tools/pdf/merge-pdf");
    expect(apiToolPath("word-to-pdf")).toBe("/api/v1/tools/files/word-to-pdf");
    expect(apiToolPath("csv-json")).toBe("/api/v1/tools/files/csv-json");
  });

  it("throws on unknown tool", () => {
    expect(() => apiToolPath("nope")).toThrow(/unknown tool/);
  });
});

describe("route values", () => {
  it("are section-prefixed and unique", () => {
    const routes = TOOLS.map((t) => t.route);
    expect(routes).toContain("/pdf/merge-pdf");
    expect(routes).toContain("/files/csv-json");
    expect(routes).toContain("/image/crop");
    expect(new Set(routes).size).toBe(TOOLS.length); // no collisions
    // every route is exactly /<section>/<id> (two segments)
    expect(routes.every((r) => r.split("/").length === 3)).toBe(true);
  });

  it("has globally unique ids", () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
  });
});
