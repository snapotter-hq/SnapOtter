/**
 * JSON-to-XML must produce one root element (#4377). A top-level array used
 * to become one <root> per item, and a single key holding an array repeated
 * that key at the top level, so no XML parser accepted the output.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withSingleRoot } from "../../../apps/api/src/routes/tools/json-xml.js";

// fast-xml-parser is an apps/api dependency, so resolve it from there.
const require = createRequire(path.resolve(__dirname, "../../../apps/api/package.json"));
const { XMLBuilder, XMLParser, XMLValidator } =
  require("fast-xml-parser") as typeof import("fast-xml-parser");

function toXml(data: object): string {
  return new XMLBuilder({ format: true, ignoreAttributes: false }).build(
    withSingleRoot(data),
  ) as string;
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
