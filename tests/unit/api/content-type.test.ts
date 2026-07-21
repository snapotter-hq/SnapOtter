import { describe, expect, it } from "vitest";
import { getContentType } from "../../../apps/api/src/routes/files.js";

describe("getContentType charset", () => {
  it("adds charset=utf-8 to text types so non-Latin scripts render inline", () => {
    // Without a charset a browser can sniff a legacy encoding and mojibake
    // UTF-8 Arabic when viewing an extracted .txt inline (#589).
    expect(getContentType("txt")).toBe("text/plain; charset=utf-8");
    expect(getContentType("md")).toBe("text/markdown; charset=utf-8");
    expect(getContentType("csv")).toBe("text/csv; charset=utf-8");
    expect(getContentType("vtt")).toBe("text/vtt; charset=utf-8");
  });

  it("leaves binary and application types unchanged", () => {
    expect(getContentType("pdf")).toBe("application/pdf");
    expect(getContentType("png")).toBe("image/png");
    expect(getContentType("json")).toBe("application/json");
    expect(getContentType("unknown-ext")).toBe("application/octet-stream");
  });
});
