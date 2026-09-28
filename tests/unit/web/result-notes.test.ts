import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asNotesMap,
  hasResultWarning,
  parseFileNotesHeader,
  pickResultNotes,
} from "@/lib/result-notes";

afterEach(() => {
  vi.restoreAllMocks();
});

// #1292: the notes a result carries beyond the file itself.
describe("pickResultNotes", () => {
  it("keeps resizedTo, targetKb and targetMet and nothing else", () => {
    expect(
      pickResultNotes({
        jobId: "x",
        downloadUrl: "/d",
        targetKb: 20,
        targetMet: true,
        resizedTo: { width: 800, height: 600 },
      }),
    ).toEqual({ targetKb: 20, targetMet: true, resizedTo: { width: 800, height: 600 } });
  });

  it.each([
    ["null", null],
    ["a string", "notes"],
    ["an empty object", {}],
    ["only unrelated keys", { jobId: "x" }],
    ["malformed fields", { targetKb: "20", targetMet: "false", resizedTo: { width: 1 } }],
  ])("gives null for %s", (_label, source) => {
    expect(pickResultNotes(source)).toBeNull();
  });

  // #1303: Image Enhancement's skipped Deep Enhance rides the same notes.
  it.each(["failed", "unavailable", "animated"])("keeps a '%s' Deep Enhance skip", (reason) => {
    expect(pickResultNotes({ jobId: "x", deepEnhanceSkipped: reason })).toEqual({
      deepEnhanceSkipped: reason,
    });
  });

  it("drops a Deep Enhance reason it doesn't know", () => {
    expect(pickResultNotes({ deepEnhanceSkipped: "sideways" })).toBeNull();
  });
});

describe("hasResultWarning", () => {
  it("flags a resize or a missed target, not a met one", () => {
    expect(hasResultWarning({ resizedTo: { width: 1, height: 1 } })).toBe(true);
    expect(hasResultWarning({ targetMet: false })).toBe(true);
    expect(hasResultWarning({ targetKb: 20, targetMet: true })).toBe(false);
    expect(hasResultWarning(null)).toBe(false);
  });

  it("leaves a skipped Deep Enhance to the panel's summary line (#1303)", () => {
    expect(hasResultWarning({ deepEnhanceSkipped: "failed" })).toBe(false);
  });
});

describe("parseFileNotesHeader", () => {
  it("decodes the header's map", () => {
    const map = { "1": { targetMet: false, targetKb: 100 } };
    expect(parseFileNotesHeader(encodeURIComponent(JSON.stringify(map)))).toEqual(map);
  });

  it("treats a missing header (an older server) as no notes, quietly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseFileNotesHeader(null)).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["unparseable JSON", "%7Bnot-json"],
    ["a null", encodeURIComponent("null")],
    ["an array", encodeURIComponent("[1,2]")],
    ["a bad escape", "%E0%A4%A"],
  ])("logs and ignores %s instead of failing the batch", (_label, header) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseFileNotesHeader(header)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("asNotesMap", () => {
  it("passes an object through and replaces anything else with an empty map", () => {
    expect(asNotesMap({ "0": {} })).toEqual({ "0": {} });
    expect(asNotesMap(null)).toEqual({});
    expect(asNotesMap(undefined)).toEqual({});
    expect(asNotesMap([])).toEqual({});
    expect(asNotesMap("x")).toEqual({});
  });
});
