import { describe, expect, it } from "vitest";
import {
  inputHandlerFor,
  inputHandlerForInput,
} from "../../../apps/api/src/modality/input-handler.js";
import { MediaInputHandler } from "../../../apps/api/src/modality/media-input.js";

const SRT = Buffer.from("1\n00:00:00,000 --> 00:00:01,000\nHello\n");

describe("inputHandlerForInput (#5165)", () => {
  it("falls back to the modality handler when the tool declares no inputKinds", () => {
    expect(inputHandlerForInput("video", undefined)).toBe(inputHandlerFor("video"));
    expect(inputHandlerForInput("document", [])).toBe(inputHandlerFor("document"));
  });

  it("uses the declared kind over the modality", async () => {
    const handler = inputHandlerForInput("video", ["subtitle"]);
    expect(handler).toBeInstanceOf(MediaInputHandler);
    expect(handler).not.toBe(inputHandlerFor("video"));
    // Subtitles skip ffprobe and never write to scratchDir; the video handler would.
    const prepared = await handler.prepare(SRT, "a.srt", { scratchDir: "/nonexistent" });
    expect(prepared.filename).toBe("a.srt");
  });

  it("routes image slots through the full image handler", () => {
    expect(inputHandlerForInput("video", ["image"])).toBe(inputHandlerFor("image"));
  });

  it("picks the kind by position and repeats the last one", () => {
    const kinds = ["video", "subtitle"] as const;
    expect(inputHandlerForInput("video", kinds, 0)).toBe(inputHandlerFor("video"));
    const subtitle = inputHandlerForInput("video", kinds, 1);
    expect(subtitle).not.toBe(inputHandlerFor("video"));
    expect(inputHandlerForInput("video", kinds, 5)).toBe(subtitle);
    expect(inputHandlerForInput("video", ["video", "audio"], 1)).toBe(inputHandlerFor("audio"));
  });
});
