import { describe, expect, it } from "vitest";
import { mimeForExt } from "../../../packages/shared/src/file-mime.js";

describe("mimeForExt", () => {
  it.each([
    ["pdf", "application/pdf"],
    ["mp4", "video/mp4"],
    ["aiff", "audio/aiff"],
    ["aif", "audio/aiff"],
    ["vtt", "text/vtt"],
  ])("maps %s to %s", (ext, expected) => {
    expect(mimeForExt(ext)).toBe(expected);
  });

  it("falls back to the image table", () => {
    expect(mimeForExt("png")).toBe("image/png");
    expect(mimeForExt("heic")).toBe("image/heic");
  });

  it("answers octet-stream for unknown and inherited keys", () => {
    expect(mimeForExt("xyz")).toBe("application/octet-stream");
    expect(mimeForExt("")).toBe("application/octet-stream");
    expect(mimeForExt("constructor")).toBe("application/octet-stream");
    expect(mimeForExt("toString")).toBe("application/octet-stream");
  });
});
