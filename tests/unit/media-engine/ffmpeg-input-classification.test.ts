import { describe, expect, it } from "vitest";
import { markIfInputError } from "../../../packages/media-engine/src/ffmpeg.js";

type MaybeMarked = Error & { isToolInputError?: unknown };

describe("markIfInputError", () => {
  it("marks the error when stderr reports no packets received", () => {
    const err = new Error("ffmpeg exited 1: tail of stderr");
    const result = markIfInputError(
      err,
      "Finishing stream without any data written to it.\nOutput received no packets",
    ) as MaybeMarked;
    expect(result).toBe(err);
    expect(result.isToolInputError).toBe(true);
    expect(result.message).toBe("ffmpeg exited 1: tail of stderr");
  });

  it("marks the other known input-failure stderr shapes, case-insensitively", () => {
    const shapes = [
      "input.mp4: Invalid data found when processing input",
      "Could not find codec parameters for stream 0",
      "[mov,mp4,m4a,3gp,3g2,mj2] moov atom not found",
      "OUTPUT RECEIVED NO PACKETS",
    ];
    for (const stderr of shapes) {
      const marked = markIfInputError(new Error("ffmpeg exited 1: x"), stderr) as MaybeMarked;
      expect(marked.isToolInputError, stderr).toBe(true);
    }
  });

  it("leaves unrelated stderr unmarked", () => {
    const err = markIfInputError(
      new Error("ffmpeg exited 1: tail of stderr"),
      "Error while opening encoder: some libx264 build issue",
    ) as MaybeMarked;
    expect(err.isToolInputError).toBeUndefined();
    expect(err.message).toBe("ffmpeg exited 1: tail of stderr");
  });

  it("leaves empty stderr unmarked", () => {
    const err = markIfInputError(new Error("ffmpeg exited 1: "), "") as MaybeMarked;
    expect(err.isToolInputError).toBeUndefined();
  });
});
