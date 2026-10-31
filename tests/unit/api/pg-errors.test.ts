import { describe, expect, it } from "vitest";
import {
  isUniqueViolation,
  uniqueViolationConstraint,
} from "../../../apps/api/src/lib/pg-errors.js";

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

describe("uniqueViolationConstraint", () => {
  it("reads the constraint name off a drizzle-wrapped 23505", () => {
    const pgErr = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "users_auth_provider_external_id_unique",
    });
    const wrapped = new Error("Failed query: update ...", { cause: pgErr });
    expect(uniqueViolationConstraint(wrapped)).toBe("users_auth_provider_external_id_unique");
  });

  it("ignores a constraint carried by an error that isn't a unique violation", () => {
    expect(uniqueViolationConstraint({ code: "23503", constraint: "fk_x" })).toBeUndefined();
  });

  it("is undefined for a 23505 without a constraint name and for non-errors", () => {
    expect(uniqueViolationConstraint({ code: "23505" })).toBeUndefined();
    expect(uniqueViolationConstraint(null)).toBeUndefined();
  });
});
