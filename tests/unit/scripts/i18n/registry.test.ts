// tests/unit/scripts/i18n/registry.test.ts
import { describe, expect, it } from "vitest";
import { ADAPTERS, resolveSurfaces } from "../../../../scripts/i18n/adapters/registry.mjs";

describe("registry", () => {
  it("exports an ADAPTERS object", () => {
    expect(typeof ADAPTERS).toBe("object");
  });

  it("resolveSurfaces('all') returns all registered keys", () => {
    expect(resolveSurfaces("all")).toEqual(Object.keys(ADAPTERS));
  });

  it("resolveSurfaces filters to known keys", () => {
    expect(resolveSurfaces("nope")).toEqual([]);
  });
});
