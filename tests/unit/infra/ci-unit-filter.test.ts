import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

/**
 * #5365: a docs-only commit skipped both unit shards, so the required Unit
 * Tests context went green while tests that read apps/docs, apps/landing and
 * README.md were failing on main (#5362). The `changes` job must run unit for
 * any change those tests can observe.
 */

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  id?: string;
  run?: string;
}
interface Job {
  if?: string;
  outputs?: Record<string, string>;
  steps?: Step[];
}
const ci = load(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")) as {
  jobs: Record<string, Job>;
};

const filterScript = ci.jobs.changes.steps?.find((s) => s.id === "filter")?.run ?? "";

const scratch = mkdtempSync(path.join(tmpdir(), "ci-unit-filter-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// Runs the real filter script with a git stub that reports `changed` as the diff.
function outputsFor(changed: string[]): Record<string, string> {
  const bin = path.join(scratch, "bin");
  const out = path.join(scratch, "output");
  writeFileSync(out, "");
  mkdirSync(bin, { recursive: true });
  const stub = path.join(bin, "git");
  writeFileSync(
    stub,
    `#!/bin/sh\nif [ "$1" = "diff" ]; then printf '%s\\n' ${changed.map((f) => `'${f}'`).join(" ")}; fi\nexit 0\n`,
  );
  chmodSync(stub, 0o755);
  const res = spawnSync("bash", ["-c", filterScript], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      EVENT_NAME: "push",
      PUSH_BEFORE_SHA: "a".repeat(40),
      GITHUB_OUTPUT: out,
    },
    encoding: "utf8",
  });
  expect(res.status, res.stderr).toBe(0);
  return Object.fromEntries(
    readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split("=") as [string, string]),
  );
}

describe("ci.yml changes job and the unit tests (#5365)", () => {
  it("gates test-unit on the unit output, not code", () => {
    expect(ci.jobs["test-unit"].if).toBe("needs.changes.outputs.unit == 'true'");
    expect(ci.jobs.changes.outputs?.unit).toContain("steps.filter.outputs.unit");
  });

  it.each([
    "apps/docs/guide/deployment.md",
    "apps/docs/de/changelog.md",
    "apps/landing/src/pages/index.astro",
    "README.md",
    "CONTRIBUTING.md",
  ])("runs unit when only %s changed", (file) => {
    expect(outputsFor([file]).unit).toBe("true");
  });

  it("still skips unit for branding and root docs scratch", () => {
    expect(outputsFor(["branding/logo.svg", "docs/notes.md"]).unit).toBe("false");
  });

  it("keeps the code-only jobs skipped on a docs-only change", () => {
    expect(outputsFor(["apps/docs/guide/deployment.md"]).code).toBe("false");
  });
});
