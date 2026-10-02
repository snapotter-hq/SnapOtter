// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

// The fflate chunk failing to load, as it can after a deploy. Every import of
// it in this file fails; the hooks' tests cover the real unpack. fflate only
// resolves from the web workspace, so the bare name would mock nothing.
vi.mock("../../../apps/web/node_modules/fflate", () => {
  throw new Error("chunk failed to load");
});

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  captureHandledError: vi.fn(async () => null),
}));

import { captureHandledError } from "@/lib/analytics";
import { parseFileResultsHeader, unpackBatchZip } from "@/lib/batch-zip";

afterEach(() => {
  vi.mocked(captureHandledError).mockClear();
});

describe("unpackBatchZip (#1805)", () => {
  it("throws when the unzip code won't load, instead of reporting a bad answer", async () => {
    // vitest wraps the factory's throw in its own message; a bad ZIP would
    // resolve to null, so any rejection here is the import's.
    await expect(unpackBatchZip(new Blob(["zip"]), { status: 200 })).rejects.toThrow();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });
});

describe("parseFileResultsHeader (#1805)", () => {
  it("reads a good header", () => {
    const header = encodeURIComponent(JSON.stringify({ "0": "a.png" }));
    expect(parseFileResultsHeader(header, {})).toEqual({ "0": "a.png" });
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("reads a missing header as no results without a report", () => {
    expect(parseFileResultsHeader(null, {})).toEqual({});
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("keeps the header out of the console line and the report", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const header = encodeURIComponent('{"0":"Jane Doe passport.png"');
      expect(parseFileResultsHeader(header, { status: 200, toolId: "resize" })).toEqual({});

      expect(consoleError).toHaveBeenCalledWith("Ignoring unreadable X-File-Results", {
        length: header.length,
      });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Jane");
      const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect(error.message).toBe("Batch result file map could not be read");
      expect(error.cause).toBeUndefined();
      expect(tags).toEqual({ error_class: "operational", tool_id: "resize" });
    } finally {
      consoleError.mockRestore();
    }
  });
});
