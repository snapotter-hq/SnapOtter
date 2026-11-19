/**
 * JSON-to-XML refuses a non-scalar `#text` value (#4985). An array made the
 * builder throw a plain TypeError and an object came out as
 * `[object Object]`; scalar text still converts.
 */
import { describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { assertScalarTextNodes } from "../../../apps/api/src/routes/tools/json-xml.js";

describe("assertScalarTextNodes", () => {
  it.each([
    ["an array", { a: { "#text": [1, 2] } }],
    ["an object", { a: { "#text": { x: 1 } } }],
    ["an array inside an array item", { a: [{ b: { "#text": ["x"] } }] }],
    ["a top-level object", { "#text": { x: 1 } }],
  ])("rejects %s as #text with a coded 400", (_label, data) => {
    let error: unknown;
    try {
      assertScalarTextNodes(data);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(InputValidationError);
    expect(error).toMatchObject({ statusCode: 400, code: "INVALID_TEXT_NODE" });
  });

  it.each([
    ["text", { a: { "@_id": "1", "#text": "hi" } }],
    ["a number", { a: { "#text": 3 } }],
    ["a boolean", { a: { "#text": false } }],
    ["null", { a: { "#text": null } }],
    ["no text at all", { a: [{ b: 1 }, { c: [2, 3] }] }],
  ])("accepts %s", (_label, data) => {
    expect(() => assertScalarTextNodes(data)).not.toThrow();
  });
});
