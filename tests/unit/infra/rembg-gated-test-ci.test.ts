import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * tests/unit/ai/remove-bg-hr-matting.test.ts has a test that needs the real
 * rembg (numpy, Pillow, onnxruntime). The Unit Tests job has none of them, so
 * that test was skipped on every run, and the stubbed test next to it can't
 * notice a rembg release changing how its predict feeds the model (#1299).
 *
 * Some ci.yml job must install the rembg pinned in requirements.txt and run
 * that file with REQUIRE_REMBG=1, which turns a missing rembg into a failure
 * instead of a skip, whenever the sidecar or its pins change.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const TEST_FILE = "tests/unit/ai/remove-bg-hr-matting.test.ts";

interface Step {
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  env?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
}

const ci = load(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;

// A step runs the file when it hands it to vitest; the changes job's path
// filter also names it, and that mention runs nothing.
const runsTestFile = (step: Step) =>
  Boolean(step.run?.includes("vitest") && step.run.includes(TEST_FILE));

const gatedJobs = Object.entries(ci.jobs).filter(([, job]) => (job.steps ?? []).some(runsTestFile));

describe("rembg-gated HR matting test in CI", () => {
  it("is run by a ci.yml job", () => {
    expect(gatedJobs.map(([name]) => name)).not.toEqual([]);
  });

  it.each(gatedJobs)("%s requires rembg rather than skipping without it", (_, job) => {
    const step = (job.steps ?? []).find(runsTestFile) as Step;
    const env = { ...job.env, ...step.env };
    expect(env.REQUIRE_REMBG).toBe("1");
    expect(env.PYTHON_VENV_PATH).toBeTruthy();
  });

  it.each(gatedJobs)("%s installs rembg from the pinned requirements", (_, job) => {
    const installs = (job.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(installs).toContain("packages/ai/python/requirements.txt");
    expect(installs).toMatch(/\brembg\b/);
  });

  it.each(gatedJobs)("%s runs whenever the sidecar changes", (_, job) => {
    // Gated on a changes-job output whose path filter covers the sidecar.
    const output = job.if?.match(/needs\.changes\.outputs\.([a-z_-]+)/)?.[1];
    expect(output, `${job.if} must be gated on a changes output`).toBeTruthy();
    const filter = (ci.jobs.changes.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(filter).toContain(`echo "${output}=$${output}" >> "$GITHUB_OUTPUT"`);
    const block = filter.slice(filter.indexOf(`${output}=false`));
    expect(block).toContain("packages/ai/python/*");
    expect(block).toContain(TEST_FILE);
  });
});
