import { describe, expect, it } from "vitest";
import { audioOutputFor } from "../../../apps/api/src/lib/media-tool.js";

describe("audioOutputFor", () => {
  it("normalises uppercase extensions", () => {
    const out = audioOutputFor(".MP3");
    expect(out.ext).toBe(".mp3");
    expect(out.contentType).toBe("audio/mpeg");
    expect(out.encodeArgs).toContain("libmp3lame");
  });

  it("falls back to mp3 for decode-only formats", () => {
    const out = audioOutputFor(".wma");
    expect(out.ext).toBe(".mp3");
    expect(out.contentType).toBe("audio/mpeg");
  });

  it("maps .aac input to .m4a output", () => {
    const out = audioOutputFor(".aac");
    expect(out.ext).toBe(".m4a");
    expect(out.contentType).toBe("audio/mp4");
    expect(out.encodeArgs).toContain("aac");
  });
});
