// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match GitHub expression and semantic-release template syntax.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const releaseConfig = JSON.parse(readFileSync(path.resolve(root, ".releaserc.json"), "utf8"));
const checkScript = path.resolve(root, "scripts/check-expected-version.sh");

function pluginOptions(name: string): Record<string, unknown> {
  const plugin = releaseConfig.plugins.find(
    (entry: unknown) => Array.isArray(entry) && entry[0] === name,
  );
  expect(plugin, `${name} options are missing from .releaserc.json`).toBeDefined();
  return plugin[1];
}

function context(messages: string[]) {
  return {
    cwd: root,
    logger: { log() {}, error() {} },
    options: { repositoryUrl: "https://github.com/snapotter-hq/snapotter.git" },
    commits: messages.map((message, index) => ({
      hash: index.toString(16).padStart(40, "0"),
      message,
    })),
  };
}

describe("release commit analysis", () => {
  it.each([
    ["feat!: drop the legacy API", "major"],
    ["fix(api)!: change the response shape", "major"],
    ["feat: add a tool\n\nBREAKING CHANGE: removes the old tool", "major"],
    ["feat: add a tool", "minor"],
    ["fix: repair a tool", "patch"],
    ["chore: tidy", null],
  ])("bumps %j as %s", async (message, expected) => {
    const options = pluginOptions("@semantic-release/commit-analyzer");
    expect(await analyzeCommits(options, context([message]))).toBe(expected);
  });

  it("renders breaking changes in notes that the release-note materializer can read", async () => {
    const options = pluginOptions("@semantic-release/release-notes-generator");
    const notes = await generateNotes(options, {
      ...context(["feat!: drop the legacy API"]),
      lastRelease: { gitTag: "v2.2.0", version: "2.2.0" },
      nextRelease: { gitTag: "v3.0.0", version: "3.0.0", type: "major" },
    });
    expect(notes).toMatch(/^##? \[3\.0\.0\]\(/);
    expect(notes).toContain("BREAKING CHANGES");
  });
});

describe("expected release version gate", () => {
  function check(version: string, expected?: string) {
    try {
      const stdout = execFileSync(checkScript, [version], {
        encoding: "utf8",
        env: { ...process.env, EXPECTED_VERSION: expected ?? "" },
        stdio: "pipe",
      });
      return { status: 0, output: stdout };
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      return { status: failure.status, output: failure.stderr };
    }
  }

  it("skips the check when no version is expected", () => {
    expect(check("3.0.0").status).toBe(0);
  });

  it("passes when the computed version matches, with or without a v prefix", () => {
    expect(check("3.0.0", "3.0.0").status).toBe(0);
    expect(check("3.0.0", "v3.0.0").status).toBe(0);
  });

  it("fails when the computed version differs", () => {
    const result = check("2.3.0", "3.0.0");
    expect(result.status).toBe(1);
    expect(result.output).toContain("v2.3.0");
    expect(result.output).toContain("v3.0.0");
  });

  it("runs before semantic-release tags and again on a tag-only retry", () => {
    expect(pluginOptions("@semantic-release/exec").verifyReleaseCmd).toBe(
      "./scripts/check-expected-version.sh ${nextRelease.version}",
    );

    const workflow = readFileSync(path.resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("EXPECTED_VERSION: ${{ inputs.expected_version }}");
    expect(workflow).toContain('./scripts/check-expected-version.sh "${version}"');
  });
});
