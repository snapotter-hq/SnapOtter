import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import rootConfig from "../../../vitest.config.js";
import strykerApiConfig from "../../../vitest.stryker-api.config.js";

/**
 * The api mutation lane runs tests/unit/api under its own vitest config, so its
 * dry run only passes when those tests see the same environment the Unit job
 * gives them. It went weeks without a score because it didn't (#4749): the
 * lane dropped the root config's env (MAX_BATCH_SIZE fell back to 100) and its
 * runner lacked the decoder tools the Unit job installs (no djxl, so the JXL
 * preview test failed). Stryker aborts on the first failing test of the dry
 * run, so each gap hid the next one.
 */

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  uses?: string;
  if?: string;
  with?: Record<string, string>;
}

interface Workflow {
  jobs: Record<
    string,
    {
      steps: Step[];
      strategy?: { matrix?: { include?: Array<Record<string, string>> } };
    }
  >;
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(root, ".github/workflows", filename), "utf8")) as Workflow;
}

function aptPackages(step: Step | undefined): string[] {
  return (step?.with?.packages ?? "").split(/\s+/).filter(Boolean).sort();
}

describe("api mutation lane (#4749)", () => {
  it("gives the api unit tests the root config's env", () => {
    expect(rootConfig.test?.env).toBeDefined();
    expect(strykerApiConfig.test?.env).toEqual(rootConfig.test?.env);
  });

  it("installs every apt package the Unit job installs", () => {
    const unitStep = readWorkflow("ci.yml").jobs["test-unit"].steps.find(
      (step) => step.uses === "./.github/actions/apt-install",
    );
    const unitPackages = aptPackages(unitStep);
    expect(unitPackages).toContain("libjxl-tools");

    const mutation = readWorkflow("mutation.yml").jobs.mutation;
    const apiLane = mutation.strategy?.matrix?.include?.find((lane) => lane.lane === "api");
    expect(apiLane).toBeDefined();
    const laneApt = (apiLane?.apt ?? "").split(/\s+/).filter(Boolean).sort();
    expect(laneApt).toEqual(unitPackages);

    const installStep = mutation.steps.find(
      (step) => step.uses === "./.github/actions/apt-install",
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
    expect(installStep?.with?.packages).toBe("${{ matrix.apt }}");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
    expect(installStep?.if).toBe("${{ matrix.apt }}");
  });
});
