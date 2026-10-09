import { describe, expect, it } from "vitest";
import { parseCsvWithHeader } from "../../../apps/api/src/lib/csv-parse.js";

/**
 * Papa builds each header-mode row as `{}` and assigns `row[field] = value`, so a
 * column headed `__proto__` hit the prototype setter and its cells were dropped
 * while `meta.fields` still listed it (#2096). Rows are null-prototype objects
 * now, so every header, including `__proto__`, is an own property.
 */
describe("parseCsvWithHeader", () => {
  it("keeps a column headed __proto__", () => {
    const { data, meta } = parseCsvWithHeader("__proto__,x\r\n5,1\r\n6,2");

    expect(meta.fields).toEqual(["__proto__", "x"]);
    expect(data.map((row) => Object.keys(row))).toEqual([
      ["__proto__", "x"],
      ["__proto__", "x"],
    ]);
    expect(Object.getOwnPropertyDescriptor(data[0], "__proto__")?.value).toBe("5");
    expect(JSON.stringify(data)).toBe('[{"__proto__":"5","x":"1"},{"__proto__":"6","x":"2"}]');
  });

  it("builds rows without a prototype, so a missing key never reads an inherited member", () => {
    const { data } = parseCsvWithHeader("a,b\r\n1,2");

    expect(Object.getPrototypeOf(data[0])).toBeNull();
    expect(data[0].constructor).toBeUndefined();
  });

  it("renames a duplicated __proto__ header the way Papa renames any other duplicate", () => {
    const { data, meta } = parseCsvWithHeader("__proto__,__proto__,x\r\n1,2,3");

    expect(meta.fields).toEqual(["__proto__", "__proto___1", "x"]);
    expect(JSON.stringify(data[0])).toBe('{"__proto__":"1","__proto___1":"2","x":"3"}');
  });

  it("leaves an ordinary file exactly as Papa parses it", () => {
    const { data, meta, errors } = parseCsvWithHeader("name,age\r\nAda,36\r\nGrace,45");

    expect(meta.fields).toEqual(["name", "age"]);
    expect(errors).toEqual([]);
    expect(data.map((row) => ({ ...row }))).toEqual([
      { name: "Ada", age: "36" },
      { name: "Grace", age: "45" },
    ]);
  });

  it("keeps Papa's parse errors", () => {
    const { errors } = parseCsvWithHeader('a,b\r\n"unterminated,1');

    expect(errors.length).toBeGreaterThan(0);
  });
});
