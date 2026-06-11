import { parseProgressBlock } from "@snapotter/media-engine";
import { describe, expect, it } from "vitest";

describe("parseProgressBlock", () => {
  it("parses an ffmpeg -progress key=value block", () => {
    const block = [
      "frame=120",
      "fps=24.0",
      "bitrate= 256.0kbits/s",
      "total_size=98304",
      "out_time_us=5000000",
      "out_time=00:00:05.000000",
      "speed=1.01x",
      "progress=continue",
    ].join("\n");
    const p = parseProgressBlock(block);
    expect(p.outTimeMs).toBe(5000);
    expect(p.done).toBe(false);
  });

  it("flags progress=end", () => {
    const p = parseProgressBlock("out_time_us=1000000\nprogress=end");
    expect(p.done).toBe(true);
    expect(p.outTimeMs).toBe(1000);
  });

  it("tolerates missing fields", () => {
    const p = parseProgressBlock("frame=1\nprogress=continue");
    expect(p.outTimeMs).toBeNull();
  });
});
