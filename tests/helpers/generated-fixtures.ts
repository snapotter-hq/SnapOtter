import { existsSync, readdirSync } from "node:fs";
import { extname } from "node:path";
import { fixtureDir } from "../fixtures/index.js";

export interface GeneratedFixture {
  dir: string;
  filename: string;
  ext: string;
}

type ToolInputs = { id?: string; acceptedInputs: readonly string[] };

const POSITIVE_CONTROL_FIXTURE: Readonly<Record<string, string>> = {
  "chart-maker": "tiny.csv",
  "extract-subtitles": "tiny-subs.mkv",
};

export function generatedFixtureDirectories(): string[] {
  return [
    fixtureDir.image.formats,
    fixtureDir.image.valid,
    fixtureDir.video.formats,
    fixtureDir.video.valid,
    fixtureDir.audio.formats,
    fixtureDir.audio.valid,
    fixtureDir.document.formats,
    fixtureDir.document.valid,
    fixtureDir.document.edge,
    fixtureDir.data,
  ];
}

export function buildGeneratedFixtureIndex(
  directories: readonly string[],
): Map<string, GeneratedFixture[]> {
  const index = new Map<string, GeneratedFixture[]>();
  for (const dir of directories) {
    if (!existsSync(dir)) continue;
    for (const filename of readdirSync(dir)
      .filter((entry) => !entry.startsWith("."))
      .sort((left, right) => left.localeCompare(right))) {
      const ext = extname(filename).toLowerCase();
      if (!ext) continue;
      const fixture = { dir, filename, ext };
      const fixtures = index.get(ext);
      if (fixtures) fixtures.push(fixture);
      else index.set(ext, [fixture]);
    }
  }
  return index;
}

export function selectFixturesForTool(
  index: ReadonlyMap<string, GeneratedFixture[]>,
  tool: ToolInputs,
): GeneratedFixture[] {
  const fixtures =
    tool.acceptedInputs.length === 0
      ? [...index.values()].flat()
      : tool.acceptedInputs.flatMap((extension) => index.get(extension.toLowerCase()) ?? []);
  const preferredFilename = tool.id ? POSITIVE_CONTROL_FIXTURE[tool.id] : undefined;
  if (!preferredFilename) return fixtures;
  const preferredIndex = fixtures.findIndex((fixture) => fixture.filename === preferredFilename);
  if (preferredIndex <= 0) return fixtures;
  return [
    fixtures[preferredIndex],
    ...fixtures.slice(0, preferredIndex),
    ...fixtures.slice(preferredIndex + 1),
  ];
}
