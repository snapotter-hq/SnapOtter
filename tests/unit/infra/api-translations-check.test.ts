import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, { name?: string; if?: string; steps?: { run?: string }[] }>;
}

const workflowText = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const job = (load(workflowText) as Workflow).jobs["i18n-api"];

describe("API translations required check", () => {
  // The `main` ruleset matches required checks by job name. A rename after it
  // is required strands every PR on a context that never reports.
  it("is named exactly as the ruleset lists it", () => {
    expect(job?.name).toBe("API translations");
  });

  it("checks only the api surface", () => {
    expect(job?.steps?.some((s) => s.run === "pnpm i18n:check --surface=api")).toBe(true);
  });

  // A job-level skip reports "skipped", which satisfies a required check. A
  // workflow-level paths filter would leave the context "expected" forever.
  it("skips at job level when the API reference is untouched", () => {
    expect(job?.if).toContain("needs.changes.outputs.apii18n == 'true'");
    expect(workflowText).not.toMatch(/^\s+paths(-ignore)?:/m);
  });

  it("no longer carries the advisory note", () => {
    expect(workflowText).not.toMatch(/Advisory, not required/);
  });
});
