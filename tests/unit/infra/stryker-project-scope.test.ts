import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import vitestConfig from "../../../vitest.config.ts";

/**
 * The three workspace Stryker configs (image-engine, media-engine, doc-engine)
 * run with the package directory as cwd, so their project reader only ever sees
 * `src/`. The two root configs run with the repository root as cwd, and Stryker
 * does not read .gitignore: its ProjectReader crawls everything from cwd, then
 * DisableTypeChecksPreprocessor reads every one of those files into memory at
 * once. With no ignorePatterns that meant ~50k files and 3.3 GB, dominated by
 * the gitignored docs build output, and both lanes died with a V8 heap OOM
 * (exit 134) before testing a single mutant.
 *
 * These assertions keep the root lanes pointed at source. They are deliberately
 * empirical: asserting the config contains a specific string would just restate
 * the config.
 */

const root = path.resolve(import.meta.dirname, "../../..");

const ROOT_STRYKER_CONFIGS = ["stryker.api.config.json", "stryker.shared.config.json"];

const WORKSPACE_STRYKER_CONFIGS = [
  "packages/image-engine/stryker.config.json",
  "packages/media-engine/stryker.config.json",
  "packages/doc-engine/stryker.config.json",
];

const ALL_STRYKER_CONFIGS = [...ROOT_STRYKER_CONFIGS, ...WORKSPACE_STRYKER_CONFIGS];

/** Mirrors ALWAYS_IGNORE in @stryker-mutator/core's ProjectReader. */
const ALWAYS_IGNORE = ["node_modules", ".git", ".next", ".nuxt", ".svelte-kit"];

/**
 * Ceilings for what the root project readers may ingest. Today's scoped crawl
 * is ~6.9k files / 234 MB, and the OOM was 50k files / 3.3 GB, so these sit
 * well clear of normal growth while still catching a whole build tree leaking
 * back in.
 */
const MAX_PROJECT_FILES = 12_000;
const MAX_PROJECT_BYTES = 400 * 1024 * 1024;

/**
 * Ignore patterns are restricted to two shapes so this guard can reason about
 * them exactly: a bare name (matches a path segment at any depth, e.g. "dist")
 * or a root-anchored path (e.g. "/apps/api/data"). Globs are rejected rather
 * than approximated.
 */
const SUPPORTED_PATTERN = /^\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

interface StrykerConfig {
  ignorePatterns?: string[];
  tempDirName?: string;
  cleanTempDir?: string | boolean;
  thresholds?: { break?: number | null };
}

/**
 * Does a Vitest exclude glob swallow everything under `directory`? Only the two
 * shapes the exclude list actually uses are handled: "<dir>/**" and a leading
 * "**\/" variant, with a single trailing "*" wildcard allowed on the directory
 * segment.
 */
function excludesDirectory(patterns: string[], directory: string): boolean {
  return patterns.some((pattern) => {
    const glob = pattern.replace(/^\*\*\//, "");
    if (!glob.endsWith("/**")) return false;
    const segment = glob.slice(0, -"/**".length);
    if (segment.includes("/")) return false;
    return segment.endsWith("*")
      ? directory.startsWith(segment.slice(0, -1))
      : directory === segment;
  });
}

function readStrykerConfig(file: string): StrykerConfig {
  return JSON.parse(readFileSync(path.join(root, file), "utf8")) as StrykerConfig;
}

function isIgnored(relativePath: string, patterns: string[]): boolean {
  const segments = relativePath.split("/");
  return patterns.some((pattern) => {
    if (pattern.startsWith("/")) {
      const anchored = pattern.slice(1);
      return relativePath === anchored || relativePath.startsWith(`${anchored}/`);
    }
    return segments.includes(pattern);
  });
}

function crawl(patterns: string[]): { files: number; bytes: number; heaviest: string[] } {
  let files = 0;
  let bytes = 0;
  const byTopLevel = new Map<string, number>();

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (isIgnored(relative, patterns)) continue;
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files += 1;
        const size = statSync(absolute).size;
        bytes += size;
        const top = relative.split("/").slice(0, 2).join("/");
        byTopLevel.set(top, (byTopLevel.get(top) ?? 0) + size);
      }
    }
  };
  walk(root);

  const heaviest = [...byTopLevel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, size]) => `${(size / 1e6).toFixed(1)}MB ${name}`);
  return { files, bytes, heaviest };
}

/**
 * Directory-shaped .gitignore entries: everything git already treats as
 * non-source. Anything git ignores is by definition not an input to a mutation
 * run, so a new entry here that the Stryker configs do not also ignore is the
 * next OOM waiting to happen.
 */
function gitignoredDirectories(): string[] {
  const found = new Set<string>();
  for (const raw of readFileSync(path.join(root, ".gitignore"), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const declaresDirectory = line.endsWith("/") || line.endsWith("/*");
    const entry = line
      .replace(/^\*\*\//, "")
      .replace(/\/\*$/, "")
      .replace(/\/$/, "")
      .replace(/^\//, "");
    if (!entry || entry.includes("*")) continue;
    if (declaresDirectory || existsAsDirectory(entry)) found.add(entry);
  }
  return [...found].sort();
}

function existsAsDirectory(relativePath: string): boolean {
  try {
    return statSync(path.join(root, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

describe("root Stryker lanes see only source", () => {
  it("declares ignore patterns on both root configs", () => {
    for (const file of ROOT_STRYKER_CONFIGS) {
      const patterns = readStrykerConfig(file).ignorePatterns;
      expect(patterns, `${file} must declare ignorePatterns`).toBeDefined();
      expect(patterns?.length, `${file} must declare ignorePatterns`).toBeGreaterThan(0);
    }
  });

  it("keeps the two root configs on the same ignore list", () => {
    const [api, shared] = ROOT_STRYKER_CONFIGS.map((file) =>
      [...(readStrykerConfig(file).ignorePatterns ?? [])].sort(),
    );
    expect(api).toEqual(shared);
  });

  it("uses only pattern shapes this guard can evaluate", () => {
    for (const file of ROOT_STRYKER_CONFIGS) {
      for (const pattern of readStrykerConfig(file).ignorePatterns ?? []) {
        expect(pattern, `${file} pattern ${pattern}`).toMatch(SUPPORTED_PATTERN);
      }
    }
  });

  it("ignores every directory git already ignores", () => {
    const patterns = [
      ...ALWAYS_IGNORE,
      ...(readStrykerConfig(ROOT_STRYKER_CONFIGS[0]).ignorePatterns ?? []),
    ];
    const escaped = gitignoredDirectories().filter((dir) => !isIgnored(dir, patterns));
    expect(escaped).toEqual([]);
  });

  it("deletes its sandbox even when the run crashes", () => {
    // Stryker's default cleanTempDir is `true`, which skips cleanup on error.
    // A crashed lane then leaves a full copy of the project on disk.
    for (const file of ALL_STRYKER_CONFIGS) {
      expect(readStrykerConfig(file).cleanTempDir, `${file} cleanTempDir`).toBe("always");
    }
  });

  it("keeps every Stryker sandbox out of Vitest's file discovery", () => {
    const exclude = vitestConfig.test?.exclude ?? [];
    for (const file of ALL_STRYKER_CONFIGS) {
      // Stryker's own default when a config omits tempDirName.
      const tempDirName = readStrykerConfig(file).tempDirName ?? ".stryker-tmp";
      expect(
        excludesDirectory(exclude, tempDirName),
        `vitest.config.ts must exclude ${tempDirName} (from ${file}); a live sandbox otherwise turns into phantom "Cannot find module" failures`,
      ).toBe(true);
    }
  });

  it("keeps the crawled project under the file and byte ceilings", () => {
    const patterns = [
      ...ALWAYS_IGNORE,
      ...(readStrykerConfig(ROOT_STRYKER_CONFIGS[0]).ignorePatterns ?? []),
    ];
    const { files, bytes, heaviest } = crawl(patterns);
    const detail = `heaviest: ${heaviest.join(", ")}`;
    expect(files, detail).toBeLessThan(MAX_PROJECT_FILES);
    expect(bytes, detail).toBeLessThan(MAX_PROJECT_BYTES);
  });
});
