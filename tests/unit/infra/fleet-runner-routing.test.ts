import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// Self-hosted fleet runners on a public repo (#4965). A fork PR that lands on
// one runs arbitrary code on a shared host, so these tests evaluate the
// routing expressions against the event shapes GitHub sends rather than only
// matching their text.

const root = path.resolve(import.meta.dirname, "../../..");
const workflowsDir = path.join(root, ".github/workflows");
const FLEET_LABEL = "snapotter-fleet";

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
}

interface Job {
  name?: string;
  "runs-on"?: string | string[];
  needs?: string | string[];
  outputs?: Record<string, string>;
  services?: Record<string, { ports?: (string | number)[] }>;
  steps?: Step[];
}

interface Workflow {
  on?: unknown;
  jobs: Record<string, Job>;
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(workflowsDir, filename), "utf8")) as Workflow;
}

function unwrap(expression: string): string {
  const match = expression.match(/^\$\{\{\s*([\s\S]+?)\s*\}\}$/);
  if (!match) throw new Error(`not a single expression: ${expression}`);
  return match[1];
}

// Evaluates the subset of the Actions expression language these workflows use
// (property paths, string literals, ==, !=, &&, ||, parentheses, fromJSON).
// Unknown properties resolve to null, the way GitHub resolves them.
function evaluate(expression: string, context: Record<string, unknown>): unknown {
  const tokens = expression.match(/'(?:[^']|'')*'|==|!=|&&|\|\||[()]|[A-Za-z_][\w.-]*|\S/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const lookup = (pathExpr: string): unknown =>
    pathExpr.split(".").reduce<unknown>((value, key) => {
      if (value && typeof value === "object" && key in value) {
        return (value as Record<string, unknown>)[key];
      }
      return null;
    }, context);

  const truthy = (value: unknown) =>
    !(value === null || value === false || value === "" || value === 0);
  const looseEqual = (a: unknown, b: unknown) =>
    typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b;

  function primary(): unknown {
    const token = next();
    if (token === "(") {
      const value = or();
      if (next() !== ")") throw new Error("expected )");
      return value;
    }
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "fromJSON") {
      if (next() !== "(") throw new Error("expected ( after fromJSON");
      const arg = or();
      if (next() !== ")") throw new Error("expected ) after fromJSON");
      return JSON.parse(String(arg));
    }
    if (/^[A-Za-z_]/.test(token)) return lookup(token);
    throw new Error(`unexpected token ${token}`);
  }
  function comparison(): unknown {
    let left = primary();
    while (peek() === "==" || peek() === "!=") {
      const op = next();
      const right = primary();
      left = op === "==" ? looseEqual(left, right) : !looseEqual(left, right);
    }
    return left;
  }
  function and(): unknown {
    let left = comparison();
    while (peek() === "&&") {
      next();
      const right = comparison();
      left = truthy(left) ? right : left;
    }
    return left;
  }
  function or(): unknown {
    let left = and();
    while (peek() === "||") {
      next();
      const right = and();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  const result = or();
  if (pos !== tokens.length) throw new Error(`trailing tokens in ${expression}`);
  return result;
}

const REPO = "snapotter-hq/SnapOtter";

function pullRequest(headRepo: string, author = "snapotter-hq") {
  return {
    github: {
      event_name: "pull_request",
      ref: "refs/pull/1/merge",
      repository: REPO,
      event: { pull_request: { head: { repo: { full_name: headRepo } }, user: { login: author } } },
    },
    vars: {},
  };
}

const EVENTS: Record<string, { context: Record<string, unknown>; fleet: boolean }> = {
  "push to main": {
    context: { github: { event_name: "push", ref: "refs/heads/main", repository: REPO }, vars: {} },
    fleet: true,
  },
  "same-repo PR": { context: pullRequest(REPO), fleet: true },
  "fork PR": { context: pullRequest("someone/SnapOtter", "someone"), fleet: false },
  "fork PR from a fork named like the repo's owner": {
    context: pullRequest("snapotter-hq-fork/SnapOtter", "someone"),
    fleet: false,
  },
  "fork PR with the head repo missing (deleted fork)": {
    context: {
      github: {
        event_name: "pull_request",
        ref: "refs/pull/1/merge",
        repository: REPO,
        event: { pull_request: { head: { repo: null }, user: { login: "someone" } } },
      },
      vars: {},
    },
    fleet: false,
  },
  "Dependabot PR from a branch of this repo": {
    context: pullRequest(REPO, "dependabot[bot]"),
    fleet: false,
  },
  "push to a non-main ref": {
    context: {
      github: { event_name: "push", ref: "refs/heads/feature", repository: REPO },
      vars: {},
    },
    fleet: false,
  },
  "workflow_dispatch on main": {
    context: {
      github: { event_name: "workflow_dispatch", ref: "refs/heads/main", repository: REPO },
      vars: {},
    },
    fleet: false,
  },
  merge_group: {
    context: {
      github: {
        event_name: "merge_group",
        ref: "refs/heads/gh-readonly-queue/main/pr-1",
        repository: REPO,
      },
      vars: {},
    },
    fleet: false,
  },
  "pull_request_target from a fork": {
    context: {
      github: {
        event_name: "pull_request_target",
        ref: "refs/heads/main",
        repository: REPO,
        event: {
          pull_request: { head: { repo: { full_name: REPO } }, user: { login: "someone" } },
        },
      },
      vars: {},
    },
    fleet: false,
  },
  "push to main with FLEET_RUNNERS=off": {
    context: {
      github: { event_name: "push", ref: "refs/heads/main", repository: REPO },
      vars: { FLEET_RUNNERS: "off" },
    },
    fleet: false,
  },
  "same-repo PR with FLEET_RUNNERS=off": {
    context: { ...pullRequest(REPO), vars: { FLEET_RUNNERS: "off" } },
    fleet: false,
  },
};

const ci = readWorkflow("ci.yml");
const fleetOutput = ci.jobs.changes.outputs?.fleet ?? "";

function routedJobs(workflow: Workflow): [string, Job][] {
  return Object.entries(workflow.jobs).filter(([, job]) =>
    JSON.stringify(job["runs-on"] ?? "").includes(FLEET_LABEL),
  );
}

// Every routed job but `changes` reads the decision from its output; `changes`
// inlines the same condition because a job can't read its own outputs.
const jobsReadingFleetOutput = routedJobs(ci).filter(([id]) => id !== "changes");

function resolveRunsOn(job: Job, fleet: boolean): unknown {
  const runsOn = job["runs-on"];
  if (typeof runsOn !== "string") return runsOn;
  return evaluate(unwrap(runsOn), {
    needs: { changes: { outputs: { fleet: String(fleet) } } },
  });
}

describe("self-hosted fleet runner routing (#4965)", () => {
  it.each(Object.entries(EVENTS))(
    "%s resolves the fleet output correctly",
    (_name, { context, fleet }) => {
      // Job outputs are strings, so the routed jobs compare against 'true'.
      expect(String(evaluate(unwrap(fleetOutput), context))).toBe(String(fleet));
    },
  );

  it.each(Object.entries(EVENTS))(
    "%s puts the Changes job on the same side as the fleet output",
    (_name, { context, fleet }) => {
      const resolved = evaluate(unwrap(String(ci.jobs.changes["runs-on"])), context);
      expect(resolved).toEqual(fleet ? ["self-hosted", FLEET_LABEL] : "ubuntu-latest");
    },
  );

  it("routes every CI job, so a trusted run never waits in the hosted queue", () => {
    // Hosted capacity for this account can drop to a single job; any job left
    // hosted, an aggregator included, would hold every merge behind it.
    expect(
      routedJobs(ci)
        .map(([id]) => id)
        .sort(),
    ).toEqual(Object.keys(ci.jobs).sort());
  });

  it.each(routedJobs(ci).filter(([, job]) => job.services))(
    "%s publishes its service ports on random host ports",
    (_id, job) => {
      // The fleet host runs its own dev Postgres and Redis on 5432 and 6379,
      // and two fleet jobs can run at once.
      for (const service of Object.values(job.services ?? {})) {
        for (const port of service.ports ?? []) {
          expect(String(port)).toMatch(/^\d+$/);
        }
      }
    },
  );

  it.each(jobsReadingFleetOutput)(
    "%s never resolves to the fleet label for a fork PR",
    (_id, job) => {
      const needs = [job.needs ?? []].flat();
      expect(needs).toContain("changes");
      const forkFleet = String(evaluate(unwrap(fleetOutput), EVENTS["fork PR"].context)) === "true";
      const resolved = resolveRunsOn(job, forkFleet);
      expect(typeof resolved).toBe("string");
      expect(String(resolved)).toMatch(/^ubuntu-/);
    },
  );

  it.each(jobsReadingFleetOutput)(
    "%s resolves to exactly the fleet labels when allowed",
    (_id, job) => {
      expect(resolveRunsOn(job, true)).toEqual(["self-hosted", FLEET_LABEL]);
    },
  );

  it.each(routedJobs(ci))("%s skips every sudo step on a self-hosted runner", (_id, job) => {
    // The fleet runner user has no passwordless sudo; the host carries CI's
    // packages instead.
    const sudoSteps = (job.steps ?? []).filter(
      (step) =>
        /\bsudo\b/.test(step.run ?? "") ||
        // playwright-install skips its sudo half itself on self-hosted
        // runners (RUNNER_ENVIRONMENT; tested in visual-baselines-pr.test.ts).
        ["apt-install", "imagemagick-exr", "doc-binaries"].some((action) =>
          (step.uses ?? "").endsWith(`/actions/${action}`),
        ),
    );
    for (const step of sudoSteps) {
      expect(step.if, step.name ?? step.uses).toBe("runner.environment == 'github-hosted'");
    }
  });

  it("only ci.yml routes jobs to the fleet", () => {
    // Release, publish and bundle workflows run with secrets and must never
    // land on a shared self-hosted host through this label.
    const others = readdirSync(workflowsDir)
      .filter((file) => /\.ya?ml$/.test(file) && file !== "ci.yml")
      .filter((file) => readFileSync(path.join(workflowsDir, file), "utf8").includes(FLEET_LABEL));
    expect(others).toEqual([]);
  });
});
