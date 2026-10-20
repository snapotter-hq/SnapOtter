import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";

/**
 * About 2,000 Playwright tests across five configs and three main-config
 * projects collected and passed locally while no workflow ran any of them.
 * Editor, docs-site, analytics-privacy, no-auth and visual-regression behaviour
 * could all regress with every check green.
 *
 * A surface is covered when some workflow step actually runs it. Coverage is
 * read out of `run:` strings only, because a config filename also appears in
 * ci.yml's path filter and that mention runs nothing. Anything genuinely not
 * suited to CI has to say so here, with a reason, instead of just being absent.
 */

const root = path.resolve(import.meta.dirname, "../../..");

/**
 * Surfaces that deliberately have no automatic lane. Each entry must still be
 * genuinely unreferenced: a stale reason is itself a failure, so wiring one up
 * later forces the note to be deleted.
 */
const MANUAL_ONLY: Record<string, string> = {
  "playwright.analytics.config.ts":
    "In-container browser sweep against a running image at BASE_URL: 1072 tests at workers=1 with 120s timeouts. nightly.yml's docker-e2e job already records in-container browser e2e as a separate follow-up that does not fit its 60-minute budget.",
  "tests/qa/playwright.qa.config.ts":
    "Against-production sweep driven by QA_BASE_URL. CI has no deployed target to point it at, so it stays a manual release-verification lane.",
  "chromium-legacy-visual":
    "visual-regression.spec.ts has no maintained baselines on any platform, as playwright.config.ts states. It is kept explicitly runnable rather than silently skipped.",
};

/** Projects that only exist as a dependency of another project. */
const DEPENDENCY_PROJECTS = new Set(["setup"]);

interface Step {
  name?: string;
  id?: string;
  if?: string;
  "continue-on-error"?: boolean | string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface Workflow {
  jobs?: Record<
    string,
    { "runs-on"?: string; if?: string; "continue-on-error"?: boolean | string; steps?: Step[] }
  >;
}

/**
 * A run that rewrites baselines can't fail on a stale one, so it compares
 * nothing. update-visual-baselines.yml renders every visual project that way,
 * and that run used to count as covering them (#1507).
 */
const UPDATES_SNAPSHOTS = /--update-snapshots(?!=none\b)|(?:^|\s)-u(?:\s|$)/;

/**
 * Only an explicit none really compares: the default, missing, writes an
 * absent baseline and passes the CI retry against it. --ignore-snapshots
 * skips the comparison outright.
 */
function comparesScreenshots(command: string): boolean {
  return (
    command.includes("--update-snapshots=none") &&
    !command.includes("--ignore-snapshots") &&
    !command.includes("--pass-with-no-tests") &&
    !/--grep-invert[= ]["']?[^\s"']*@visual/.test(command)
  );
}

function rootScripts(): Record<string, string> {
  return (
    JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
}

/**
 * Every command any workflow actually executes, with `pnpm <script>` references
 * expanded from package.json so `pnpm test:e2e:docs` counts as running the docs
 * config.
 */
function executedCommands(): string {
  const workflowDir = path.join(root, ".github/workflows");
  const commands: string[] = [];
  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith(".yml"))) {
    const workflow = load(readFileSync(path.join(workflowDir, file), "utf8")) as Workflow;
    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === "string" && !UPDATES_SNAPSHOTS.test(step.run)) {
          commands.push(step.run);
        }
      }
    }
  }

  let corpus = commands.join("\n");
  const scripts = rootScripts();
  // Two passes: a workflow calls a script, which may call another script.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [name, body] of Object.entries(scripts)) {
      const reference = new RegExp(
        `pnpm (?:run )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\S)`,
      );
      if (reference.test(corpus) && !corpus.includes(body)) corpus += `\n${body}`;
    }
  }
  return corpus;
}

function playwrightConfigs(): string[] {
  const configs = readdirSync(root).filter(
    (name) => name.startsWith("playwright.") && name.endsWith(".config.ts"),
  );
  configs.push("tests/qa/playwright.qa.config.ts");
  return configs.sort();
}

function mainConfigProjects(): string[] {
  const source = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
  return [...source.matchAll(/^\s{6}name: "([^"]+)",$/gm)]
    .map((match) => match[1])
    .filter((name) => !DEPENDENCY_PROJECTS.has(name));
}

describe("Playwright CI coverage", () => {
  const corpus = executedCommands();

  it("runs every Playwright config from some workflow, or says why not", () => {
    // playwright.config.ts is the default, so it is never named on a command
    // line: any `playwright test` without --config is running it.
    const defaultConfigRun = /playwright test(?![^\n]*--config)/.test(corpus);
    const unwired = playwrightConfigs().filter((config) => {
      if (config === "playwright.config.ts") return !defaultConfigRun;
      return !corpus.includes(config) && !MANUAL_ONLY[config];
    });
    expect(unwired).toEqual([]);
  });

  it("runs every main-config project from some workflow, or says why not", () => {
    const unwired = mainConfigProjects().filter(
      (project) => !corpus.includes(`--project=${project}`) && !MANUAL_ONLY[project],
    );
    expect(unwired).toEqual([]);
  });

  it("keeps the manual-only list free of stale entries", () => {
    const nowWired = Object.keys(MANUAL_ONLY).filter((surface) =>
      corpus.includes(surface.endsWith(".ts") ? surface : `--project=${surface}`),
    );
    expect(nowWired).toEqual([]);
  });

  it("compares every maintained screenshot baseline, not only regenerates it", () => {
    // The projects that write maintained baselines: VISUAL_SPECS plus the
    // device projects that keep their @visual shots. A command that names one
    // of them but grep-inverts @visual compares none of its screenshots.
    const config = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
    const visualProjects = config
      .split(/\n {4}\{\n/)
      .slice(1)
      .filter((block) => /testMatch: (VISUAL_SPECS|DEVICE_SPECS),/.test(block))
      .filter((block) => !/grepInvert: \/@visual\//.test(block))
      .map((block) => /^ {6}name: "([^"]+)",$/m.exec(block)?.[1]);
    expect(visualProjects).toEqual(
      expect.arrayContaining(["chromium-visual", "mobile-chromium", "tablet-chromium"]),
    );
    const comparing = corpus
      .split("\n")
      .filter((line) => line.includes("playwright test") && comparesScreenshots(line));
    const uncompared = visualProjects.filter(
      (project) => !comparing.some((line) => line.includes(`--project=${project}`)),
    );
    expect(uncompared).toEqual([]);
  });

  it("gives every manual-only surface a written reason", () => {
    for (const [surface, reason] of Object.entries(MANUAL_ONLY)) {
      expect(reason.length, `${surface} needs a reason`).toBeGreaterThan(60);
    }
  });
});

describe("nightly visual comparison (#1507)", () => {
  const workflow = load(
    readFileSync(path.join(root, ".github/workflows/nightly.yml"), "utf8"),
  ) as Workflow;
  const job = workflow.jobs?.["e2e-visual"];
  const steps = job?.steps ?? [];
  const lanes = steps.filter((step) => step.run?.includes("playwright test"));
  const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));

  it("can't be switched off or made to pass on a failure", () => {
    expect(lanes).toHaveLength(2);
    expect(job?.if).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    for (const lane of lanes) {
      expect(lane["continue-on-error"], lane.name).toBeUndefined();
      expect([undefined, `$\{{ !cancelled() }}`], lane.name).toContain(lane.if);
    }
  });

  it("runs on the runner image the linux baselines come from", () => {
    // The linux leg of update-visual-baselines.yml renders on ubuntu-latest.
    // Another Ubuntu release (the test fleet's, say) renders fonts differently
    // and fails every shot.
    expect(job?.["runs-on"]).toBe("ubuntu-latest");
  });

  it("compares desktop and device shots without ever writing a baseline", () => {
    expect(lanes.map((step) => step.run).join("\n")).toContain("--project=chromium-visual");
    const device = lanes.find((step) => step.run?.includes("--project=mobile-chromium"));
    expect(device?.run).toContain("--project=tablet-chromium");
    expect(device?.run).toMatch(/--grep "?@visual/);
    // Every lane runs even when an earlier one failed.
    for (const lane of lanes.slice(1)) expect(lane.if).toContain("!cancelled()");
    for (const lane of lanes) {
      expect(comparesScreenshots(lane.run ?? ""), lane.name).toBe(true);
      // A shot that only matches on the retry is a real diff at zero pixels.
      expect(lane.run).toContain("--fail-on-flaky-tests");
    }
  });

  it("has @visual shots for both device projects the lane names", () => {
    // Playwright drops a project that matches no tests and only fails when
    // the whole run is empty, so one tag going missing would go unnoticed.
    const spec = readFileSync(path.join(root, "tests/e2e/device-visual.spec.ts"), "utf8");
    const titles = [...spec.matchAll(/test\.describe\("([^"]*)"/g)].map((m) => m[1]);
    for (const device of ["@mobile", "@tablet"]) {
      expect(titles.some((title) => title.includes(device) && title.includes("@visual"))).toBe(
        true,
      );
    }
  });

  it("uploads each lane's diff report when a comparison fails", () => {
    for (const lane of lanes) {
      expect(lane.id, `${lane.name} needs an id`).toBeTruthy();
      expect(upload?.if).toContain(`steps.${lane.id}.outcome == 'failure'`);
    }
    // A failed comparison with no report to show for it is an error.
    expect(upload?.with?.["if-no-files-found"]).toBe("error");
    // Playwright writes its report under test-results/e2e-runs/<run id>/, so a
    // fixed run id per lane is what gives the upload a path to find (#1025).
    for (const lane of lanes) {
      const runId = lane.env?.PLAYWRIGHT_RUN_ID;
      expect(runId, `${lane.name} needs a fixed PLAYWRIGHT_RUN_ID`).toBeTruthy();
      expect(upload?.with?.path).toContain(`test-results/e2e-runs/${runId}/playwright-report/`);
    }
    expect(new Set(lanes.map((lane) => lane.env?.PLAYWRIGHT_RUN_ID)).size).toBe(lanes.length);
  });

  it("points the job summary at the baseline refresh workflow", () => {
    const summary = steps.find((step) => step.run?.includes("GITHUB_STEP_SUMMARY"));
    expect(summary?.if).toContain("!cancelled()");
    expect(summary?.run).toContain("update-visual-baselines.yml");
    // all, not changed: a post-release refresh must catch every drifted shot.
    expect(summary?.run).toContain("-f update_snapshots=all");
    // Both OS legs open their own PR when baselines move (#2484).
    expect(summary?.run).toContain("linux");
    expect(summary?.run).toContain("darwin");
    expect(summary?.run).not.toContain("opens a PR with the regenerated PNGs");
  });

  it("links the summary to the new-tool refresh steps in the developer guide (#1862, #2484, #2494)", () => {
    const summary = steps.find((step) => step.run?.includes("GITHUB_STEP_SUMMARY"));
    const anchor = "_5-visual-baselines";
    const updateWorkflow = load(
      readFileSync(path.join(root, ".github/workflows/update-visual-baselines.yml"), "utf8"),
    ) as Workflow;
    const regenerateRun =
      updateWorkflow.jobs?.["update-baselines"]?.steps?.find((s) => s.id === "regenerate")?.run ??
      "";
    const expectedLocalCmd = regenerateRun
      .trim()
      .replace('"--update-snapshots=$UPDATE_SNAPSHOTS"', "--update-snapshots=changed");
    expect(expectedLocalCmd).toBe(
      "pnpm playwright test tests/e2e/gui-visual-desktop.spec.ts tests/e2e/gui-visual-tools.spec.ts tests/e2e/device-visual.spec.ts --project=chromium-visual --project=mobile-chromium --project=tablet-chromium --update-snapshots=changed",
    );
    const unscopedLocalCmd = "pnpm playwright test --project=";
    expect(summary?.run).toContain(`docs.snapotter.com/guide/developer#${anchor}`);
    // A renamed heading would leave the link pointing at nothing.
    const guide = readFileSync(path.join(root, "apps/docs/guide/developer.md"), "utf8");
    expect(guide).toContain(`{#${anchor}}`);
    expect(guide).toContain("update-visual-baselines.yml");
    const section = guide.split(`{#${anchor}}`)[1]?.split("\n## ")[0] ?? "";
    expect(section).toContain("ubuntu-latest");
    expect(section).toContain("macos-latest");
    expect(section).toContain("visual-baselines-linux-");
    expect(section).toContain("visual-baselines-darwin-");
    expect(section).toContain("chore/visual-baselines-linux-");
    expect(section).toContain("chore/visual-baselines-darwin-");
    expect(section).toContain(expectedLocalCmd);
    expect(section).not.toContain(unscopedLocalCmd);
    expect(section).not.toContain("Linux baselines come from CI");
    expect(section).not.toContain("If you aren't on a Mac");

    const docsRoot = path.join(root, "apps/docs");
    const localeCodes = SUPPORTED_LOCALES.map((locale) => locale.code).filter(
      (code) => code !== "en",
    );
    expect(localeCodes).toHaveLength(20);
    for (const locale of localeCodes) {
      const localized = readFileSync(path.join(docsRoot, locale, "guide/developer.md"), "utf8");
      expect(localized, locale).toContain(`{#${anchor}}`);
      const localizedSection = localized.split(`{#${anchor}}`)[1]?.split("\n## ")[0] ?? "";
      expect(localizedSection, locale).toContain("update-visual-baselines.yml");
      expect(localizedSection, locale).toContain("ubuntu-latest");
      expect(localizedSection, locale).toContain("macos-latest");
      expect(localizedSection, locale).toContain("visual-baselines-linux-");
      expect(localizedSection, locale).toContain("visual-baselines-darwin-");
      expect(localizedSection, locale).toContain("chore/visual-baselines-linux-");
      expect(localizedSection, locale).toContain("chore/visual-baselines-darwin-");
      expect(localizedSection, locale).toContain(expectedLocalCmd);
      expect(localizedSection, locale).not.toContain(unscopedLocalCmd);
    }
  });

  it("keeps playwright.config.ts, gui-visual-tools.spec.ts, and device-visual.spec.ts comments aligned with the dual-OS workflow (#2484, #2487)", () => {
    const pwConfig = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
    expect(pwConfig.match(/linux \(ubuntu-latest\) and darwin \(macos-latest\)/g)).toHaveLength(2);
    expect(pwConfig).not.toContain(
      "darwin baselines serve local runs, and the linux set,\n// rendered by the update-visual-baselines workflow",
    );
    expect(pwConfig).not.toContain(
      "linux baselines (generated by the update-visual-baselines workflow)",
    );

    const visualToolsSpec = readFileSync(
      path.join(root, "tests/e2e/gui-visual-tools.spec.ts"),
      "utf8",
    );
    expect(visualToolsSpec).toContain("linux (ubuntu-latest)");
    expect(visualToolsSpec).toContain("darwin (macos-latest)");
    expect(visualToolsSpec).not.toContain("darwin baselines come from local runs, linux baselines");

    const deviceVisualSpec = readFileSync(
      path.join(root, "tests/e2e/device-visual.spec.ts"),
      "utf8",
    );
    expect(deviceVisualSpec).toContain("update-visual-baselines.yml");
    expect(deviceVisualSpec).toContain("linux (ubuntu-latest)");
    expect(deviceVisualSpec).toContain("darwin (macos-latest)");
    expect(deviceVisualSpec).not.toContain("darwin locally, linux via CI workflow");
  });
});
