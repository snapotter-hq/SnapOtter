import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "../../../apps/api/src/lib/pg-errors.js";

describe("isUniqueViolation", () => {
  it("matches a bare pg error carrying code 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches a drizzle-wrapped error with the pg error on the cause chain", () => {
    const pgErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    const wrapped = new Error("Failed query: update ...", { cause: pgErr });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("rejects other SQLSTATEs, non-errors, and codeless errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });

  it("gives up on a cyclic cause chain instead of spinning", () => {
    const a: { code: string; cause?: unknown } = { code: "xx" };
    a.cause = a;
    expect(isUniqueViolation(a)).toBe(false);
  });
});
