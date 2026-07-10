import {
  isSafeMessageError,
  isToolInputError,
  markToolInputError,
  SafeError,
  ToolInputError,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("SafeError", () => {
  it("carries a constant message, kind, and code", () => {
    const err = new SafeError("Storage directory is not writable", {
      kind: "operational",
      code: "EACCES",
      statusCode: 503,
    });
    expect(err.message).toBe("Storage directory is not writable");
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("EACCES");
    expect(err.statusCode).toBe(503);
    expect(isSafeMessageError(err)).toBe(true);
  });
  it("defaults kind to operational and detects via marker not instanceof", () => {
    const copy = Object.assign(new Error("x"), { isSafeMessage: true, message: "x" });
    expect(new SafeError("m").kind).toBe("operational");
    expect(isSafeMessageError(copy)).toBe(true);
    expect(isSafeMessageError(new Error("m"))).toBe(false);
    expect(isSafeMessageError(null)).toBe(false);
  });
  it("rejects a marked plain object that is not an Error", () => {
    expect(isSafeMessageError({ isSafeMessage: true })).toBe(false);
  });
  it("leaves code and statusCode undefined by default", () => {
    const s = new SafeError("m");
    expect(s.code).toBeUndefined();
    expect(s.statusCode).toBeUndefined();
  });
  it("threads cause through to the Error constructor", () => {
    const inner = new Error("inner");
    expect(new SafeError("m", { cause: inner }).cause).toBe(inner);
  });
});

describe("ToolInputError", () => {
  it("is marked and 400-shaped", () => {
    const err = new ToolInputError("Column 2 must be numeric");
    expect(err.statusCode).toBe(400);
    expect(isToolInputError(err)).toBe(true);
  });
  it("markToolInputError flags a foreign error without changing its class", () => {
    const raw = new Error("ffmpeg: received no packets");
    expect(isToolInputError(raw)).toBe(false);
    markToolInputError(raw);
    expect(isToolInputError(raw)).toBe(true);
    expect(raw).toBeInstanceOf(Error);
  });
  it("rejects non-Error values", () => {
    expect(isToolInputError(null)).toBe(false);
    expect(isToolInputError("x")).toBe(false);
  });
  it("markToolInputError returns the same reference", () => {
    const e = new Error("y");
    expect(markToolInputError(e)).toBe(e);
  });
});
