import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * `pnpm lint` used to be `turbo lint` alone, which only fans out to the
 * per-workspace `biome check src/` scripts. Two workspaces declared no lint
 * script at all, and nothing at the repository root (tests/, scripts/, docker/,
 * config/) was linted by any gate: 1054 files, 59 errors and 582 warnings that
 * no CI job had ever seen.
 *
 * These assertions derive coverage from `git ls-files` rather than from a
 * hardcoded directory list, so a new workspace or a new top-level directory
 * fails here instead of quietly slipping out of the gate.
 */

const root = path.resolve(import.meta.dirname, "../../..");

/** Extensions Biome parses as code. package.json alone must not make a directory "source". */
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "vue",
  "astro",
  "css",
]);

/** Everything Biome will parse, including data-ish formats. */
const LINTABLE_EXTENSIONS = new Set([...CODE_EXTENSIONS, "json", "jsonc", "svg", "html"]);

/**
 * tests/fixtures/<subdir>/** is test *data*, not source: deliberately malformed
 * XXE SVGs that Biome cannot parse by design, binary MPEG-TS streams that carry
 * a .ts extension, and files whose sha256 is pinned by
 * tests/unit/fixtures/fixture-manifest.test.ts. Its top-level generator scripts
 * are source and are covered like anything else.
 */
const FIXTURE_DATA = /^tests\/fixtures\/[^/]+\//;

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

function readPackageJson(directory: string): PackageJson {
  return JSON.parse(
    readFileSync(path.join(root, directory, "package.json"), "utf8"),
  ) as PackageJson;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\n")
    .filter(Boolean);
}

function extensionOf(file: string): string {
  return file.slice(file.lastIndexOf(".") + 1);
}

function workspaceDirectories(): string[] {
  const workspace = load(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")) as {
    packages: string[];
  };
  const parents = new Set(workspace.packages.map((pattern) => pattern.replace(/\/\*+$/, "")));
  const directories = new Set<string>();
  for (const file of trackedFiles()) {
    const segments = file.split("/");
    if (segments.length < 3) continue;
    const candidate = `${segments[0]}/${segments[1]}`;
    if (parents.has(segments[0]) && file === `${candidate}/package.json`) {
      directories.add(candidate);
    }
  }
  return [...directories].sort();
}

function workspaceParents(): Set<string> {
  const workspace = load(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")) as {
    packages: string[];
  };
  return new Set(workspace.packages.map((pattern) => pattern.replace(/\/\*+$/, "")));
}

/** Paths handed to Biome by the repository-root half of the lint gate. */
function rootLintPaths(): string[] {
  const script = readPackageJson(".").scripts?.["lint:root"];
  expect(script, "root package.json must define a lint:root script").toBeDefined();
  return (script ?? "")
    .split(/\s+/)
    .slice(2) // drop "biome" "check"
    .filter((token) => token && !token.startsWith("-"));
}

function covers(token: string, file: string): boolean {
  const star = token.indexOf("*");
  if (star === -1) return file === token || file.startsWith(`${token}/`);
  const directory = token.slice(0, token.lastIndexOf("/"));
  if (!file.startsWith(`${directory}/`)) return false;
  const remainder = file.slice(directory.length + 1);
  if (remainder.includes("/")) return false;
  return remainder.endsWith(token.slice(token.lastIndexOf("/") + 2));
}

describe("lint gate coverage", () => {
  it("runs both halves of the gate from the canonical script", () => {
    const lint = readPackageJson(".").scripts?.lint ?? "";
    expect(lint).toContain("turbo lint");
    expect(lint).toContain("lint:root");
  });

  it("gives every workspace package with source a lint script", () => {
    const files = trackedFiles();
    const missing = workspaceDirectories().filter((directory) => {
      const hasSource = files.some(
        (file) => file.startsWith(`${directory}/`) && CODE_EXTENSIONS.has(extensionOf(file)),
      );
      return hasSource && !readPackageJson(directory).scripts?.lint;
    });
    expect(missing).toEqual([]);
  });

  it("covers every lintable file outside the workspaces", () => {
    const parents = workspaceParents();
    const paths = rootLintPaths();
    const uncovered = trackedFiles().filter((file) => {
      if (!file.includes("/")) return false;
      if (parents.has(file.split("/")[0])) return false;
      if (!LINTABLE_EXTENSIONS.has(extensionOf(file))) return false;
      if (FIXTURE_DATA.test(file)) return false;
      return !paths.some((token) => covers(token, file));
    });
    expect(uncovered).toEqual([]);
  });
});
