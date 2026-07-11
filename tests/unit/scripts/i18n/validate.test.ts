// tests/unit/scripts/i18n/validate.test.ts
import { describe, expect, it } from "vitest";
import { validate } from "../../../../scripts/i18n/lib/validate.mjs";

const SRC = "```\ncode\n```\nUse `x` and [t](/u) with {name}.";

describe("validate", () => {
  it("passes when structure is preserved", () => {
    const translated = "```\ncode\n```\nBenutze `x` und [Text](/u) mit {name}.";
    expect(validate(SRC, translated)).toEqual({ ok: true, errors: [] });
  });

  it("fails when a code fence is dropped", () => {
    const translated = "Benutze `x` und [Text](/u) mit {name}.";
    const result = validate(SRC, translated);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/fences/);
  });

  it("fails when a placeholder count changes", () => {
    const translated = "```\ncode\n```\nBenutze `x` und [Text](/u) mit {name} {name}.";
    expect(validate(SRC, translated).ok).toBe(false);
  });

  it("fails when a mask token leaked into the output", () => {
    const translated = `${SRC}⸤I18N0⸥`;
    expect(validate(SRC, translated).ok).toBe(false);
  });
});
