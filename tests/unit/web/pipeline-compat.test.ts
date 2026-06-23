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
});
