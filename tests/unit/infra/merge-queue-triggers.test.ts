import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, { if?: string; steps?: Step[] }>;
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(root, ".github/workflows", filename), "utf8")) as Workflow;
}

describe("merge queue support", () => {
  // These workflows post the required checks on main. The merge queue waits
  // for every required check on its merge_group run, so a workflow that
  // doesn't listen for merge_group leaves queued PRs stuck as "expected".
  it.each(["ci.yml", "codeql.yml", "cla.yml", "dependency-review.yml"])(
    "%s runs on merge_group",
    (filename) => {
      expect(Object.keys(readWorkflow(filename).on)).toContain("merge_group");
    },
  );

  it("ci.yml diffs a merge group against the queue's base commit", () => {
    const filter = readWorkflow("ci.yml").jobs.changes?.steps?.find(
      (s) => s.name === "Diff against the base commit",
    );
    const text = JSON.stringify(filter);
    expect(text).toContain("github.event.merge_group.base_sha");
    expect(text).toContain('[ \\"$EVENT_NAME\\" = \\"merge_group\\" ]');
  });

  it("cla.yml reports on merge_group without running the CLA action", () => {
    const job = readWorkflow("cla.yml").jobs.cla;
    expect(job?.if).toContain("github.event_name == 'merge_group'");
    const action = job?.steps?.find((s) =>
      s.uses?.startsWith("contributor-assistant/github-action"),
    );
    expect(action?.if).toBe("github.event_name != 'merge_group'");
  });

  it("dependency-review.yml passes merge group refs and skips the PR comment there", () => {
    const step = readWorkflow("dependency-review.yml").jobs["dependency-review"]?.steps?.find((s) =>
      s.uses?.startsWith("actions/dependency-review-action"),
    );
    expect(step?.with?.["base-ref"]).toContain("github.event.merge_group.base_sha");
    expect(step?.with?.["head-ref"]).toContain("github.event.merge_group.head_sha");
    expect(step?.with?.["comment-summary-in-pr"]).toContain("'never'");
  });
});
