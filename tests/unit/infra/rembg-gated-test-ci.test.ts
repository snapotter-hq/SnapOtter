import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { rembgTestPins } from "../../../scripts/rembg-test-pins.mjs";

/**
 * tests/unit/ai/remove-bg-hr-matting.test.ts has a test that needs the real
 * rembg (numpy, Pillow, onnxruntime). The Unit Tests job has none of them, so
 * that test was skipped on every run, and the stubbed test next to it can't
 * notice a rembg release changing how its predict feeds the model (#1299).
 *
 * Some ci.yml job must run that file with REQUIRE_REMBG=1, which turns a
 * missing rembg into a failure instead of a skip, against both rembg pin sets
 * that reach users: the background-removal bundle's and the sidecar
 * requirements'. It must run whenever either set, the sidecar or the test
 * changes.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const TEST_FILE = "tests/unit/ai/remove-bg-hr-matting.test.ts";
const PIN_SCRIPT = "scripts/rembg-test-pins.mjs";

interface Step {
  run?: string;
  env?: Record<string, string>;
  "continue-on-error"?: unknown;
}
interface Job {
  "continue-on-error"?: unknown;
  name?: string;
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  strategy?: { matrix?: Record<string, unknown> };
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

/** The exact rembg pin a source file declares, however it's spelled. */
function rembgPin(pins: string[]): string | undefined {
  return pins.find((pin) => /^rembg(\[[^\]]*\])?==/.test(pin));
}

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

  it.each(gatedJobs)("%s installs both pin sets through the pin script", (_, job) => {
    expect(job.strategy?.matrix?.pins).toEqual(["bundle", "requirements"]);
    const installs = (job.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(installs).toContain(`node ${PIN_SCRIPT}`);
    expect(installs).toContain("-r .rembg-pins/pins.txt -c .rembg-pins/constraints.txt");
  });

  it.each(gatedJobs)("%s runs whenever the sidecar or either pin set changes", (_, job) => {
    // Gated on a changes-job output whose path filter covers all of them.
    const output = job.if?.match(/needs\.changes\.outputs\.([a-z_-]+)/)?.[1];
    expect(output, `${job.if} must be gated on a changes output`).toBeTruthy();
    const filter = (ci.jobs.changes.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(filter).toContain(`echo "${output}=$${output}" >> "$GITHUB_OUTPUT"`);
    const block = filter.slice(filter.indexOf(`${output}=false`));
    for (const pattern of [
      "packages/ai/python/*",
      "docker/feature-manifest.json",
      PIN_SCRIPT,
      TEST_FILE,
    ]) {
      expect(block).toContain(pattern);
    }
  });
});

/**
 * The name branch protection requires (#1386). A matrix leg can't be required:
 * when the path filter skips it, GitHub reports it under its unexpanded name
 * ("AI Sidecar (rembg, ${{ matrix.pins }})"), so a PR that doesn't touch the
 * AI Python would wait on it forever.
 */
const REQUIRED_NAME = "AI Sidecar (rembg)";

describe("required rembg check", () => {
  const entry = Object.entries(ci.jobs).find(([, job]) => job.name === REQUIRED_NAME);
  const job = entry?.[1];

  it("exists under the name branch protection requires", () => {
    expect(entry, `no ci.yml job is named "${REQUIRED_NAME}"`).toBeDefined();
  });

  it("waits on every job that runs the rembg-gated test, and always reports", () => {
    const needs = [job?.needs ?? []].flat();
    for (const [name] of gatedJobs) expect(needs).toContain(name);
    expect(job?.if).toBe("always()");
  });

  it("reads the result of the gated job", () => {
    // The step checks one result; a second gated job would need its own.
    expect(gatedJobs).toHaveLength(1);
    const [gatedName] = gatedJobs[0];
    expect(job?.steps?.[0]?.env?.RESULT).toBe(`\${{ needs.${gatedName}.result }}`);
  });

  it("can't be satisfied by a gated job that tolerates its own failure", () => {
    // continue-on-error turns a failed leg into a success result upstream.
    for (const [, gated] of gatedJobs) {
      expect(gated["continue-on-error"]).toBeUndefined();
      for (const step of gated.steps ?? []) expect(step["continue-on-error"]).toBeUndefined();
    }
  });

  // Run the job's own step against each result the matrix can end in.
  it.each([
    ["success", 0],
    ["skipped", 0],
    ["failure", 1],
    ["cancelled", 1],
  ])("exits for %s with %i", (result, code) => {
    const steps = job?.steps ?? [];
    expect(steps).toHaveLength(1);
    const run = spawnSync("bash", ["-e", "-c", steps[0].run ?? ""], {
      env: { ...process.env, RESULT: result },
      encoding: "utf8",
    });
    expect(run.status).toBe(code);
  });
});

describe("rembg test pins", () => {
  it("takes the bundle's rembg pin from docker/feature-manifest.json", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "docker/feature-manifest.json"), "utf8"),
    );
    const declared = rembgPin(manifest.bundles["background-removal"].packages.common);
    expect(declared).toBeTruthy();
    expect(rembgPin(rembgTestPins("bundle").pins)).toBe(declared);
  });

  it("takes the sidecar's rembg pin from packages/ai/python/requirements.txt", () => {
    const lines = readFileSync(
      path.join(root, "packages/ai/python/requirements.txt"),
      "utf8",
    ).split("\n");
    const declared = rembgPin(lines.map((line) => line.trim()));
    expect(declared).toBeTruthy();
    expect(rembgPin(rembgTestPins("requirements").pins)).toBe(declared);
  });

  it.each(["bundle", "requirements"] as const)("pins every %s package exactly", (source) => {
    const { pins, constraints } = rembgTestPins(source);
    expect(pins).toHaveLength(5);
    for (const pin of pins) expect(pin).toMatch(/^[A-Za-z0-9_.[\]-]+==[^=]+$/);
    expect(constraints.length).toBeGreaterThan(0);
  });
});
