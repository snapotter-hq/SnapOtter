import { describe, expect, it } from "vitest";
import { buildAtempoChain } from "../../../apps/api/src/lib/media-tool.js";

describe("buildAtempoChain", () => {
  it("returns a single atempo for factor >= 0.5", () => {
    expect(buildAtempoChain(2)).toBe("atempo=2");
    expect(buildAtempoChain(0.5)).toBe("atempo=0.5");
    expect(buildAtempoChain(1)).toBe("atempo=1");
  });

  it("chains factors of 0.5 for values below 0.5", () => {
    expect(buildAtempoChain(0.25)).toBe("atempo=0.5,atempo=0.5");
  });

  it("chains correctly for very small factors", () => {
    // 0.125 = 0.5 * 0.5 * 0.5
    expect(buildAtempoChain(0.125)).toBe("atempo=0.5,atempo=0.5,atempo=0.5");
  });
});
