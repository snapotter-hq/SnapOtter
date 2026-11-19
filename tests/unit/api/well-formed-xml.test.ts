/**
 * fast-xml-parser's parse() is lenient: it returns partial data for an
 * unclosed root or mismatched tags, so json-xml and xml-to-csv answered 200
 * with silently truncated output (#4379). assertWellFormedXml runs the
 * library's validator first and turns its error into a 400.
 */
import { describe, expect, it } from "vitest";
import { assertWellFormedXml } from "../../../apps/api/src/lib/well-formed-xml.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";

function failure(xml: string): InputValidationError {
  try {
    assertWellFormedXml(xml);
  } catch (err) {
    if (err instanceof InputValidationError) return err;
    throw err;
  }
  throw new Error("expected assertWellFormedXml to throw");
}

describe("assertWellFormedXml", () => {
  it("accepts a well-formed document with a declaration, comments, CDATA and entities", () => {
    expect(() =>
      assertWellFormedXml(
        '<?xml version="1.0"?><!-- c --><a x="1"><b><![CDATA[<x>]]></b>&amp;&#169;</a>',
      ),
    ).not.toThrow();
  });

  it("rejects an unclosed root with the parser's message and position", () => {
    const err = failure("<people><person><name>Ada</name></person>");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("XML parse failed: Unclosed tag 'people'. (line 1, column 1)");
  });

  it("rejects a mismatched closing tag", () => {
    expect(failure("<a><b></a>").message).toMatch(/^XML parse failed: Expected closing tag 'b'/);
  });

  it("rejects text after the root element", () => {
    expect(failure("<a>1</a>garbage").message).toMatch(/Extra text at the end/);
  });

  it("rejects an empty document", () => {
    expect(failure("").message).toBe("XML parse failed: Start tag expected. (line 1)");
  });
});
