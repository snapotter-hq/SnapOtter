import { beforeEach, describe, expect, it, vi } from "vitest";

const runDocsScript = vi.fn();
vi.mock("@snapotter/ai", () => ({
  runDocsScript: (...args: unknown[]) => runDocsScript(...args),
}));

import { isToolInputError } from "@snapotter/shared";
import { convertFontPy } from "../../../packages/doc-engine/src/python-docs.js";

beforeEach(() => runDocsScript.mockReset());

describe("convertFontPy", () => {
  it("passes paths and format to font_convert with the caller's signal", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true, "format": "otf"}');
    const signal = new AbortController().signal;
    await convertFontPy("/in.ttf", "/out.otf", "otf", { signal });
    expect(runDocsScript).toHaveBeenCalledWith(
      "font_convert",
      { path: "/in.ttf", out: "/out.otf", format: "otf" },
      { signal },
    );
  });

  it("turns inputError into a ToolInputError carrying the script's message", async () => {
    runDocsScript.mockResolvedValueOnce(
      '{"inputError": "Font collections (.ttc) aren\'t supported. Extract a single font first."}',
    );
    const err = await convertFontPy("/in.ttf", "/out.ttf", "ttf").catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect(err).toMatchObject({
      message: expect.stringContaining("collections"),
      code: "FONT_UNSUPPORTED",
    });
  });

  it("keeps a script error a plain failure, not the user's fault", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "boom"}');
    const err = await convertFontPy("/in.ttf", "/out.ttf", "ttf").catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(false);
    expect(err).toMatchObject({ message: "font_convert failed: boom" });
  });

  it("refuses a reply with no ok flag rather than claiming success", async () => {
    runDocsScript.mockResolvedValueOnce("{}");
    await expect(convertFontPy("/in.ttf", "/out.ttf", "ttf")).rejects.toThrow(
      /font_convert failed/,
    );
  });
});
