import { existsSync } from "node:fs";
import { extname } from "node:path";
import { TOOLS } from "@snapotter/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  buildGeneratedFixtureIndex,
  formatMatrixPositiveControl,
  type GeneratedFixture,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";

const GIF_IMAGE_TO_VIDEO_TOOLS = [
  "gif-to-video",
  "images-to-video",
  "gif-to-mp4",
  "gif-to-webm",
  "gif-to-mov",
] as const;

describe("generated fixture discovery", () => {
  it.each(GIF_IMAGE_TO_VIDEO_TOOLS)("finds image/GIF fixtures for %s", (toolId) => {
    const tool = TOOLS.find((candidate) => candidate.id === toolId);
    expect(tool, `missing tool metadata for ${toolId}`).toBeDefined();
    if (!tool) throw new Error(`missing tool metadata for ${toolId}`);

    const fixtures = selectFixturesForTool(
      buildGeneratedFixtureIndex(generatedFixtureDirectories()),
      tool,
    );

    expect(fixtures.length, `${toolId} should not be emitted as a no-fixture skip`).toBeGreaterThan(
      0,
    );
    expect(
      fixtures.some((fixture) => [".gif", ".png", ".jpg", ".webp"].includes(fixture.ext)),
    ).toBe(true);
  });

  it("treats an empty accepted-input list as accepting any generated fixture", () => {
    const fixtures = selectFixturesForTool(
      buildGeneratedFixtureIndex(generatedFixtureDirectories()),
      { acceptedInputs: [] },
    );

    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("prioritizes semantic positive-control fixtures for generated tools", () => {
    const fixture = (filename: string, ext: string): GeneratedFixture => ({
      dir: "/fixtures",
      filename,
      ext,
    });
    const index = new Map([
      [".csv", [fixture("tiny-a.csv", ".csv"), fixture("tiny.csv", ".csv")]],
      [".mp4", [fixture("tiny.mp4", ".mp4")]],
      [".mkv", [fixture("tiny-subs.mkv", ".mkv")]],
    ]);

    expect(
      selectFixturesForTool(index, { id: "chart-maker", acceptedInputs: [".csv"] })[0].filename,
    ).toBe("tiny.csv");
    expect(
      selectFixturesForTool(index, {
        id: "extract-subtitles",
        acceptedInputs: [".mp4", ".mkv"],
      })[0].filename,
    ).toBe("tiny-subs.mkv");
  });

  // Every fixture in the format matrix's directory is a still image, which
  // remove-gif-background refuses, so it needs an animated positive control (#4930).
  it("gives remove-gif-background an animated format-matrix positive control", async () => {
    const tool = TOOLS.find((candidate) => candidate.id === "remove-gif-background");
    const control = formatMatrixPositiveControl("remove-gif-background");

    expect(control).toBeDefined();
    if (!control) throw new Error("missing positive control");
    expect(existsSync(control)).toBe(true);
    expect(tool?.acceptedInputs).toContain(extname(control).toLowerCase());
    expect((await sharp(control, { animated: true }).metadata()).pages).toBeGreaterThan(1);
  });

  it("adds no format-matrix positive control for tools that take still images", () => {
    expect(formatMatrixPositiveControl("resize")).toBeUndefined();
  });
});
