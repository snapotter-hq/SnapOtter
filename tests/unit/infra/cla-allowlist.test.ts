import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

interface Step {
  uses?: string;
  with?: Record<string, string>;
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const workflow = load(
  readFileSync(path.resolve(import.meta.dirname, "../../../.github/workflows/cla.yml"), "utf8"),
) as Workflow;

describe("cla.yml allowlist", () => {
  const action = workflow.jobs.cla?.steps?.find((s) =>
    s.uses?.startsWith("contributor-assistant/github-action"),
  );
  const allowlist = (action?.with?.allowlist ?? "").split(",");

  // A bot can't sign, so any bot that opens PRs has to be listed or the
  // required cla check stays red on its PRs.
  it.each([
    "snapotter-hq",
    "dependabot[bot]",
    "renovate[bot]",
    "github-actions[bot]",
    "posthog[bot]",
  ])("exempts %s from signing", (login) => {
    expect(allowlist).toContain(login);
  });
});
