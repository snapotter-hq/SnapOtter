import { FILE_NOTES_ALL_FILES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  compactFileNotes,
  pickBatchFileNotes,
} from "../../../apps/api/src/lib/batch-file-notes.js";

// #1292: a batch reports a note only for a file with something to warn about,
// so X-File-Notes stays small however many files the batch has.
describe("pickBatchFileNotes", () => {
  it("keeps a resize with its target", () => {
    expect(
      pickBatchFileNotes({ targetKb: 20, resizedTo: { width: 800, height: 600 }, jobId: "x" }),
    ).toEqual({ targetKb: 20, resizedTo: { width: 800, height: 600 } });
  });

  it("keeps a missed target with its target", () => {
    expect(pickBatchFileNotes({ targetKb: 100, targetMet: false })).toEqual({
      targetKb: 100,
      targetMet: false,
    });
  });

  it.each([
    ["a met target", { targetKb: 100, targetMet: true }],
    ["a target alone", { targetKb: 20 }],
    ["an unrelated result", { jobId: "x", downloadUrl: "/d" }],
    ["an empty result", {}],
    ["no result", null],
    ["a resize missing a dimension", { targetKb: 20, resizedTo: { width: 800 } }],
    ["a resize with string dimensions", { resizedTo: { width: "800", height: "600" } }],
    ["a truthy non-boolean miss", { targetKb: 100, targetMet: "false" }],
  ])("gives nothing for %s", (_label, result) => {
    expect(pickBatchFileNotes(result as Record<string, unknown> | null)).toBeUndefined();
  });

  it("drops a non-numeric target but keeps the warning", () => {
    expect(pickBatchFileNotes({ targetKb: "100", targetMet: false })).toEqual({
      targetMet: false,
    });
  });
});

// #1303: one note every file shares goes out once, keeping X-File-Notes small.
describe("compactFileNotes", () => {
  const skip = { deepEnhanceSkipped: "unavailable" as const };
  const results = { "0": "a.png", "1": "b.png", "2": "c.png" };

  it("sends one entry when every file with a result has the same note", () => {
    expect(compactFileNotes({ "0": skip, "1": { ...skip }, "2": skip }, results)).toEqual({
      [FILE_NOTES_ALL_FILES]: skip,
    });
  });

  it.each([
    ["one file lacks the note", { "0": skip, "2": skip }],
    [
      "the notes differ",
      { "0": skip, "1": { deepEnhanceSkipped: "animated" as const }, "2": skip },
    ],
    ["no file has a note", {}],
  ])("keeps the per-file map when %s", (_label, notes) => {
    expect(compactFileNotes(notes, results)).toBe(notes);
  });

  it("leaves a single-file batch alone", () => {
    const notes = { "0": skip };
    expect(compactFileNotes(notes, { "0": "a.png" })).toBe(notes);
  });
});

// #1303: a batch says which files skipped Deep Enhance, as a single run does (#950).
describe("pickBatchFileNotes: skipped Deep Enhance", () => {
  it.each(["failed", "unavailable", "animated"])("keeps a '%s' skip on its own", (reason) => {
    expect(pickBatchFileNotes({ deepEnhanceSkipped: reason, jobId: "x" })).toEqual({
      deepEnhanceSkipped: reason,
    });
  });

  it("drops a reason it doesn't know", () => {
    expect(pickBatchFileNotes({ deepEnhanceSkipped: "sideways" })).toBeUndefined();
  });

  it("keeps a skip alongside a resize", () => {
    expect(
      pickBatchFileNotes({
        deepEnhanceSkipped: "failed",
        targetKb: 20,
        resizedTo: { width: 10, height: 10 },
      }),
    ).toEqual({ deepEnhanceSkipped: "failed", targetKb: 20, resizedTo: { width: 10, height: 10 } });
  });
});
