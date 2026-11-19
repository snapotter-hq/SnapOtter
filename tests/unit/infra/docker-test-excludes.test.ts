import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/** The spec paths test-unit's command passes to `--exclude`, without the `**\/` prefix. */
function excludedSpecs(): string[] {
  const compose = readFileSync(resolve(root, "docker/docker-compose.test.yml"), "utf8");
  const start = compose.indexOf("  test-unit:\n");
  const end = compose.indexOf("  test-e2e:\n");
  expect(start, "test-unit service not found").toBeGreaterThanOrEqual(0);
  expect(end, "test-e2e service not found").toBeGreaterThan(start);
  const service = compose.slice(start, end);
  const specs = [...service.matchAll(/"--exclude",\s*"\*\*\/([^"]+)"/g)].map((match) => match[1]);
  // A comment or a different prefix between --exclude and its path would drop it silently.
  expect(specs).toHaveLength(service.split('"--exclude",').length - 1);
  return specs;
}

/** Every spec file under the roots vitest.config.ts collects from. */
function specFiles(): string[] {
  const roots = [
    "tests/unit",
    "tests/integration",
    ...readdirSync(resolve(root, "packages")).map((pkg) => `packages/${pkg}/tests`),
  ];
  const specs: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(resolve(root, dir))) return;
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) specs.push(path);
    }
  };
  for (const dir of roots) walk(dir);
  return specs;
}

// The Docker test lane (pnpm test:docker and the nightly Docker Container E2E
// job) builds an image with no .git, no *.md and no Docker socket, so a spec
// that audits the checkout or starts its own container fails there for reasons
// that say nothing about the product. Each one has to sit in test-unit's
// --exclude list; #4921 found seven that were added after the list and never
// joined it.
describe("docker-compose.test.yml test-unit exclusions", () => {
  it("only excludes specs that still exist", () => {
    for (const spec of excludedSpecs()) {
      expect(existsSync(resolve(root, spec)), `${spec} is excluded but missing`).toBe(true);
    }
  });

  it("excludes the repo-audit and own-container specs from #4921", () => {
    expect(excludedSpecs()).toEqual(
      expect.arrayContaining([
        "tests/unit/docs/no-em-dashes.test.ts",
        "tests/unit/infra/tracked-file-size.test.ts",
        "tests/unit/infra/vitest-collection-scope.test.ts",
        "tests/unit/agent-hooks/hooks.test.mjs",
        "tests/unit/docs/aio-workspace-docs.test.ts",
        "tests/unit/infra/release-version-policy.test.ts",
        "tests/integration/platform/worker-error-backoff.test.ts",
      ]),
    );
  });

  it("excludes every spec that lists git-tracked files or starts a testcontainer", () => {
    const excluded = new Set(excludedSpecs());
    // This file names the patterns it looks for, so it would flag itself.
    const self = "tests/unit/infra/docker-test-excludes.test.ts";
    const needsExclusion = specFiles().filter((spec) => {
      if (spec === self) return false;
      const source = readFileSync(resolve(root, spec), "utf8");
      const readsGit = source.includes("ls-files") || source.includes("--git-common-dir");
      const startsContainer =
        source.includes("@testcontainers/") && !source.includes('vi.mock("@testcontainers/');
      return readsGit || startsContainer;
    });
    expect(needsExclusion.length).toBeGreaterThan(0);
    expect(needsExclusion.filter((spec) => !excluded.has(spec))).toEqual([]);
  });
});
