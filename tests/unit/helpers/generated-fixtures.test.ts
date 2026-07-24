import { TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  buildGeneratedFixtureIndex,
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
});
