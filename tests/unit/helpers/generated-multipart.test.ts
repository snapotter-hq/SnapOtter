import { describe, expect, it } from "vitest";
import { buildGeneratedMultipartFields } from "../../helpers/generated-multipart.js";

const primary = { filename: "primary.png", content: Buffer.from("primary") };
const image = { filename: "companion.png", content: Buffer.from("image") };
const audio = { filename: "companion.wav", content: Buffer.from("audio") };
const subtitle = { filename: "companion.srt", content: Buffer.from("subtitle") };

describe("generated multipart payloads", () => {
  it.each([
    "sprite-sheet",
    "stitch",
    "images-to-video",
    "merge-audio",
    "compare",
    "find-duplicates",
  ])("sends two ordinary file parts for %s", (toolId) => {
    const fields = buildGeneratedMultipartFields({
      toolId,
      primary,
      settings: {},
      companions: { image, audio, subtitle },
    });

    expect(fields.filter(({ name }) => name === "file")).toHaveLength(2);
  });

  it("uses named watermark and overlay parts for custom image routes", () => {
    expect(
      buildGeneratedMultipartFields({
        toolId: "watermark-image",
        primary,
        settings: {},
        companions: { image, audio, subtitle },
      }).map(({ name }) => name),
    ).toEqual(["file", "watermark", "settings"]);
    expect(
      buildGeneratedMultipartFields({
        toolId: "compose",
        primary,
        settings: {},
        companions: { image, audio, subtitle },
      }).map(({ name }) => name),
    ).toEqual(["file", "overlay", "settings"]);
  });

  it("builds valid mixed-kind tuples", () => {
    const subtitleFields = buildGeneratedMultipartFields({
      toolId: "burn-subtitles",
      primary: { filename: "video.mp4", content: Buffer.from("video") },
      settings: {},
      companions: { image, audio, subtitle },
    });
    expect(
      subtitleFields.filter(({ name }) => name === "file").map(({ filename }) => filename),
    ).toEqual(["video.mp4", "companion.srt"]);

    const audioFields = buildGeneratedMultipartFields({
      toolId: "replace-audio",
      primary: { filename: "video.mp4", content: Buffer.from("video") },
      settings: {},
      companions: { image, audio, subtitle },
    });
    expect(
      audioFields.filter(({ name }) => name === "file").map(({ filename }) => filename),
    ).toEqual(["video.mp4", "companion.wav"]);
  });

  it("supplies the smallest valid collage template", () => {
    const settings = buildGeneratedMultipartFields({
      toolId: "collage",
      primary,
      settings: {},
      companions: { image, audio, subtitle },
    }).find(({ name }) => name === "settings");

    expect(JSON.parse(settings?.content.toString() ?? "{}")).toMatchObject({
      templateId: "2-h-equal",
    });
  });

  it("builds signature-specific parts instead of a generic settings field", () => {
    const fields = buildGeneratedMultipartFields({
      toolId: "sign-pdf",
      primary: { filename: "document.pdf", content: Buffer.from("pdf") },
      settings: {},
      companions: { image, audio, subtitle },
    });

    expect(fields.map(({ name }) => name)).toEqual(["file", "sig0", "placements"]);
  });
});
