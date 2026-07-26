/**
 * Fixture lookup for the container QA sweeps.
 *
 * The sweep needs "give me a real file with extension X, preferably one that
 * suits modality M". Filenames in tests/fixtures are not uniform (sample.png,
 * tiny.mp3, tiny-subs.mkv, test-200x150.png), so resolution indexes the
 * directories by extension the way tests/helpers/generated-fixtures.ts does.
 * Guessing a per-modality filename prefix silently drops any fixture that does
 * not follow the guess, which is how every MKV case disappeared from the sweep.
 */

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..", "..");
const F = (...parts: string[]): string => join(REPO, "tests", "fixtures", ...parts);

/**
 * Search order. Format galleries come first so a modality's canonical
 * single-format fixture wins over the richer scenario files in valid/.
 */
export const QA_FIXTURE_DIRS: Readonly<Record<string, readonly string[]>> = {
  image: [F("image", "formats"), F("image", "valid"), F("image", "edge")],
  video: [F("video", "formats"), F("video", "valid")],
  audio: [F("audio", "formats"), F("audio", "valid")],
  document: [F("document", "formats"), F("document", "valid"), F("document", "edge")],
  data: [F("data", "valid")],
};

/** Modalities in TOOLS map onto the fixture trees above; "file" shares data/. */
const MODALITY_DIRS: Readonly<Record<string, readonly string[]>> = {
  image: QA_FIXTURE_DIRS.image,
  video: QA_FIXTURE_DIRS.video,
  audio: QA_FIXTURE_DIRS.audio,
  document: QA_FIXTURE_DIRS.document,
  file: QA_FIXTURE_DIRS.data,
  data: QA_FIXTURE_DIRS.data,
};

const ALL_DIRS: readonly string[] = [
  ...QA_FIXTURE_DIRS.image,
  ...QA_FIXTURE_DIRS.video,
  ...QA_FIXTURE_DIRS.audio,
  ...QA_FIXTURE_DIRS.document,
  ...QA_FIXTURE_DIRS.data,
];

/**
 * Extensions with no fixture of their own that a sibling format stands in for.
 * Only aliases where the container's decoder treats the two identically.
 */
export const EXT_ALIASES: Readonly<Record<string, string>> = {
  ".jpeg": ".jpg",
  ".tif": ".tiff",
  ".htm": ".html",
  ".yml": ".yaml",
  ".markdown": ".md",
  ".heif": ".heic",
};

export interface FixtureEntry {
  dir: string;
  filename: string;
  path: string;
}

export type FixtureIndex = ReadonlyMap<string, readonly FixtureEntry[]>;

/**
 * Indexes every fixture directory by lowercased extension. Files sort by name
 * length then lexicographically inside a directory so the plainest fixture
 * (tiny.mkv) outranks a decorated sibling (tiny-subs.mkv) when both exist.
 */
export function buildFixtureIndex(directories: readonly string[] = ALL_DIRS): FixtureIndex {
  const index = new Map<string, FixtureEntry[]>();
  for (const dir of directories) {
    if (!existsSync(dir)) continue;
    const filenames = readdirSync(dir)
      .filter((entry) => !entry.startsWith("."))
      .sort((left, right) => left.length - right.length || left.localeCompare(right));
    for (const filename of filenames) {
      const ext = extname(filename).toLowerCase();
      if (!ext) continue;
      const entry: FixtureEntry = { dir, filename, path: join(dir, filename) };
      const bucket = index.get(ext);
      if (bucket) bucket.push(entry);
      else index.set(ext, [entry]);
    }
  }
  return index;
}

let cachedIndex: FixtureIndex | null = null;

function sharedIndex(): FixtureIndex {
  if (!cachedIndex) cachedIndex = buildFixtureIndex();
  return cachedIndex;
}

/** Every fixture with this extension, modality-preferred directories first. */
export function fixturesFor(
  ext: string,
  modality: string,
  index: FixtureIndex = sharedIndex(),
): FixtureEntry[] {
  const wanted = ext.toLowerCase();
  const direct = index.get(wanted) ?? [];
  const aliased = direct.length > 0 ? [] : (index.get(EXT_ALIASES[wanted] ?? "") ?? []);
  const candidates = [...direct, ...aliased];
  if (candidates.length === 0) return [];

  const preferred = new Set(MODALITY_DIRS[modality] ?? []);
  const inModality = candidates.filter((entry) => preferred.has(entry.dir));
  const rest = candidates.filter((entry) => !preferred.has(entry.dir));
  return [...inModality, ...rest];
}

/** Best fixture path for an extension, or null when the repo has none. */
export function resolveFixture(
  ext: string,
  modality: string,
  index: FixtureIndex = sharedIndex(),
): string | null {
  return fixturesFor(ext, modality, index)[0]?.path ?? null;
}
