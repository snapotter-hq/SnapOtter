import { qpdfAvailable, sofficeAvailable } from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";

describe("doc-engine binary resolution", () => {
  it("availability checks return booleans without throwing", () => {
    expect(typeof qpdfAvailable()).toBe("boolean");
    expect(typeof sofficeAvailable()).toBe("boolean");
  });
});
