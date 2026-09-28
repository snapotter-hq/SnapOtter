import { describe, expect, it } from "vitest";
import { pickBatchFileNotes } from "../../../apps/api/src/lib/batch-file-notes.js";

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
