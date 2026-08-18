import { describe, expect, it } from "vitest";
import { convertRow } from "../../../apps/api/src/db/migrate-from-sqlite.js";

/**
 * A 1.x SQLite cell can hold a double-encoded permissions value like
 * '"images:process,files:read"'. JSON.parse turns that into a plain string,
 * the ::jsonb cast stores it as a jsonb string, and the settings dialog then
 * dies on `.join is not a function` forever (Sentry WEB-C, issue #846).
 * The import has to normalize permissions to an array or drop them.
 */
describe("convertRow permissions normalization", () => {
  it("coerces a double-encoded api_keys.permissions string to null", () => {
    const out = convertRow("api_keys", {
      id: 1,
      permissions: '"images:process,files:read"',
    });
    expect(out.permissions).toBeNull();
  });

  it("coerces a JSON object in api_keys.permissions to null", () => {
    const out = convertRow("api_keys", { id: 2, permissions: '{"images": true}' });
    expect(out.permissions).toBeNull();
  });

  it("keeps a well-formed api_keys.permissions array, dropping non-string members", () => {
    const out = convertRow("api_keys", {
      id: 3,
      permissions: '["images:process", 7, "files:read"]',
    });
    expect(out.permissions).toEqual(["images:process", "files:read"]);
  });

  it("coerces a non-array roles.permissions to an empty array (column is NOT NULL)", () => {
    const out = convertRow("roles", { id: "r1", permissions: '"images:process"' });
    expect(out.permissions).toEqual([]);
  });

  it("keeps a well-formed roles.permissions array", () => {
    const out = convertRow("roles", { id: "r2", permissions: '["images:process"]' });
    expect(out.permissions).toEqual(["images:process"]);
  });

  it("leaves null api_keys.permissions as null", () => {
    const out = convertRow("api_keys", { id: 4, permissions: null });
    expect(out.permissions).toBeNull();
  });
});
