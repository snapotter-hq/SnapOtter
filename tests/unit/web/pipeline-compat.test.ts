import { describe, expect, it } from "vitest";
import { computeStepWarnings } from "@/lib/pipeline-compat";

describe("computeStepWarnings", () => {
  it("flags an image->video step mismatch", () => {
    const w = computeStepWarnings(["resize", "trim-video"], "image");
    expect(w[0]).toBeNull();
    expect(w[1]).toEqual({ expects: "video", receives: "image" });
  });
  it("does not flag a valid cross-modality chain", () => {
    const w = computeStepWarnings(["extract-audio", "volume-adjust"], "video");
    expect(w[0]).toBeNull();
    expect(w[1]).toBeNull();
  });
  it("flags the first step against the uploaded file modality", () => {
    const w = computeStepWarnings(["resize"], "video");
    expect(w[0]).toEqual({ expects: "image", receives: "video" });
  });
  it("does not flag the first step when no file is uploaded yet", () => {
    expect(computeStepWarnings(["resize"], null)[0]).toBeNull();
  });
  // #4932: the builder warned about chains the server's step check accepts.
  it("does not flag a step whose tool also takes the previous step's output", () => {
    // replace-audio lists video first but also takes audio.
    expect(computeStepWarnings(["convert-audio", "replace-audio"], "audio")[1]).toBeNull();
  });
  it("treats document and file tools as one family", () => {
    expect(computeStepWarnings(["csv-excel", "excel-to-pdf"], "file")[1]).toBeNull();
    expect(computeStepWarnings(["excel-to-csv", "csv-json"], "document")[1]).toBeNull();
    expect(computeStepWarnings(["csv-json", "trim-audio"], "file")[1]).toEqual({
      expects: "audio",
      receives: "file",
    });
  });
  it("does not flag a step whose tool accepts any input", () => {
    expect(computeStepWarnings(["resize", "create-zip"], "image")[1]).toBeNull();
  });
});
