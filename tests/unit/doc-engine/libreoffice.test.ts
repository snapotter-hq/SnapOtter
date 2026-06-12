import { parseConvertTarget } from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";

describe("parseConvertTarget", () => {
  it("returns a bare extension unchanged", () => {
    const result = parseConvertTarget("pdf");
    expect(result).toEqual({ ext: "pdf", convertTo: "pdf" });
  });

  it("splits on the first colon for qualified filter targets", () => {
    const result = parseConvertTarget("docx:MS Word 2007 XML");
    expect(result).toEqual({ ext: "docx", convertTo: "docx:MS Word 2007 XML" });
  });

  it("handles filter names with colons after the first", () => {
    const result = parseConvertTarget("csv:Text - txt - csv (StarCalc):44,34,76,1");
    expect(result).toEqual({
      ext: "csv",
      convertTo: "csv:Text - txt - csv (StarCalc):44,34,76,1",
    });
  });

  it("handles single-character extensions", () => {
    const result = parseConvertTarget("a:SomeFilter");
    expect(result).toEqual({ ext: "a", convertTo: "a:SomeFilter" });
  });
});
