/**
 * JSON-to-XML must produce one root element (#4377). A top-level array used
 * to become one <root> per item, and a single key holding an array repeated
 * that key at the top level, so no XML parser accepted the output.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withSingleRoot, withXmlNames } from "../../../apps/api/src/routes/tools/json-xml.js";

// fast-xml-parser is an apps/api dependency, so resolve it from there.
const require = createRequire(path.resolve(__dirname, "../../../apps/api/package.json"));
const { XMLBuilder, XMLParser, XMLValidator } =
  require("fast-xml-parser") as typeof import("fast-xml-parser");

function toXml(data: object): string {
  // Mirrors the route's builder options.
  return new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    suppressBooleanAttributes: false,
  }).build(withSingleRoot(withXmlNames(data) as object)) as string;
}

describe("withSingleRoot", () => {
  it.each([
    [
      "a top-level array of objects",
      [
        { name: "Ada", age: 36 },
        { name: "Grace", age: 45 },
      ],
    ],
    ["a top-level array of scalars", [1, "two", 3]],
    ["an empty array", []],
    ["a single key holding an array", { items: [1, 2] }],
    ["several top-level keys", { a: 1, b: 2 }],
    ["an empty object", {}],
    ["a lone attribute key", { "@_id": "1" }],
    ["a lone text key", { "#text": "hi" }],
    ["a single element key", { people: { person: [{ name: "Ada" }] } }],
  ])("emits well-formed XML for %s", (_label, data) => {
    expect(XMLValidator.validate(toXml(data))).toBe(true);
  });

  it("keeps every array item as an <item> under one <root>", () => {
    const xml = toXml([
      { name: "Ada", age: 36 },
      { name: "Grace", age: 45 },
    ]);
    const parsed = new XMLParser().parse(xml);
    expect(Object.keys(parsed)).toEqual(["root"]);
    expect(parsed.root.item).toEqual([
      { name: "Ada", age: 36 },
      { name: "Grace", age: 45 },
    ]);
  });

  it("leaves an object with one element key unwrapped", () => {
    const data = { people: { person: [{ name: "Ada" }] } };
    expect(withSingleRoot(data)).toBe(data);
  });

  it("wraps a single key holding an array under <root>", () => {
    expect(withSingleRoot({ items: [1, 2] })).toEqual({ root: { items: [1, 2] } });
  });
});

// The builder writes JSON keys straight into tag names, so a key that isn't an
// XML name used to produce output no parser accepts (#4859).
describe("withXmlNames", () => {
  it.each([
    ["a key with a space", { a: { "first name": 1 } }],
    ["a key starting with a digit", { a: { "2024": 1 } }],
    ["a nested array", [[1, 2]]],
    ["a key holding markup characters", { a: { 'a<b>&"/': 1 } }],
    ["an empty key", { a: { "": 1 } }],
    ["a renamed key holding null", { a: { "first name": null } }],
    ["a renamed key holding an object", { a: { "1st": { b: 1 } } }],
    ["a renamed key holding an array", { a: { "my list": [1, { b: 2 }, [3]] } }],
    ["keys that sanitise to the same name", { a: { "a b": 1, a_b: 2 } }],
    ["a lone top-level bad key", { "first name": "Ada" }],
    ["an attribute key with a space", { a: { "@_a b": "x", c: 1 } }],
    ["an attribute holding an object", { a: { "@_x": { k: 1 } } }],
    ["an attribute holding an array", { a: { "@_x": [1, 2] } }],
    ["a bare attribute prefix", { a: { "@_": "y" } }],
    ["a boolean attribute", { a: { "@_x": true } }],
  ])("emits well-formed XML for %s", (_label, data) => {
    expect(XMLValidator.validate(toXml(data))).toBe(true);
  });

  it("keeps the original key in a key attribute", () => {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(
      toXml({ a: { "2024": 1, "first name": { b: 2 } } }),
    );
    expect(parsed.a._2024).toEqual({ "#text": 1, "@_key": "2024" });
    expect(parsed.a.first_name).toEqual({ b: 2, "@_key": "first name" });
  });

  it("turns arrays nested in arrays into <item> children", () => {
    const parsed = new XMLParser().parse(toXml([[1, 2], [3]]));
    expect(parsed.root.item).toEqual([{ item: [1, 2] }, { item: 3 }]);
  });

  it("keeps both values when two keys sanitise to one name", () => {
    const out = withXmlNames({ "a b": 1, a_b: 2 });
    expect(out).toEqual({ a_b: [{ "#text": 1, "@_key": "a b" }, 2] });
  });

  it("leaves valid names, prefixed names, attributes and text alone", () => {
    const data = {
      "soap:Envelope": { "@_xmlns:soap": "urn:x", "#text": "hi", "é-name.1": 1 },
    };
    expect(withXmlNames(data)).toEqual(data);
  });

  it("keeps a __proto__ key as data", () => {
    const out = withXmlNames(JSON.parse('{"__proto__": {"x": 1}}')) as object;
    expect(Object.keys(out)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it("lets a value's own key attribute win over the renamed key", () => {
    expect(withXmlNames({ "a b": { "@_key": "mine" } })).toEqual({ a_b: { "@_key": "mine" } });
  });

  it("rejects nesting the builder would refuse", () => {
    let deep: object = { leaf: 1 };
    for (let i = 0; i < 500; i++) deep = { n: deep };
    expect(() => withXmlNames(deep)).toThrow(/more than 100 levels/);
  });

  it("rejects deep array-only nesting instead of overflowing the stack", () => {
    const deep = JSON.parse(`${"[".repeat(20_000)}${"]".repeat(20_000)}`);
    expect(() => withXmlNames(deep)).toThrow(/more than 100 levels/);
  });

  it("accepts array nesting within the limit", () => {
    const deep = JSON.parse(`${"[".repeat(90)}1${"]".repeat(90)}`);
    expect(XMLValidator.validate(toXml(deep))).toBe(true);
  });
});
