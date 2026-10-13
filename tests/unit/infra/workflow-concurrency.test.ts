import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

interface Workflow {
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(root, ".github/workflows", filename), "utf8")) as Workflow;
}

describe("workflow concurrency groups (#2457)", () => {
  it.each(["ci.yml", "nightly.yml", "codeql.yml", "dependency-review.yml", "mutation.yml"])(
    "%s cancels superseded runs for the same workflow and ref",
    (filename) => {
      const wf = readWorkflow(filename);
      expect(wf.concurrency).toEqual({
        // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
        group: "${{ github.workflow }}-${{ github.ref }}",
        "cancel-in-progress": true,
      });
    },
  );

  it("cla.yml does not cancel in-progress runs that may be pushing to cla-signatures", () => {
    const wf = readWorkflow("cla.yml");
    expect(wf.concurrency?.["cancel-in-progress"]).not.toBe(true);
  });
});
