/**
 * JSON-to-CSV accepts the shapes APIs actually return (#1159).
 *
 * A top-level array of objects always worked. A single-key wrapper such as
 * {"data": [...]} unwraps to its array, and a flat object of scalars becomes a
 * two-column key/value table. Anything else is still refused, and the message
 * names the shapes that are accepted.
 */
import { describe, expect, it } from "vitest";
import { jsonToRows } from "../../../apps/api/src/routes/tools/csv-json.js";

describe("jsonToRows", () => {
  it("passes a top-level array of objects through", () => {
    expect(jsonToRows([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("unwraps a single-key object holding an array of objects", () => {
    expect(jsonToRows({ users: [{ id: 1, name: "a" }] })).toEqual([{ id: 1, name: "a" }]);
    expect(jsonToRows({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it("turns a flat object of scalars into key/value rows", () => {
    expect(jsonToRows({ a: 1, b: "x", c: null, d: true })).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: "x" },
      { key: "c", value: null },
      { key: "d", value: true },
    ]);
  });

  it("does not unwrap when there are several top-level keys", () => {
    expect(() => jsonToRows({ users: [{ id: 1 }], meta: { total: 1 } })).toThrow(
      /array of objects/,
    );
    expect(() => jsonToRows({ users: [{ id: 1 }], total: 1 })).toThrow(/array of objects/);
  });

  it("rejects arrays with non-object elements", () => {
    expect(() => jsonToRows([{ id: 1 }, "note"])).toThrow(/must be objects/);
    expect(() => jsonToRows({ data: [{ id: 1 }, "note"] })).toThrow(/must be objects/);
  });

  it("rejects primitives and a single-key array of scalars", () => {
    expect(() => jsonToRows(5)).toThrow(/array of objects/);
    expect(() => jsonToRows(null)).toThrow(/array of objects/);
    expect(() => jsonToRows({ ids: [1, 2] })).toThrow(/must be objects/);
  });

  it("rejects empty row sets with a clear message instead of crashing in Papa", () => {
    expect(() => jsonToRows([])).toThrow(/no rows/);
    expect(() => jsonToRows({ data: [] })).toThrow(/no rows/);
  });

  it("rejects nested objects that are not a single array wrapper", () => {
    expect(() => jsonToRows({ a: { b: 1 } })).toThrow(/array of objects/);
  });
});
