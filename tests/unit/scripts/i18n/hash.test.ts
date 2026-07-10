// tests/unit/scripts/i18n/hash.test.ts
import { describe, expect, it } from "vitest";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";

describe("hash", () => {
  it("is stable and 12 hex chars", () => {
    expect(hash("hello world")).toMatch(/^[0-9a-f]{12}$/);
    expect(hash("hello world")).toBe(hash("hello world"));
  });

  it("changes when source changes", () => {
    expect(hash("a")).not.toBe(hash("b"));
  });

  it("normalizes CRLF to LF so line-ending churn does not re-translate", () => {
    expect(hash("line1\r\nline2")).toBe(hash("line1\nline2"));
  });
});
