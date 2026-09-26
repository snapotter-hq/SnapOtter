import { describe, expect, it } from "vitest";
import {
  BYTES_PER_KB,
  formatTargetKb,
  kbToBytes,
} from "../../../packages/shared/src/target-size.js";

describe("target-size units (#1272)", () => {
  it("counts a KB as 1000 bytes, the way upload forms do", () => {
    expect(BYTES_PER_KB).toBe(1000);
    expect(kbToBytes(20)).toBe(20_000);
  });

  it("floors fractional targets so the byte budget never overshoots", () => {
    expect(kbToBytes(0.2)).toBe(200);
    expect(kbToBytes(20.0005)).toBe(20_000);
  });

  it("formats a byte budget back as KB without float noise", () => {
    expect(formatTargetKb(20_000)).toBe("20 KB");
    expect(formatTargetKb(250)).toBe("0.25 KB");
    expect(formatTargetKb(1_500)).toBe("1.5 KB");
  });
});
