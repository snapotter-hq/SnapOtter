import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

interface Workflow {
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean | string;
  };
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(root, ".github/workflows", filename), "utf8")) as Workflow;
}

describe("workflow concurrency groups (#2457)", () => {
  it.each(["nightly.yml", "dependency-review.yml", "mutation.yml"])(
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

  it.each(["ci.yml", "codeql.yml"])(
    "%s cancels superseded PR runs but gives every main commit its own run (#4190)",
    (filename) => {
      // Under merge traffic a later push cancelled main's run before it
      // finished. Not cancelling is not enough on its own: a group holds one
      // pending run and a third push replaces it, so main keys by sha.
      const wf = readWorkflow(filename);
      expect(wf.concurrency).toEqual({
        group:
          // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
          "${{ github.workflow }}-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
        "cancel-in-progress": "${{ github.ref != 'refs/heads/main' }}",
      });
    },
  );

  it("cla.yml does not cancel in-progress runs that may be pushing to cla-signatures", () => {
    const wf = readWorkflow("cla.yml");
    expect(wf.concurrency?.["cancel-in-progress"]).not.toBe(true);
  });
});
