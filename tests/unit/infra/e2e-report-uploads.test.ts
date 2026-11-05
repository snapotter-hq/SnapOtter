import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Playwright writes its HTML report under test-results/<runs dir>/<PLAYWRIGHT_RUN_ID>/,
 * never under a bare playwright-report/ at the repo root. An upload that names
 * the bare path finds nothing, warns, and the failed run keeps no report (#1025).
 *
 * Each e2e job pins one run id and uploads the exact directory that id produces.
 */

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface Job {
  env?: Record<string, string>;
  steps?: Step[];
}

interface Workflow {
  jobs?: Record<string, Job>;
}

function loadWorkflow(file: string): Workflow {
  return load(readFileSync(path.join(root, file), "utf8")) as Workflow;
}

function uploadPaths(job: Job): string[] {
  return (job.steps ?? [])
    .filter((step) => step.uses?.startsWith("actions/upload-artifact@"))
    .flatMap((step) => (step.with?.path ?? "").split("\n").map((line) => line.trim()))
    .filter((line) => line.length > 0);
}

/** The run id each Playwright invocation in a job will be given. */
function playwrightRunIds(job: Job): string[] {
  return (job.steps ?? [])
    .filter((step) => step.run?.includes("playwright test") || step.run?.includes("test:e2e:"))
    .map((step) => step.env?.PLAYWRIGHT_RUN_ID ?? job.env?.PLAYWRIGHT_RUN_ID ?? "");
}

/**
 * Every job that uploads a Playwright report, with the exact paths it must
 * upload. The scope directory comes from resolvePlaywrightRun() in
 * tests/playwright-run.ts, and the analytics config keeps its own root.
 */
const EXPECTED: Record<string, Record<string, string[]>> = {
  "ci.yml": {
    "test-e2e-smoke": ["test-results/e2e-runs/e2e-smoke/playwright-report/"],
    "test-e2e-mobile-smoke": ["test-results/e2e-runs/e2e-mobile-smoke/playwright-report/"],
    "test-e2e-landing": ["test-results/e2e-runs/e2e-landing/landing/playwright-report/"],
    "test-e2e-docs": ["test-results/e2e-runs/e2e-docs/docs/playwright-report/"],
  },
  "nightly.yml": {
    "e2e-full": [`test-results/e2e-runs/e2e-full-\${{ matrix.shard }}/playwright-report/`],
    "e2e-serial": ["test-results/e2e-runs/e2e-serial/playwright-report/"],
    "e2e-surfaces": [
      "test-results/e2e-runs/e2e-surfaces/editor/playwright-report/",
      "test-results/e2e-runs/e2e-surfaces/noauth/playwright-report/",
      "test-results/e2e-analytics-runs/e2e-surfaces/playwright-report/",
    ],
    "e2e-cross-browser": ["test-results/e2e-runs/e2e-cross-browser/playwright-report/"],
    "e2e-device-matrix": ["test-results/e2e-runs/e2e-device-matrix/playwright-report/"],
  },
};

describe("e2e report uploads (#1025)", () => {
  for (const [file, expectedByJob] of Object.entries(EXPECTED)) {
    const jobs = loadWorkflow(`.github/workflows/${file}`).jobs ?? {};

    describe(file, () => {
      for (const [jobName, expectedPaths] of Object.entries(expectedByJob)) {
        it(`${jobName} uploads the directory its Playwright run writes`, () => {
          const job = jobs[jobName];
          expect(job, `${jobName} exists`).toBeDefined();
          expect(uploadPaths(job)).toEqual(expectedPaths);
        });

        it(`${jobName} pins the run id its upload path is named after`, () => {
          const job = jobs[jobName];
          const ids = playwrightRunIds(job);
          expect(ids.length).toBeGreaterThan(0);
          for (const id of ids) expect(id, `${jobName} run id`).not.toBe("");
          for (const p of uploadPaths(job)) {
            const id = p.match(/e2e-[a-z-]*runs\/([^/]+)\//)?.[1];
            expect(id, `${jobName} path ${p}`).toBeDefined();
            expect(ids, `${jobName} path ${p}`).toContain(id);
          }
        });
      }
    });
  }

  it("no e2e job still uploads the bare playwright-report/ directory", () => {
    for (const file of Object.keys(EXPECTED)) {
      const jobs = loadWorkflow(`.github/workflows/${file}`).jobs ?? {};
      for (const [jobName, job] of Object.entries(jobs)) {
        for (const p of uploadPaths(job)) {
          expect(p, `${file} ${jobName}`).not.toMatch(/^playwright-report\/?$/);
        }
      }
    }
  });
});
