// tests/unit/scripts/i18n/claude.test.ts
import { describe, expect, it, vi } from "vitest";
import { makeTranslator } from "../../../../scripts/i18n/lib/claude.mjs";

describe("makeTranslator", () => {
  it("masks input, sends one call per unit, restores tokens, returns id->text", async () => {
    const send = vi.fn(async ({ text }) => `DE(${text})`);
    const translate = makeTranslator({ send });
    const units = [
      { id: "a", sourceText: "Hello `code`", kind: "markdown" },
      { id: "b", sourceText: "See {n} files", kind: "markdown" },
    ];
    const out = await translate(units, "de");
    // Tokens were restored, so the code span and placeholder survive verbatim.
    expect(out.get("a")).toContain("`code`");
    expect(out.get("b")).toContain("{n}");
    expect(send).toHaveBeenCalledTimes(2);
    // The masked text sent to the model must NOT contain the raw code span.
    expect(send.mock.calls[0][0].text).not.toContain("`code`");
  });
});
