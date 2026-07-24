import { describe, expect, it } from "vitest";
import { parseProgressBlock } from "../src/progress.js";

describe("parseProgressBlock: out_time_us path", () => {
  it("rounds microseconds to milliseconds (1500us -> 2ms)", () => {
    const p = parseProgressBlock("out_time_us=1500\nprogress=continue");
    expect(p.outTimeMs).toBe(2);
  });

  it("rounds down below the .5 boundary (2499us -> 2ms)", () => {
    expect(parseProgressBlock("out_time_us=2499\nprogress=continue").outTimeMs).toBe(2);
  });

  it("rounds up at the .5 boundary (2500us -> 3ms)", () => {
    expect(parseProgressBlock("out_time_us=2500\nprogress=continue").outTimeMs).toBe(3);
  });

  it("rounds 500us up to 1ms", () => {
    expect(parseProgressBlock("out_time_us=500\nprogress=continue").outTimeMs).toBe(1);
  });

  it("rounds 499us down to 0ms (not null)", () => {
    expect(parseProgressBlock("out_time_us=499\nprogress=continue").outTimeMs).toBe(0);
  });

  it("divides by 1000, not 1_000_000 (1_000_000us -> 1000ms)", () => {
    expect(parseProgressBlock("out_time_us=1000000\nprogress=continue").outTimeMs).toBe(1000);
  });

  it("prefers out_time_us over out_time_ms when both are present", () => {
    // us=1_000_000 -> 1000ms; if it wrongly used ms=999_000 it would be 999.
    const p = parseProgressBlock("out_time_us=1000000\nout_time_ms=999000\nprogress=continue");
    expect(p.outTimeMs).toBe(1000);
  });
});

describe("parseProgressBlock: out_time_ms path (microseconds despite the name)", () => {
  it("treats out_time_ms as microseconds (3_000_000 -> 3000ms)", () => {
    expect(parseProgressBlock("out_time_ms=3000000\nprogress=end").outTimeMs).toBe(3000);
  });

  it("rounds the out_time_ms path too (1500 -> 2)", () => {
    expect(parseProgressBlock("out_time_ms=1500\nprogress=continue").outTimeMs).toBe(2);
  });

  it("uses out_time_ms only when out_time_us is absent", () => {
    // Presence of out_time_us (even NaN) takes the us branch, which yields null here.
    const p = parseProgressBlock("out_time_us=notanumber\nout_time_ms=5000000\nprogress=continue");
    expect(p.outTimeMs).toBeNull();
  });
});

describe("parseProgressBlock: non-finite and missing values", () => {
  it("returns null for a non-numeric out_time_us", () => {
    expect(parseProgressBlock("out_time_us=abc\nprogress=continue").outTimeMs).toBeNull();
  });

  it("returns null for Infinity out_time_us", () => {
    expect(parseProgressBlock("out_time_us=Infinity\nprogress=continue").outTimeMs).toBeNull();
  });

  it("returns null for a non-numeric out_time_ms", () => {
    expect(parseProgressBlock("out_time_ms=NaN\nprogress=continue").outTimeMs).toBeNull();
  });

  it("returns null when neither time key is present", () => {
    expect(parseProgressBlock("frame=10\nprogress=continue").outTimeMs).toBeNull();
  });
});

describe("parseProgressBlock: done flag", () => {
  it("is true only when progress === 'end'", () => {
    expect(parseProgressBlock("progress=end").done).toBe(true);
  });

  it("is false for progress=continue", () => {
    expect(parseProgressBlock("progress=continue").done).toBe(false);
  });

  it("is false for any other progress value", () => {
    expect(parseProgressBlock("progress=ended").done).toBe(false);
    expect(parseProgressBlock("progress=START").done).toBe(false);
  });

  it("is false when there is no progress key at all", () => {
    expect(parseProgressBlock("frame=10").done).toBe(false);
  });
});

describe("parseProgressBlock: key/value splitting (idx > 0)", () => {
  it("skips a line whose '=' is at position 0", () => {
    const p = parseProgressBlock("=weird\nkey=val\nprogress=end");
    expect(p.raw).toEqual({ key: "val", progress: "end" });
    expect(Object.keys(p.raw)).not.toContain("");
  });

  it("skips a line with no '=' at all", () => {
    const p = parseProgressBlock("nolineeq\nfoo=bar\nprogress=end");
    expect(p.raw).toEqual({ foo: "bar", progress: "end" });
    expect(Object.keys(p.raw)).not.toContain("nolineeq");
  });

  it("splits only on the FIRST '=' so values may contain '='", () => {
    const p = parseProgressBlock("k=a=b\nprogress=continue");
    expect(p.raw.k).toBe("a=b");
  });
});

describe("parseProgressBlock: raw carries trimmed key/value", () => {
  it("trims whitespace around both key and value", () => {
    const p = parseProgressBlock("  frame  =  10  \nprogress=continue");
    expect(p.raw).toEqual({ frame: "10", progress: "continue" });
  });

  it("stores raw values as strings, not numbers", () => {
    const p = parseProgressBlock("out_time_us=1500\nprogress=continue");
    expect(p.raw.out_time_us).toBe("1500");
    expect(typeof p.raw.out_time_us).toBe("string");
  });

  it("returns an empty raw map for an empty block", () => {
    const p = parseProgressBlock("");
    expect(p.raw).toEqual({});
    expect(p.outTimeMs).toBeNull();
    expect(p.done).toBe(false);
  });
});
